const form = document.querySelector("#download-form");
const urlsField = document.querySelector("#urls");
const skusField = document.querySelector("#skus");
const statusBox = document.querySelector("#status");
const resultsBox = document.querySelector("#results");
const submitButton = document.querySelector("#submit-button");

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function setStatus(message, type = "info") {
  statusBox.className = `status status--${type}`;
  statusBox.textContent = message;
}

function decodeReportHeader(headerValue) {
  if (!headerValue) {
    return null;
  }

  try {
    const normalized = headerValue.replaceAll("-", "+").replaceAll("_", "/");
    const padded = normalized.padEnd(
      normalized.length + ((4 - (normalized.length % 4)) % 4),
      "=",
    );
    return JSON.parse(atob(padded));
  } catch (_error) {
    return null;
  }
}

function getFileNameFromDisposition(headerValue) {
  const match = headerValue?.match(/filename="([^"]+)"/i);
  return match ? match[1] : "garmin-images.zip";
}

function triggerDownload(blob, fileName) {
  const downloadUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = downloadUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1500);
}

function renderResults(report) {
  if (!report) {
    resultsBox.innerHTML = "";
    return;
  }

  const successCards = report.successes
    .map(
      (result) => `
        <article class="result-card">
          <div class="result-card__header">
            <div>
              <p class="result-card__label">SKU</p>
              <h3>${escapeHtml(result.sku)}</h3>
            </div>
            <span class="chip">${result.savedCount} imágenes</span>
          </div>
          <p class="result-card__title">${escapeHtml(result.productName || "Producto Garmin")}</p>
          <p class="result-card__meta">
            Entrada: <code>${escapeHtml(result.inputValue)}</code>
          </p>
          ${
            result.failedCount
              ? `<p class="result-card__warning">Se omitieron ${result.failedCount} imagen(es) bloqueadas o no disponibles.</p>`
              : `<p class="result-card__success">Carrusel descargado completo.</p>`
          }
        </article>
      `,
    )
    .join("");

  const failureCards = report.failures
    .map(
      (failure) => `
        <article class="result-card result-card--error">
          <p class="result-card__label">No se pudo procesar</p>
          <h3>${escapeHtml(failure.inputValue || failure.url)}</h3>
          <p class="result-card__meta">${escapeHtml(failure.message)}</p>
        </article>
      `,
    )
    .join("");

  resultsBox.innerHTML = `${successCards}${failureCards}`;
}

async function parseJsonSafely(response) {
  try {
    return await response.json();
  } catch (_error) {
    return null;
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const urls = urlsField.value.trim();
  const skus = skusField.value.trim();

  if (!urls && !skus) {
    setStatus("Pegá al menos una URL o un SKU para continuar.", "error");
    return;
  }

  submitButton.disabled = true;
  resultsBox.innerHTML = "";
  setStatus("Extrayendo imágenes, armando carpetas por SKU y preparando el ZIP...", "loading");

  try {
    const response = await fetch("/api/archive", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ urls, skus }),
    });

    const contentType = response.headers.get("content-type") || "";

    if (!response.ok || contentType.includes("application/json")) {
      const payload = await parseJsonSafely(response);

      if (payload?.report) {
        renderResults(payload.report);
      }

      throw new Error(payload?.message || "No se pudo completar la descarga.");
    }

    const report = decodeReportHeader(response.headers.get("x-garmin-report"));
    const fileName = getFileNameFromDisposition(
      response.headers.get("content-disposition"),
    );
    const zipBlob = await response.blob();

    triggerDownload(zipBlob, fileName);
    renderResults(report);

    if (report?.failureCount) {
      setStatus(
        `ZIP descargado. ${report.successCount} entrada(s) salieron bien y ${report.failureCount} fallaron.`,
        "warning",
      );
    } else {
      setStatus(
        `ZIP descargado correctamente con ${report?.successCount || 0} entrada(s) procesadas.`,
        "success",
      );
    }
  } catch (error) {
    setStatus(
      error instanceof Error ? error.message : "Ocurrió un error inesperado.",
      "error",
    );
  } finally {
    submitButton.disabled = false;
  }
});
