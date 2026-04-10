const express = require("express");
const path = require("node:path");

const {
  ASSET_HEADERS,
  buildClientReport,
  downloadFromGarminInputs,
  ensureAllowedAssetUrl,
  sanitizePathSegment,
} = require("./src/garmin");

const app = express();
const PORT = process.env.PORT || 3000;
const ROOT_DIR = __dirname;

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(ROOT_DIR, "public")));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

async function buildSummaryFromRequest(req) {
  const rawUrls = typeof req.body?.urls === "string" ? req.body.urls : "";
  const rawSkus = typeof req.body?.skus === "string" ? req.body.skus : "";

  const summary = await downloadFromGarminInputs(
    {
      urls: rawUrls,
      skus: rawSkus,
    },
    {},
  );

  return {
    summary,
    report: buildClientReport(summary),
  };
}

app.post("/api/download", async (req, res) => {
  try {
    const { report } = await buildSummaryFromRequest(req);

    if (report.requestedCount === 0) {
      return res.status(400).json({
        ok: false,
        message: "Pegá al menos una URL o un SKU de Garmin.",
      });
    }

    return res.json({
      ok: true,
      ...report,
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "No se pudo completar la descarga.",
    });
  }
});

app.get("/api/file", async (req, res) => {
  try {
    const rawUrl = typeof req.query.url === "string" ? req.query.url : "";
    const rawFileName =
      typeof req.query.filename === "string" ? req.query.filename : "garmin.jpg";

    if (!rawUrl) {
      return res.status(400).json({
        ok: false,
        message: "Falta la URL de la imagen.",
      });
    }

    const sourceUrl = ensureAllowedAssetUrl(rawUrl).toString();
    const safeFileName = sanitizePathSegment(rawFileName) || "garmin.jpg";
    const upstream = await fetch(sourceUrl, {
      headers: ASSET_HEADERS,
      redirect: "follow",
    });

    if (!upstream.ok) {
      return res.status(502).json({
        ok: false,
        message: `No se pudo descargar la imagen (${upstream.status}).`,
      });
    }

    const arrayBuffer = await upstream.arrayBuffer();
    res.setHeader(
      "content-type",
      upstream.headers.get("content-type") || "application/octet-stream",
    );
    res.setHeader(
      "content-disposition",
      `attachment; filename="${safeFileName}"`,
    );
    return res.send(Buffer.from(arrayBuffer));
  } catch (error) {
    return res.status(400).json({
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "No se pudo obtener la imagen solicitada.",
    });
  }
});

async function start() {
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Garmin downloader disponible en http://localhost:${PORT}`);
  });
}

start().catch((error) => {
  console.error("No se pudo iniciar la app:", error);
  process.exitCode = 1;
});
