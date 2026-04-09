const fs = require("node:fs/promises");
const path = require("node:path");

const DOWNLOADS_DIR_NAME = "downloads";
const GARMIN_BOOTSTRAP_MARKER = "var GarminAppBootstrap = ";
const SKU_URL_TEMPLATE = "https://www.garmin.com/es-MX/p/0000000/pn/{SKU}/";
const DEFAULT_HEADERS = {
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
  accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "accept-language": "es-MX,es;q=0.9,en;q=0.8",
};

function splitInputList(rawInput) {
  return Array.from(
    new Set(
      String(rawInput)
        .split(/[\n,;\s]+/)
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  );
}

function splitInputUrls(rawInput) {
  return splitInputList(rawInput);
}

function normalizeSku(value) {
  return String(value).trim().toUpperCase();
}

function splitInputSkus(rawInput) {
  return splitInputList(rawInput).map(normalizeSku);
}

function buildGarminProductUrlFromSku(sku) {
  return SKU_URL_TEMPLATE.replace("{SKU}", encodeURIComponent(normalizeSku(sku)));
}

function buildBatchFolderName() {
  const timestamp = new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");

  return `garmin-lote-${timestamp}`;
}

function sanitizePathSegment(value) {
  return String(value)
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 120);
}

function ensureAllowedGarminUrl(urlString) {
  let parsedUrl;

  try {
    parsedUrl = new URL(urlString);
  } catch (_error) {
    throw new Error(`La URL "${urlString}" no es válida.`);
  }

  const host = parsedUrl.hostname.toLowerCase();
  const allowedHosts = [
    "www.garmin.com.mx",
    "garmin.com.mx",
    "www.garmin.com",
    "garmin.com",
    "buy.garmin.com",
  ];

  if (!allowedHosts.includes(host)) {
    throw new Error(`La URL "${urlString}" no pertenece a Garmin.`);
  }

  return parsedUrl;
}

function resolveDownloadTargets({ urls, skus }) {
  const normalizedUrls = splitInputUrls(urls);
  const normalizedSkus = splitInputSkus(skus);
  const targets = [];
  const seen = new Set();

  for (const url of normalizedUrls) {
    const parsedUrl = ensureAllowedGarminUrl(url);
    const normalizedUrl = parsedUrl.toString();

    if (seen.has(normalizedUrl)) {
      continue;
    }

    seen.add(normalizedUrl);
    targets.push({
      inputType: "url",
      inputValue: normalizedUrl,
      url: normalizedUrl,
    });
  }

  for (const sku of normalizedSkus) {
    const url = buildGarminProductUrlFromSku(sku);

    if (seen.has(url)) {
      continue;
    }

    seen.add(url);
    targets.push({
      inputType: "sku",
      inputValue: sku,
      url,
    });
  }

  return targets;
}

async function fetchHtml(urlString) {
  const response = await fetch(urlString, {
    headers: DEFAULT_HEADERS,
    redirect: "follow",
  });

  const html = await response.text();

  if (!response.ok && !html.includes(GARMIN_BOOTSTRAP_MARKER)) {
    throw new Error(`Garmin respondió ${response.status} para ${urlString}.`);
  }

  return {
    finalUrl: response.url,
    html,
  };
}

function extractJsonObjectAfterMarker(source, marker) {
  const markerIndex = source.indexOf(marker);

  if (markerIndex === -1) {
    throw new Error("No encontré GarminAppBootstrap en la página.");
  }

  const startIndex = source.indexOf("{", markerIndex);

  if (startIndex === -1) {
    throw new Error("No pude ubicar el inicio del JSON embebido.");
  }

  let depth = 0;
  let inString = false;
  let isEscaped = false;
  let quoteChar = "";

  for (let index = startIndex; index < source.length; index += 1) {
    const char = source[index];

    if (inString) {
      if (isEscaped) {
        isEscaped = false;
        continue;
      }

      if (char === "\\") {
        isEscaped = true;
        continue;
      }

      if (char === quoteChar) {
        inString = false;
        quoteChar = "";
      }

      continue;
    }

    if (char === '"' || char === "'") {
      inString = true;
      quoteChar = char;
      continue;
    }

    if (char === "{") {
      depth += 1;
      continue;
    }

    if (char === "}") {
      depth -= 1;

      if (depth === 0) {
        return source.slice(startIndex, index + 1);
      }
    }
  }

  throw new Error("No pude cerrar el objeto GarminAppBootstrap.");
}

