const express = require("express");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const {
  DOWNLOADS_DIR_NAME,
  buildClientReport,
  downloadFromGarminInputs,
} = require("./src/garmin");

const app = express();
const PORT = process.env.PORT || 3000;
const ROOT_DIR = __dirname;
const DOWNLOADS_DIR =
  process.env.DOWNLOADS_DIR ||
  (process.env.K_SERVICE
    ? path.join(os.tmpdir(), "garmin-downloads")
    : path.join(ROOT_DIR, DOWNLOADS_DIR_NAME));

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(ROOT_DIR, "public")));
app.use("/downloads", express.static(DOWNLOADS_DIR));

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
    {
      downloadsDir: DOWNLOADS_DIR,
    },
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

async function ensureDownloadsDir() {
  await fs.mkdir(DOWNLOADS_DIR, { recursive: true });
}

async function start() {
  await ensureDownloadsDir();

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Garmin downloader disponible en http://localhost:${PORT}`);
    console.log(`Directorio de trabajo: ${DOWNLOADS_DIR}`);
  });
}

start().catch((error) => {
  console.error("No se pudo iniciar la app:", error);
  process.exitCode = 1;
});
