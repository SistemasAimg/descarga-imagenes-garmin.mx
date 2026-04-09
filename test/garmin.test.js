const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildArchiveFileName,
  buildClientReport,
  buildCloudinaryAssetUrl,
  buildGarminProductUrlFromSku,
  extractCarouselAssets,
  extractJsonObjectAfterMarker,
  getSkuFromUrl,
  normalizeSku,
  parseGarminBootstrap,
  resolveDownloadTargets,
  splitInputSkus,
  splitInputUrls,
} = require("../src/garmin");

test("splitInputUrls elimina vacíos y duplicados", () => {
  assert.deepEqual(splitInputUrls("https://a\n\nhttps://b https://a"), [
    "https://a",
    "https://b",
  ]);
});

test("splitInputSkus normaliza mayúsculas", () => {
  assert.deepEqual(splitInputSkus("010-02969-02\n010-d2101-00"), [
    "010-02969-02",
    "010-D2101-00",
  ]);
});

test("getSkuFromUrl detecta el SKU desde /pn/", () => {
  assert.equal(
    getSkuFromUrl("https://www.garmin.com/es-MX/p/904277/pn/010-D2101-00/"),
    "010-D2101-00",
  );
});

test("buildGarminProductUrlFromSku arma la URL base con 0000000", () => {
  assert.equal(
    buildGarminProductUrlFromSku("010-02969-02"),
    "https://www.garmin.com/es-MX/p/0000000/pn/010-02969-02/",
  );
});

test("resolveDownloadTargets combina URLs y SKUs sin duplicar", () => {
  const targets = resolveDownloadTargets({
    urls: "https://www.garmin.com/es-MX/p/904277/pn/010-D2101-00/",
    skus: "010-02969-02 010-D2101-00",
  });

  assert.equal(targets.length, 3);
  assert.equal(targets[0].inputType, "url");
  assert.equal(targets[1].inputType, "sku");
  assert.equal(targets[2].inputValue, "010-D2101-00");
});

test("buildCloudinaryAssetUrl arma la URL real de la imagen", () => {
  assert.equal(
    buildCloudinaryAssetUrl(
      "Product_Images/es_MX/products/010-02969-02/v/cf-xl",
      "jpg",
      "it-production",
    ),
    "https://res.cloudinary.com/it-production/image/upload/v1/Product_Images/es_MX/products/010-02969-02/v/cf-xl.jpg",
  );
});

test("extractJsonObjectAfterMarker soporta strings con llaves", () => {
  const html =
    '<script>var GarminAppBootstrap = {"sku":"010-1","text":"texto con { llaves }"}; var envSettings = {};</script>';

  assert.equal(
    extractJsonObjectAfterMarker(html, "var GarminAppBootstrap = "),
    '{"sku":"010-1","text":"texto con { llaves }"}',
  );
});

test("parseGarminBootstrap y extractCarouselAssets resuelven el SKU seleccionado", () => {
  const html = `
    <script>
      var GarminAppBootstrap = {
        "sku": "010-02969-02",
        "productId": "123456",
        "cloudName": "it-production",
        "skus": {
          "010-02969-02": {
            "productId": "123456",
            "productName": "Edge de prueba",
            "images": {
              "mediaGallery": [
                {
                  "publicId": "Product_Images/es_MX/products/010-02969-02/v/cf-xl",
                  "mediaType": "image",
                  "format": "jpg",
                  "position": "0"
                },
                {
                  "publicId": "Product_Images/es_MX/products/010-02969-02/v/rf-xl",
                  "mediaType": "image",
                  "format": "jpg",
                  "position": "1"
                }
              ]
            }
          }
        }
      };
    </script>
  `;

  const bootstrap = parseGarminBootstrap(html);
  const result = extractCarouselAssets(
    bootstrap,
    "https://www.garmin.com/es-MX/p/123456/pn/010-02969-02/",
  );

  assert.equal(result.sku, "010-02969-02");
  assert.equal(result.productName, "Edge de prueba");
  assert.equal(result.assets.length, 2);
  assert.equal(result.assets[0].fileName, "01-cf-xl.jpg");
  assert.equal(
    result.assets[0].url,
    "https://res.cloudinary.com/it-production/image/upload/v1/Product_Images/es_MX/products/010-02969-02/v/cf-xl.jpg",
  );
});

test("buildClientReport compacta el resumen para el frontend", () => {
  const report = buildClientReport({
    requestedCount: 1,
    successCount: 1,
    failureCount: 0,
    successes: [
      {
        inputType: "sku",
        inputValue: "010-02969-02",
        requestedUrl: "https://www.garmin.com/es-MX/p/0000000/pn/010-02969-02/",
        finalUrl: "https://www.garmin.com/es-MX/p/0000000/pn/010-02969-02/",
        sku: "010-02969-02",
        productId: "123456",
        productName: "Edge de prueba",
        savedFiles: [{ fileName: "01-cf-xl.jpg" }, { fileName: "02-rf-xl.jpg" }],
        failedFiles: [{ fileName: "03-x.jpg" }],
      },
    ],
    failures: [],
  });

  assert.equal(report.successes[0].savedCount, 2);
  assert.equal(report.successes[0].failedCount, 1);
});

test("buildArchiveFileName usa el SKU cuando hay una sola descarga", () => {
  const fileName = buildArchiveFileName({
    successes: [{ sku: "010-02969-02" }],
  });

  assert.match(fileName, /^garmin-010-02969-02-\d{8}T\d{6}Z\.zip$/);
});

test("normalizeSku convierte a mayúsculas", () => {
  assert.equal(normalizeSku("010-d2101-00"), "010-D2101-00");
});
