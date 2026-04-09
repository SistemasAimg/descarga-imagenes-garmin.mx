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

function renderFileLinks(savedFiles) {
  if (!Array.isArray(savedFiles) || savedFiles.length === 0) {
    return "";
  }

  const items = savedFiles
    .map(
      (file) => `
        <li>
          <a href="${escapeHtml(file.previewPath)}" target="_blank" rel="noreferrer">
            ${escapeHtml(file.fileName)}
          </a>
        </li>
      `,
    )
    .join("");

  return `
    <div class="result-card__files">
      <p class="result-card__label">Archivos generados</p>
      <ul class="result-card__file-list">${items}</ul>
    </div>
  `;
}

function renderResults(report) {
  if (!report) {
    resultsBox.innerHTML = "";
    return;
  }

  const summaryCard = `
    <article class="result-card result-card--summary">
      <div class="result-card__header">
        <div>
          <p class="result-card__label">Carpeta del lote</p>
          <h3>${escapeHtml(report.batchFolderName || "garmin-lote")}</h3>
        </div>
        <span class="chip">${report.successCount} entrada(s) OK</span>
      </div>
      <p class="result-card__meta">
        Se procesaron ${report.requestedCount} entrada(s) en total y
        ${report.failureCount} fallaron.
      </p>
    </article>
  `;

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
          <p class="result-card__meta">Entrada: <code>${escapeHtml(result.inputValue)}</code></p>
          ${
            result.failedCount
              ? `<p class="result-card__warning">Se omitieron ${result.failedCount} imagen(es) bloqueadas o no disponibles.</p>`
              : `<p class="result-card__success">Carrusel descargado completo.</p>`
          }
          ${renderFileLinks(result.savedFiles)}
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

  resultsBox.innerHTML = `${summaryCard}${successCards}${failureCards}`;
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
  setStatus(
    "Extrayendo imágenes y armando una sola carpeta con todo el lote...",
    "loading",
  );

  try {
    const response = await fetch("/api/download", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ urls, skus }),
    });

    const payload = await parseJsonSafely(response);

    if (!response.ok || !payload?.ok) {
      if (payload) {
        renderResults(payload);
      }

      throw new Error(payload?.message || "No se pudo completar la descarga.");
    }

    renderResults(payload);

    if (payload.failureCount) {
      setStatus(
        `Carpeta generada: ${payload.batchFolderName}. ${payload.successCount} entrada(s) salieron bien y ${payload.failureCount} fallaron.`,
        "warning",
      );
    } else {
      setStatus(
        `Carpeta generada correctamente: ${payload.batchFolderName}.`,
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