function parseGarminBootstrap(html) {
  const jsonText = extractJsonObjectAfterMarker(html, GARMIN_BOOTSTRAP_MARKER);

  try {
    return JSON.parse(jsonText);
  } catch (_error) {
    throw new Error("No pude interpretar los datos internos de la página.");
  }
}

function getSkuFromUrl(urlString) {
  const match = urlString.match(/\/pn\/([^/?#]+)/i);
  return match ? decodeURIComponent(match[1]) : null;
}

function resolveSelectedProduct(bootstrap, pageUrl) {
  const skuFromUrl = getSkuFromUrl(pageUrl);
  const selectedSku = skuFromUrl || bootstrap.sku;
  const skuMap = bootstrap.skus || {};
  const product = skuMap[selectedSku];

  if (!selectedSku || !product) {
    throw new Error("No pude identificar el SKU seleccionado en la página.");
  }

  return {
    sku: selectedSku,
    product,
  };
}

function buildCloudinaryAssetUrl(publicId, format, cloudName) {
  return `https://res.cloudinary.com/${cloudName}/image/upload/v1/${publicId}.${format}`;
}

function buildFileName(sku, index, format) {
  const safeSku = sanitizePathSegment(sku) || "garmin";
  const extension = sanitizePathSegment(format || "jpg") || "jpg";
  return `${safeSku}_${index + 1}.${extension}`;
}

function extractCarouselAssets(bootstrap, pageUrl) {
  const { sku, product } = resolveSelectedProduct(bootstrap, pageUrl);
  const gallery = product?.images?.mediaGallery;

  if (!Array.isArray(gallery) || gallery.length === 0) {
    throw new Error(`El SKU ${sku} no tiene imágenes en el carrusel principal.`);
  }

  const seen = new Set();
  const cloudName = bootstrap.cloudName || "it-production";
  const productName =
    product.productName ||
    product.globalProductName ||
    bootstrap.seoAttributes?.productDisplayName ||
    sku;

  const assets = gallery
    .filter((item) => item?.mediaType === "image" && item.publicId)
    .filter((item) => {
      if (seen.has(item.publicId)) {
        return false;
      }

      seen.add(item.publicId);
      return true;
    })
    .map((item, index) => ({
      position: Number(item.position ?? index),
      publicId: item.publicId,
      format: item.format || "jpg",
      url: buildCloudinaryAssetUrl(item.publicId, item.format || "jpg", cloudName),
      fileName: buildFileName(sku, index, item.format || "jpg"),
    }))
    .sort((left, right) => left.position - right.position);

  if (assets.length === 0) {
    throw new Error(`El SKU ${sku} no tiene imágenes descargables.`);
  }

  return {
    sku,
    productName,
    productId: product.productId || bootstrap.productId || null,
    assets,
  };
}

async function downloadFile(url, outputPath) {
  const response = await fetch(url, {
    headers: {
      "user-agent": DEFAULT_HEADERS["user-agent"],
      accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
      referer: "https://www.garmin.com/",
    },
  });

  if (!response.ok) {
    throw new Error(`No pude descargar ${url} (${response.status}).`);
  }

  const arrayBuffer = await response.arrayBuffer();
  await fs.writeFile(outputPath, Buffer.from(arrayBuffer));
}

async function downloadSingleProduct(target, options) {
  const parsedUrl = ensureAllowedGarminUrl(target.url);
  const { finalUrl, html } = await fetchHtml(parsedUrl.toString());
  const bootstrap = parseGarminBootstrap(html);
  const product = extractCarouselAssets(bootstrap, finalUrl);
  const outputDir = options.batchDir;

  await fs.mkdir(outputDir, { recursive: true });

  const savedFiles = [];
  const failedFiles = [];

  for (const asset of product.assets) {
    try {
      const outputPath = path.join(outputDir, asset.fileName);
      await downloadFile(asset.url, outputPath);

      savedFiles.push({
        fileName: asset.fileName,
        assetUrl: asset.url,
        absolutePath: outputPath,
        relativePath: path.relative(options.downloadsDir, outputPath),
        previewPath: `/downloads/${path
          .relative(options.downloadsDir, outputPath)
          .split(path.sep)
          .map(encodeURIComponent)
          .join("/")}`,
      });
    } catch (error) {
      failedFiles.push({
        fileName: asset.fileName,
        assetUrl: asset.url,
        message:
          error instanceof Error ? error.message : "No se pudo descargar la imagen.",
      });
    }
  }

  if (savedFiles.length === 0) {
    const firstFailure = failedFiles[0];
    throw new Error(
      firstFailure?.message ||
        `No se pudo descargar ninguna imagen para el SKU ${product.sku}.`,
    );
  }

  return {
    inputType: target.inputType,
    inputValue: target.inputValue,
    requestedUrl: target.url,
    finalUrl,
    sku: product.sku,
    productId: product.productId,
    productName: product.productName,
    outputDir,
    savedFiles,
    failedFiles,
  };
}

async function downloadFromGarminTargets(targets, options) {
  const batchFolderName = buildBatchFolderName();
  const batchDir = path.join(options.downloadsDir, batchFolderName);
  const successes = [];
  const failures = [];

  for (const target of targets) {
    try {
      const result = await downloadSingleProduct(target, {
        ...options,
        batchDir,
      });
      successes.push(result);
    } catch (error) {
      failures.push({
        inputType: target.inputType,
        inputValue: target.inputValue,
        url: target.url,
        message:
          error instanceof Error ? error.message : "No se pudo procesar la entrada.",
      });
    }
  }

  return {
    batchFolderName,
    batchDir,
    requestedCount: targets.length,
    successCount: successes.length,
    failureCount: failures.length,
    successes,
    failures,
  };
}

async function downloadFromGarminInputs(inputs, options) {
  const targets = resolveDownloadTargets(inputs);
  return downloadFromGarminTargets(targets, options);
}

function buildClientReport(summary) {
  return {
    batchFolderName: summary.batchFolderName,
    batchDir: summary.batchDir,
    requestedCount: summary.requestedCount,
    successCount: summary.successCount,
    failureCount: summary.failureCount,
    successes: summary.successes.map((result) => ({
      inputType: result.inputType,
      inputValue: result.inputValue,
      requestedUrl: result.requestedUrl,
      finalUrl: result.finalUrl,
      sku: result.sku,
      productId: result.productId,
      productName: result.productName,
      savedCount: result.savedFiles.length,
      failedCount: result.failedFiles.length,
      savedFiles: result.savedFiles.map((file) => ({
        fileName: file.fileName,
        previewPath: file.previewPath,
      })),
    })),
    failures: summary.failures,
  };
}

module.exports = {
  DOWNLOADS_DIR_NAME,
  buildBatchFolderName,
  buildClientReport,
  buildCloudinaryAssetUrl,
  buildGarminProductUrlFromSku,
  downloadFromGarminInputs,
  downloadFromGarminTargets,
  extractCarouselAssets,
  extractJsonObjectAfterMarker,
  getSkuFromUrl,
  normalizeSku,
  parseGarminBootstrap,
  resolveDownloadTargets,
  sanitizePathSegment,
  splitInputList,
  splitInputSkus,
  splitInputUrls,
};
