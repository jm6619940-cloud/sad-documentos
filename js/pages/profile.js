import { ROLE_LABELS, ROLES } from "../utils/constants.js";
import { pageTitle } from "../components/layout.js";
import { escapeAttr, escapeHtml, textOrDash } from "../utils/security.js";
import { dataService } from "../services/dataService.js?v=20260713-5";
import { toast } from "../components/toast.js?v=20260708-12";

const OPENCV_JS_URL = "https://cdn.jsdelivr.net/npm/@techstark/opencv-js@4.10.0-release.1/dist/opencv.js";
let openCvLoader = null;

export function renderProfile({ user, data, refresh }) {
  const departamento = data.departamentos.find((item) => item.id === user.departamento_id);
  const signature = data.firmas_usuarios?.find((item) => item.usuario_id === user.id);
  const canRegisterSignature = [ROLES.APPROVER, ROLES.ADMIN].includes(user.rol);
  const needsSecuritySetup = canRegisterSignature && !signature?.pin_updated_at;
  const activeDepartments = data.departamentos.filter((item) => item.activo !== false);
  const page = document.createElement("div");
  page.className = "grid";
  page.append(pageTitle("Perfil", "Informacion de tu cuenta."));
  page.insertAdjacentHTML("beforeend", `
    <section class="panel">
      <div class="compact-section-header">
        <div>
          <h3>Datos personales</h3>
          <p>Estos datos quedan asociados a tus acciones y evidencias dentro del sistema.</p>
        </div>
        ${user.onboarding_completed_at ? "<span class='badge Aprobado'>Verificado</span>" : "<span class='badge Pendiente'>Pendiente</span>"}
      </div>
      <form class="form" data-profile-form>
        <div class="row g-3">
          <label class="field col-12 col-md-6"><span>Nombre</span><input class="input form-control" name="nombre" required value="${escapeAttr(user.nombre || "")}"></label>
          <label class="field col-12 col-md-6"><span>Apellido</span><input class="input form-control" name="apellido" required value="${escapeAttr(user.apellido || "")}"></label>
          <label class="field col-12 col-md-6"><span>Telefono</span><input class="input form-control" name="telefono" autocomplete="tel" value="${escapeAttr(user.telefono || "")}"></label>
          <label class="field col-12 col-md-6"><span>Documento de identidad</span><input class="input form-control" name="documento_identidad" value="${escapeAttr(user.documento_identidad || "")}"></label>
          <label class="field col-12 col-md-6"><span>Cargo</span><input class="input form-control" name="cargo" value="${escapeAttr(user.cargo || "")}"></label>
          <label class="field col-12 col-md-6"><span>Departamento</span><select class="form-select" name="departamento_id">
            <option value="">Sin departamento</option>
            ${activeDepartments.map((item) => `<option value="${escapeAttr(item.id)}" ${item.id === user.departamento_id ? "selected" : ""}>${escapeHtml(item.nombre)}</option>`).join("")}
            ${departamento && departamento.activo === false ? `<option value="${escapeAttr(departamento.id)}" selected>${escapeHtml(`${departamento.nombre} (inactivo)`)}</option>` : ""}
          </select></label>
        </div>
        <div class="detail-grid detail-grid-compact">
          <div class="detail-box"><strong>Correo verificado</strong><p>${escapeHtml(user.correo)}</p></div>
          <div class="detail-box"><strong>Rol</strong><p>${escapeHtml(ROLE_LABELS[user.rol] || user.rol)}</p></div>
        </div>
        <div class="toolbar" data-profile-actions>
          ${user.onboarding_completed_at
            ? "<span class='saved-inline-status'>Datos guardados</span>"
            : "<button class='button btn btn-primary' type='submit'>Guardar datos</button>"}
        </div>
      </form>
    </section>
    ${canRegisterSignature ? `
      <section class="panel signature-panel">
        <div class="compact-section-header">
          <div>
            <h3>Firma avanzada interna</h3>
            <p>Tu firma se protege con PIN y cada uso registra usuario, fecha, IP, navegador, version y metodo de autenticacion.</p>
          </div>
          ${signature?.pin_updated_at ? "<span class='badge Aprobado'>PIN activo</span>" : "<span class='badge Pendiente'>Requiere PIN</span>"}
        </div>
        ${needsSecuritySetup ? "<p class='inline-warning'>Para aprobar documentos debes crear tu firma y un PIN numerico.</p>" : ""}
        <div class="signature-overview">
          <div class="signature-current ${signature ? "" : "is-empty"}">
            <span>${signature ? `Firma actual · version ${escapeHtml(signature.version || 1)}` : "Firma pendiente"}</span>
            ${signature
              ? `<img src="${escapeAttr(signature.firma_data_url)}" alt="Firma registrada">`
              : "<p>Registra una firma dibujada o escaneada para poder firmar documentos internos.</p>"}
          </div>
          <div class="signature-cache-card">
            <strong>Escaner local</strong>
            <p>OpenCV se guarda en cache al instalar la app. La firma se procesa en este dispositivo y no se envia a terceros.</p>
          </div>
        </div>
        <form class="signature-form" data-signature-form>
          <div class="signature-workspace">
            <div class="signature-method-card">
              <span class="signature-card-label">Metodo de captura</span>
              <div class="signature-mode-switch" role="group" aria-label="Metodo para registrar firma">
                <label>
                  <input type="radio" name="signature_mode" value="draw" checked data-signature-mode>
                  <span>Dibujar</span>
                </label>
                <label>
                  <input type="radio" name="signature_mode" value="scan" data-signature-mode>
                  <span>Escanear firma</span>
                </label>
              </div>
              <div class="signature-scan-panel" data-signature-scan-panel hidden>
                <span>Foto o imagen de tu firma</span>
                <div class="signature-scan-actions">
                  <button class="button btn btn-primary" type="button" data-toggle-signature-source>Galeria / foto</button>
                  <div class="signature-source-menu" data-signature-source-menu hidden>
                    <label class="button secondary btn btn-outline-secondary">
                      <span>Elegir de galeria</span>
                      <input type="file" accept="image/*" data-signature-upload data-signature-upload-source="gallery">
                    </label>
                    <label class="button secondary btn btn-outline-secondary">
                      <span>Tomar foto</span>
                      <input type="file" accept="image/*" capture="environment" data-signature-upload data-signature-upload-source="camera">
                    </label>
                  </div>
                </div>
                <p>Usa papel claro y buena luz. El escaner local extrae solo los trazos y descarta sombras, lineas del papel y ruido.</p>
                <div class="signature-cleanup-actions" data-signature-cleanup-actions hidden>
                  <button class="button secondary btn btn-outline-secondary" type="button" data-toggle-signature-eraser>Activar borrador</button>
                  <button class="button secondary btn btn-outline-secondary" type="button" data-reset-signature-scan>Revertir escaneo</button>
                </div>
              </div>
            </div>
            <label class="field signature-preview-card">
              <span data-signature-pad-label>${signature ? "Dibuja la nueva firma" : "Dibuja tu firma"}</span>
              <canvas class="signature-pad" width="860" height="260" data-signature-pad></canvas>
            </label>
          </div>
          <details class="signature-advanced-controls">
            <summary>Ajustes avanzados</summary>
            <div class="signature-controls">
              <label class="signature-control">
                <span>Grosor del lapiz</span>
                <div>
                  <input type="range" min="1.5" max="8" step="0.5" value="2.6" data-signature-stroke>
                  <output data-signature-stroke-label>2.6 px</output>
                </div>
              </label>
              <label class="signature-control">
                <span>Tamano del area</span>
                <div>
                  <input type="range" min="180" max="340" step="20" value="260" data-signature-pad-size>
                  <output data-signature-pad-size-label>260 px</output>
                </div>
              </label>
              <label class="signature-control">
                <span>Tamano del borrador</span>
                <div>
                  <input type="range" min="8" max="52" step="2" value="20" data-signature-eraser-size>
                  <output data-signature-eraser-size-label>20 px</output>
                </div>
              </label>
            </div>
          </details>
          <div class="signature-security-row">
            ${signature?.pin_updated_at ? `
              <label class="field"><span>PIN actual</span><input class="input form-control" type="password" name="pin_actual" inputmode="numeric" maxlength="12" autocomplete="off" required></label>
            ` : `
              <label class="field"><span>Crea tu PIN de firma</span><input class="input form-control" type="password" name="pin_nuevo" inputmode="numeric" maxlength="12" autocomplete="off" required></label>
            `}
          </div>
          <div class="toolbar">
            <button class="button secondary btn btn-outline-secondary" type="button" data-clear-signature>Borrar firma</button>
            <button class="button btn btn-primary" type="submit">${signature ? "Reemplazar firma" : "Guardar firma y PIN"}</button>
          </div>
        </form>
      </section>
    ` : ""}
  `);

  const form = page.querySelector("[data-signature-form]");
  const profileForm = page.querySelector("[data-profile-form]");
  profileForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submitter = event.submitter;
    if (!submitter) return;
    submitter.disabled = true;
    const previousLabel = submitter.textContent;
    submitter.textContent = "Guardando...";
    try {
      const values = Object.fromEntries(new FormData(profileForm).entries());
      await dataService.completeOnboarding(values, null);
      const actions = profileForm.querySelector("[data-profile-actions]");
      if (actions) actions.innerHTML = "<span class='saved-inline-status'>Datos guardados</span>";
      toast("Datos guardados correctamente.", "success");
      await refresh();
    } catch (error) {
      toast(error.message || "No fue posible guardar tus datos.", "error");
    } finally {
      submitter.textContent = previousLabel;
      submitter.disabled = false;
    }
  });
  if (form) setupSignaturePad({ form, user, signature, refresh });
  return page;
}

function setupSignaturePad({ form, user, signature, refresh }) {
  const canvas = form.querySelector("[data-signature-pad]");
  const context = canvas.getContext("2d");
  const strokeInput = form.querySelector("[data-signature-stroke]");
  const strokeLabel = form.querySelector("[data-signature-stroke-label]");
  const padSizeInput = form.querySelector("[data-signature-pad-size]");
  const padSizeLabel = form.querySelector("[data-signature-pad-size-label]");
  const eraserSizeInput = form.querySelector("[data-signature-eraser-size]");
  const eraserSizeLabel = form.querySelector("[data-signature-eraser-size-label]");
  const scanPanel = form.querySelector("[data-signature-scan-panel]");
  const uploadInputs = Array.from(form.querySelectorAll("[data-signature-upload]"));
  const sourceButton = form.querySelector("[data-toggle-signature-source]");
  const sourceMenu = form.querySelector("[data-signature-source-menu]");
  const cleanupActions = form.querySelector("[data-signature-cleanup-actions]");
  const eraserButton = form.querySelector("[data-toggle-signature-eraser]");
  const resetScanButton = form.querySelector("[data-reset-signature-scan]");
  const padLabel = form.querySelector("[data-signature-pad-label]");
  let drawing = false;
  let hasInk = false;
  let signatureMode = form.elements.signature_mode?.value || "draw";
  let strokeWidth = Number(strokeInput?.value || 2.6);
  let eraserSize = Number(eraserSizeInput?.value || 20);
  let scanEraseMode = false;
  let scanSnapshot = null;
  let eraserPoint = null;

  function clearPad() {
    context.clearRect(0, 0, canvas.width, canvas.height);
    hasInk = false;
    scanSnapshot = null;
    setScanEraseMode(false);
    if (cleanupActions) cleanupActions.hidden = true;
  }

  function applyDrawingSettings(ratio = Math.max(window.devicePixelRatio || 1, 1)) {
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.lineWidth = strokeWidth;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.strokeStyle = "#1d4ed8";
  }

  function snapshotCanvas() {
    if (!hasInk || !canvas.width || !canvas.height) return null;
    const snapshot = document.createElement("canvas");
    snapshot.width = canvas.width;
    snapshot.height = canvas.height;
    snapshot.getContext("2d").drawImage(canvas, 0, 0);
    return snapshot;
  }

  function resizeCanvas({ preserve = false } = {}) {
    const snapshot = preserve ? snapshotCanvas() : null;
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.max(320, Math.floor(rect.width * ratio));
    canvas.height = Math.max(150, Math.floor(rect.height * ratio));
    if (snapshot) {
      context.save();
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(snapshot, 0, 0, canvas.width, canvas.height);
      context.restore();
    }
    applyDrawingSettings(ratio);
  }

  function updateStroke() {
    strokeWidth = Number(strokeInput?.value || 2.6);
    context.lineWidth = strokeWidth;
    if (strokeLabel) strokeLabel.textContent = `${strokeWidth.toFixed(1)} px`;
  }

  function updatePadSize() {
    const nextHeight = Number(padSizeInput?.value || 260);
    if (padSizeLabel) padSizeLabel.textContent = `${nextHeight} px`;
    canvas.style.height = `${nextHeight}px`;
    const hadInk = hasInk;
    resizeCanvas({ preserve: hadInk });
    hasInk = hadInk;
    if (hadInk) {
      toast("El area cambio de tamano y se conservo la firma.", "info");
    }
  }

  function updateEraserSize() {
    eraserSize = Number(eraserSizeInput?.value || 20);
    if (eraserSizeLabel) eraserSizeLabel.textContent = `${Math.round(eraserSize)} px`;
  }

  function point(event) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    };
  }

  function eraseAt(position) {
    context.save();
    context.globalCompositeOperation = "destination-out";
    context.beginPath();
    context.arc(position.x, position.y, eraserSize / 2, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }

  function eraseLine(to) {
    if (!eraserPoint) {
      eraseAt(to);
      eraserPoint = to;
      return;
    }
    context.save();
    context.globalCompositeOperation = "destination-out";
    context.lineCap = "round";
    context.lineJoin = "round";
    context.lineWidth = eraserSize;
    context.beginPath();
    context.moveTo(eraserPoint.x, eraserPoint.y);
    context.lineTo(to.x, to.y);
    context.stroke();
    context.restore();
    eraserPoint = to;
  }

  function setScanEraseMode(enabled) {
    scanEraseMode = Boolean(enabled && signatureMode === "scan" && hasInk);
    canvas.classList.toggle("is-erasing", scanEraseMode);
    if (eraserButton) {
      eraserButton.classList.toggle("is-active", scanEraseMode);
      eraserButton.textContent = scanEraseMode ? "Terminar limpieza" : "Activar borrador";
    }
    if (padLabel) {
      padLabel.textContent = scanEraseMode ? "Borra manualmente puntos o rayas" : (signatureMode === "scan" ? "Vista previa digitalizada" : (signature ? "Dibuja la nueva firma" : "Dibuja tu firma"));
    }
  }

  canvas.addEventListener("pointerdown", (event) => {
    if (signatureMode === "scan") {
      if (!scanEraseMode) return;
      event.preventDefault();
      drawing = true;
      canvas.setPointerCapture(event.pointerId);
      eraserPoint = point(event);
      eraseAt(eraserPoint);
      return;
    }
    if (signatureMode !== "draw") return;
    event.preventDefault();
    drawing = true;
    hasInk = true;
    canvas.setPointerCapture(event.pointerId);
    const start = point(event);
    context.beginPath();
    context.moveTo(start.x, start.y);
  });

  canvas.addEventListener("pointermove", (event) => {
    if (!drawing) return;
    event.preventDefault();
    const next = point(event);
    if (signatureMode === "scan" && scanEraseMode) {
      eraseLine(next);
      return;
    }
    context.lineTo(next.x, next.y);
    context.stroke();
  });

  ["pointerup", "pointercancel", "pointerleave"].forEach((type) => {
    canvas.addEventListener(type, () => {
      drawing = false;
      eraserPoint = null;
    });
  });

  form.querySelector("[data-clear-signature]").addEventListener("click", () => {
    clearPad();
    uploadInputs.forEach((input) => {
      input.value = "";
    });
  });

  strokeInput?.addEventListener("input", updateStroke);
  padSizeInput?.addEventListener("input", updatePadSize);
  eraserSizeInput?.addEventListener("input", updateEraserSize);
  function setSignatureMode(mode) {
    signatureMode = mode;
    scanPanel.hidden = mode !== "scan";
    if (mode !== "scan" && sourceMenu) sourceMenu.hidden = true;
    setScanEraseMode(false);
    canvas.classList.toggle("is-readonly", mode === "scan");
    if (padLabel) padLabel.textContent = mode === "scan" ? "Vista previa digitalizada" : (signature ? "Dibuja la nueva firma" : "Dibuja tu firma");
  }

  form.querySelectorAll("[data-signature-mode]").forEach((input) => {
    input.addEventListener("change", () => {
      setSignatureMode(form.elements.signature_mode.value);
    });
  });
  sourceButton?.addEventListener("click", () => {
    if (!sourceMenu) return;
    sourceMenu.hidden = !sourceMenu.hidden;
  });
  eraserButton?.addEventListener("click", () => {
    if (!hasInk) {
      toast("Primero escanea una firma para poder limpiarla.", "warning");
      return;
    }
    setScanEraseMode(!scanEraseMode);
  });
  resetScanButton?.addEventListener("click", () => {
    if (!scanSnapshot) {
      toast("No hay un escaneo previo para revertir.", "info");
      return;
    }
    const image = new Image();
    image.onload = () => {
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.clientWidth, canvas.clientHeight);
      hasInk = true;
      setScanEraseMode(false);
      toast("Escaneo restaurado.", "success");
    };
    image.src = scanSnapshot;
  });
  uploadInputs.forEach((uploadInput) => {
    uploadInput.addEventListener("change", async () => {
      const file = uploadInput.files?.[0];
      if (!file) return;
      if (!file.type.startsWith("image/")) {
        toast("Selecciona una imagen valida de tu firma.", "warning");
        uploadInput.value = "";
        return;
      }
      try {
        const processed = await processScannedSignature(file);
        drawProcessedSignatureOnPad({ canvas, context, processed });
        hasInk = true;
        scanSnapshot = canvas.toDataURL("image/png");
        if (cleanupActions) cleanupActions.hidden = false;
        setScanEraseMode(false);
        uploadInputs.forEach((input) => {
          if (input !== uploadInput) input.value = "";
        });
        if (sourceMenu) sourceMenu.hidden = true;
        toast("Firma escaneada y digitalizada.", "success");
      } catch (error) {
        uploadInput.value = "";
        toast(error.message || "No fue posible digitalizar la firma.", "error");
      }
    });
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submitter = event.submitter;
    if (!hasInk) {
      toast("Dibuja o escanea tu firma antes de guardarla.", "warning");
      return;
    }
    submitter.disabled = true;
    const previousLabel = submitter.textContent;
    submitter.textContent = "Guardando...";
    try {
      const values = Object.fromEntries(new FormData(form).entries());
      const currentPin = String(values.pin_actual || "").trim();
      const newPin = String(values.pin_nuevo || "").trim();
      if (signature?.pin_updated_at && !/^[0-9]{4,12}$/.test(currentPin)) {
        throw new Error("Ingresa tu PIN actual.");
      }
      if (!signature?.pin_updated_at && !/^[0-9]{4,12}$/.test(newPin)) {
        throw new Error("Crea un PIN numerico de 4 a 12 digitos.");
      }
      await dataService.saveUserSignature(user.id, canvas.toDataURL("image/png"), { currentPin, newPin });
      toast("Firma guardada correctamente.", "success");
      await refresh();
    } catch (error) {
      toast(error.message || "No fue posible guardar la firma.", "error");
    } finally {
      submitter.textContent = previousLabel;
      submitter.disabled = false;
    }
  });

  requestAnimationFrame(() => {
    updateStroke();
    updatePadSize();
    updateEraserSize();
    setSignatureMode(signatureMode);
  });
}

async function processScannedSignature(file) {
  const imageUrl = URL.createObjectURL(file);
  try {
    const image = await loadImage(imageUrl);
    const maxSide = 2400;
    const sourceWidth = image.naturalWidth || image.width;
    const sourceHeight = image.naturalHeight || image.height;
    const scale = Math.min(1, maxSide / Math.max(sourceWidth, sourceHeight));
    const width = Math.max(1, Math.round(sourceWidth * scale));
    const height = Math.max(1, Math.round(sourceHeight * scale));
    const sourceCanvas = document.createElement("canvas");
    sourceCanvas.width = width;
    sourceCanvas.height = height;
    const sourceContext = sourceCanvas.getContext("2d", { willReadFrequently: true });
    sourceContext.drawImage(image, 0, 0, width, height);

    const extraction = extractSignatureInkByInkColor(sourceContext, width, height)
      || extractSignatureInkLoose(sourceContext, width, height)
      || await extractSignatureInkWithOpenCv(sourceCanvas).catch(() => null)
      || (() => {
        const fallbackExtraction = extractSignatureInk(sourceContext, width, height);
        return fallbackExtraction && validateSignatureExtraction(fallbackExtraction, width, height) ? fallbackExtraction : null;
      })()
      || extractSignatureInkUltraLoose(sourceContext, width, height);
    if (!extraction) throw new Error("No detectamos la firma. Usa una foto con fondo claro y tinta visible.");
    const { mask, alphaMap, bounds } = extraction;

    const padding = 18;
    const cropX = Math.max(0, bounds.x - padding);
    const cropY = Math.max(0, bounds.y - padding);
    const cropRight = Math.min(width, bounds.x + bounds.width + padding);
    const cropBottom = Math.min(height, bounds.y + bounds.height + padding);
    const cropWidth = Math.max(1, cropRight - cropX);
    const cropHeight = Math.max(1, cropBottom - cropY);
    const pixels = sourceContext.getImageData(cropX, cropY, cropWidth, cropHeight);
    const output = new ImageData(cropWidth, cropHeight);

    for (let index = 0; index < pixels.data.length; index += 4) {
      const alpha = pixels.data[index + 3];
      const pixelOffset = index / 4;
      const sourceX = cropX + (pixelOffset % cropWidth);
      const sourceY = cropY + Math.floor(pixelOffset / cropWidth);
      const sourceIndex = sourceY * width + sourceX;
      const inkAlpha = mask[sourceIndex] && alpha > 10 ? alphaMap[sourceIndex] : 0;
      const color = preserveScannedInkTone(pixels.data[index], pixels.data[index + 1], pixels.data[index + 2]);
      output.data[index] = color.red;
      output.data[index + 1] = color.green;
      output.data[index + 2] = color.blue;
      output.data[index + 3] = inkAlpha;
    }

    const outputCanvas = document.createElement("canvas");
    outputCanvas.width = cropWidth;
    outputCanvas.height = cropHeight;
    outputCanvas.getContext("2d").putImageData(output, 0, 0);
    return renderSmoothSignatureCanvas(outputCanvas);
  } finally {
    URL.revokeObjectURL(imageUrl);
  }
}

function preserveScannedInkTone(red, green, blue) {
  const brightness = (red + green + blue) / 3;
  const lift = brightness > 205 ? 0.82 : brightness > 165 ? 0.92 : 1;
  return {
    red: Math.max(0, Math.min(255, Math.round(red * lift))),
    green: Math.max(0, Math.min(255, Math.round(green * lift))),
    blue: Math.max(0, Math.min(255, Math.round(blue * lift)))
  };
}

function extractSignatureInk(context, width, height) {
  const pixels = context.getImageData(0, 0, width, height).data;
  const gray = new Uint8ClampedArray(width * height);
  const candidates = new Uint8Array(width * height);
  const visited = new Uint8Array(width * height);
  const mask = new Uint8Array(width * height);
  const alphaMap = new Uint8ClampedArray(width * height);
  const radius = Math.max(10, Math.round(Math.min(width, height) * 0.018));

  for (let index = 0; index < gray.length; index += 1) {
    const pixelIndex = index * 4;
    gray[index] = Math.round((pixels[pixelIndex] * 0.299) + (pixels[pixelIndex + 1] * 0.587) + (pixels[pixelIndex + 2] * 0.114));
  }

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = y * width + x;
      const pixelIndex = index * 4;
      const alpha = pixels[pixelIndex + 3];
      if (alpha <= 10) continue;
      const red = pixels[pixelIndex];
      const green = pixels[pixelIndex + 1];
      const blue = pixels[pixelIndex + 2];
      const brightness = gray[index];
      const localBackground = localGrayAverage(gray, width, height, x, y, radius);
      const localContrast = localBackground - brightness;
      const edge = Math.max(
        Math.abs(brightness - gray[index - 1]),
        Math.abs(brightness - gray[index + 1]),
        Math.abs(brightness - gray[index - width]),
        Math.abs(brightness - gray[index + width])
      );
      const chroma = Math.max(red, green, blue) - Math.min(red, green, blue);
      const isLikelyStroke = (
        (brightness < 178 && localContrast > 16 && edge > 8)
        || (brightness < 205 && localContrast > 20 && edge > 10 && chroma > 10)
        || (blue > red + 10 && brightness < 210 && localContrast > 18 && edge > 9)
      );
      if (!isLikelyStroke) continue;
      const confidence = Math.max(localContrast * 8, edge * 7, (230 - brightness) * 1.8);
      const inkAlpha = Math.max(0, Math.min(245, Math.round(confidence)));
      if (inkAlpha < 58) continue;
      candidates[index] = 1;
      alphaMap[index] = inkAlpha;
    }
  }

  const keptBounds = collectSignatureComponents({ candidates, visited, mask, width, height });
  if (!keptBounds) return null;
  softenSignatureMask({ mask, alphaMap, width, height });
  return { mask, alphaMap, bounds: keptBounds };
}

function extractSignatureInkByInkColor(context, width, height) {
  const pixels = context.getImageData(0, 0, width, height).data;
  const gray = new Uint8ClampedArray(width * height);
  const candidates = new Uint8Array(width * height);
  const mask = new Uint8Array(width * height);
  const alphaMap = new Uint8ClampedArray(width * height);
  const radius = Math.max(12, Math.round(Math.min(width, height) * 0.022));

  for (let index = 0; index < gray.length; index += 1) {
    const pixelIndex = index * 4;
    gray[index] = Math.round((pixels[pixelIndex] * 0.299) + (pixels[pixelIndex + 1] * 0.587) + (pixels[pixelIndex + 2] * 0.114));
  }

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = y * width + x;
      const pixelIndex = index * 4;
      const alpha = pixels[pixelIndex + 3];
      if (alpha <= 10) continue;
      const red = pixels[pixelIndex];
      const green = pixels[pixelIndex + 1];
      const blue = pixels[pixelIndex + 2];
      const max = Math.max(red, green, blue);
      const min = Math.min(red, green, blue);
      const chroma = max - min;
      const brightness = (red + green + blue) / 3;
      const saturation = chroma / Math.max(1, max);
      const localBackground = localGrayAverage(gray, width, height, x, y, radius);
      const localContrast = localBackground - gray[index];
      const edge = Math.max(
        Math.abs(gray[index] - gray[index - 1]),
        Math.abs(gray[index] - gray[index + 1]),
        Math.abs(gray[index] - gray[index - width]),
        Math.abs(gray[index] - gray[index + width])
      );
      const purpleBlueInk = (
        brightness < 252
        && saturation > 0.045
        && chroma > 9
        && blue > green + 2
        && red > green - 18
        && blue > red - 40
        && (localContrast > 1.5 || edge > 3 || saturation > 0.12)
      );
      if (!purpleBlueInk) continue;
      const confidence = (chroma * 4.8) + ((blue - green) * 2.4) + Math.max(0, red - green) + (Math.max(0, localContrast) * 6.2) + (edge * 3.1);
      const inkAlpha = Math.max(0, Math.min(245, Math.round(confidence)));
      if (inkAlpha < 38) continue;
      candidates[index] = 1;
      alphaMap[index] = inkAlpha;
    }
  }

  const keptBounds = colorSignatureBounds({ candidates, mask, alphaMap, width, height });
  if (!keptBounds) return null;
  softenSignatureMask({ mask, alphaMap, width, height });
  const colorExtraction = { mask, alphaMap, bounds: keptBounds };
  return validateSignatureExtraction(colorExtraction, width, height) ? colorExtraction : null;
}

function extractSignatureInkLoose(context, width, height) {
  const pixels = context.getImageData(0, 0, width, height).data;
  const gray = new Uint8ClampedArray(width * height);
  const candidates = new Uint8Array(width * height);
  const mask = new Uint8Array(width * height);
  const alphaMap = new Uint8ClampedArray(width * height);
  const radius = Math.max(10, Math.round(Math.min(width, height) * 0.018));

  for (let index = 0; index < gray.length; index += 1) {
    const pixelIndex = index * 4;
    gray[index] = Math.round((pixels[pixelIndex] * 0.299) + (pixels[pixelIndex + 1] * 0.587) + (pixels[pixelIndex + 2] * 0.114));
  }

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = y * width + x;
      const pixelIndex = index * 4;
      if (pixels[pixelIndex + 3] <= 10) continue;
      const red = pixels[pixelIndex];
      const green = pixels[pixelIndex + 1];
      const blue = pixels[pixelIndex + 2];
      const brightness = gray[index];
      const chroma = Math.max(red, green, blue) - Math.min(red, green, blue);
      const localBackground = localGrayAverage(gray, width, height, x, y, radius);
      const localContrast = localBackground - brightness;
      const edge = Math.max(
        Math.abs(brightness - gray[index - 1]),
        Math.abs(brightness - gray[index + 1]),
        Math.abs(brightness - gray[index - width]),
        Math.abs(brightness - gray[index + width])
      );
      const coloredInk = chroma > 7 && (blue > green || red > green + 2);
      const darkInk = brightness < 222 && localContrast > 5 && edge > 4;
      const faintInk = brightness < 242 && localContrast > 2.2 && edge > 2.8 && chroma > 4;
      if (!coloredInk && !darkInk && !faintInk) continue;
      const confidence = Math.max(
        chroma * 4.2,
        localContrast * 8.5,
        edge * 6.5,
        (244 - brightness) * 1.15
      );
      const inkAlpha = Math.max(0, Math.min(245, Math.round(confidence)));
      if (inkAlpha < 30) continue;
      candidates[index] = 1;
      alphaMap[index] = inkAlpha;
    }
  }

  const keptBounds = colorSignatureBounds({ candidates, mask, alphaMap, width, height });
  if (!keptBounds) return null;
  softenSignatureMask({ mask, alphaMap, width, height });
  const extraction = { mask, alphaMap, bounds: keptBounds };
  return validateSignatureExtraction(extraction, width, height) ? extraction : null;
}

function extractSignatureInkUltraLoose(context, width, height) {
  const pixels = context.getImageData(0, 0, width, height).data;
  const candidates = new Uint8Array(width * height);
  const mask = new Uint8Array(width * height);
  const alphaMap = new Uint8ClampedArray(width * height);

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = y * width + x;
      const pixelIndex = index * 4;
      if (pixels[pixelIndex + 3] <= 10) continue;
      const red = pixels[pixelIndex];
      const green = pixels[pixelIndex + 1];
      const blue = pixels[pixelIndex + 2];
      const max = Math.max(red, green, blue);
      const min = Math.min(red, green, blue);
      const chroma = max - min;
      const brightness = (red + green + blue) / 3;
      const blueOrPurple = chroma > 5 && blue >= green - 2 && blue >= red - 46;
      const darkFineStroke = brightness < 185 && chroma > 3;
      if (!blueOrPurple && !darkFineStroke) continue;
      candidates[index] = 1;
      alphaMap[index] = Math.max(48, Math.min(225, Math.round((chroma * 5.2) + ((245 - brightness) * 1.1))));
    }
  }

  const bounds = colorSignatureBounds({ candidates, mask, alphaMap, width, height });
  if (!bounds) return null;
  softenSignatureMask({ mask, alphaMap, width, height });
  return { mask, alphaMap, bounds };
}

function colorSignatureBounds({ candidates, mask, alphaMap, width, height }) {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  let count = 0;

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = y * width + x;
      if (!candidates[index]) continue;
      const neighbors = (
        candidates[index - 1]
        + candidates[index + 1]
        + candidates[index - width]
        + candidates[index + width]
        + candidates[index - width - 1]
        + candidates[index - width + 1]
        + candidates[index + width - 1]
        + candidates[index + width + 1]
      );
      if (neighbors < 1) {
        alphaMap[index] = 0;
        continue;
      }
      mask[index] = 1;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      count += 1;
    }
  }

  if (count < Math.max(14, width * height * 0.00001) || maxX < minX || maxY < minY) return null;
  return {
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1
  };
}

async function extractSignatureInkWithOpenCv(sourceCanvas) {
  const cv = await loadOpenCv();
  if (!cv?.Mat || !cv?.connectedComponentsWithStats) return null;

  const src = cv.imread(sourceCanvas);
  const gray = new cv.Mat();
  const blurred = new cv.Mat();
  const binary = new cv.Mat();
  const horizontal = new cv.Mat();
  const noLines = new cv.Mat();
  const cleaned = new cv.Mat();
  const labels = new cv.Mat();
  const stats = new cv.Mat();
  const centroids = new cv.Mat();
  const smallKernel = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(2, 2));
  const horizontalKernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(Math.max(28, Math.round(sourceCanvas.width * 0.035)), 1));

  try {
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(gray, blurred, new cv.Size(3, 3), 0, 0, cv.BORDER_DEFAULT);
    let blockSize = Math.max(31, Math.round(Math.min(sourceCanvas.width, sourceCanvas.height) / 18));
    if (blockSize % 2 === 0) blockSize += 1;
    cv.adaptiveThreshold(blurred, binary, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY_INV, blockSize, 13);
    cv.morphologyEx(binary, horizontal, cv.MORPH_OPEN, horizontalKernel);
    cv.subtract(binary, horizontal, noLines);
    cv.morphologyEx(noLines, cleaned, cv.MORPH_CLOSE, smallKernel);
    cv.medianBlur(cleaned, cleaned, 3);

    const componentCount = cv.connectedComponentsWithStats(cleaned, labels, stats, centroids, 8, cv.CV_32S);
    const extraction = extractOpenCvComponents({ cv, gray, cleaned, labels, stats, componentCount, width: sourceCanvas.width, height: sourceCanvas.height });
    if (!extraction || !validateSignatureExtraction(extraction, sourceCanvas.width, sourceCanvas.height)) return null;
    softenSignatureMask(extraction);
    return extraction;
  } finally {
    [src, gray, blurred, binary, horizontal, noLines, cleaned, labels, stats, centroids, smallKernel, horizontalKernel].forEach((mat) => mat?.delete?.());
  }
}

function validateSignatureExtraction(extraction, width, height) {
  const { mask, bounds } = extraction;
  let count = 0;
  for (let index = 0; index < mask.length; index += 1) {
    if (mask[index]) count += 1;
  }
  const area = bounds.width * bounds.height;
  const density = count / Math.max(1, area);
  const aspect = bounds.width / Math.max(1, bounds.height);
  const enoughInk = count >= Math.max(16, width * height * 0.000009);
  const signatureLike = aspect >= 0.72 && bounds.width >= width * 0.018 && bounds.height >= height * 0.004;
  const notBlob = density < 0.74 && bounds.width <= width * 0.88 && bounds.height <= height * 0.68;
  return enoughInk && signatureLike && notBlob;
}

function extractOpenCvComponents({ gray, cleaned, labels, stats, componentCount, width, height }) {
  const totalPixels = width * height;
  const components = [];
  const columns = stats.cols;

  for (let label = 1; label < componentCount; label += 1) {
    const left = stats.data32S[label * columns];
    const top = stats.data32S[label * columns + 1];
    const componentWidth = stats.data32S[label * columns + 2];
    const componentHeight = stats.data32S[label * columns + 3];
    const count = stats.data32S[label * columns + 4];
    const componentArea = componentWidth * componentHeight;
    const density = count / Math.max(1, componentArea);
    const lineLike = componentWidth > width * 0.08 && componentHeight <= Math.max(8, componentWidth * 0.045);
    const hugeShape = componentArea > totalPixels * 0.075 || count > totalPixels * 0.032 || density > 0.8;
    const tooSmall = count < Math.max(16, Math.round(totalPixels * 0.000006)) || componentWidth < 3 || componentHeight < 3;
    if (tooSmall || lineLike || hugeShape) continue;

    components.push({
      label,
      count,
      minX: left,
      minY: top,
      maxX: left + componentWidth - 1,
      maxY: top + componentHeight - 1,
      width: componentWidth,
      height: componentHeight,
      score: count * Math.max(componentWidth, componentHeight)
    });
  }

  if (!components.length) return null;
  components.sort((a, b) => b.score - a.score);
  const selected = selectSignatureCluster(components, width, height);
  if (!selected.length) return null;

  const selectedLabels = new Set(selected.map((component) => component.label));
  const mask = new Uint8Array(totalPixels);
  const alphaMap = new Uint8ClampedArray(totalPixels);
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  let keptPixels = 0;

  for (let index = 0; index < labels.data32S.length; index += 1) {
    const label = labels.data32S[index];
    if (!selectedLabels.has(label) || cleaned.data[index] === 0) continue;
    const x = index % width;
    const y = Math.floor(index / width);
    const brightness = gray.data[index];
    mask[index] = 1;
    alphaMap[index] = Math.max(175, Math.min(245, Math.round((245 - brightness) * 2.1)));
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
    keptPixels += 1;
  }

  if (maxX < minX || maxY < minY) return null;
  const boundsWidth = maxX - minX + 1;
  const boundsHeight = maxY - minY + 1;
  const density = keptPixels / Math.max(1, boundsWidth * boundsHeight);
  const blankLike = keptPixels < Math.max(55, totalPixels * 0.000075) || density < 0.003;
  const tooLarge = boundsWidth > width * 0.52 || boundsHeight > height * 0.42;
  if (blankLike || tooLarge) return null;

  return {
    mask,
    alphaMap,
    bounds: {
      x: minX,
      y: minY,
      width: boundsWidth,
      height: boundsHeight
    }
  };
}

function localGrayAverage(gray, width, height, x, y, radius) {
  const left = Math.max(0, x - radius);
  const right = Math.min(width - 1, x + radius);
  const top = Math.max(0, y - radius);
  const bottom = Math.min(height - 1, y + radius);
  return (
    gray[y * width + left]
    + gray[y * width + right]
    + gray[top * width + x]
    + gray[bottom * width + x]
    + gray[top * width + left]
    + gray[top * width + right]
    + gray[bottom * width + left]
    + gray[bottom * width + right]
  ) / 8;
}

function collectSignatureComponents({ candidates, visited, mask, width, height }) {
  const components = [];
  const minComponentPixels = Math.max(14, Math.round(width * height * 0.000008));
  const queue = [];

  for (let start = 0; start < candidates.length; start += 1) {
    if (!candidates[start] || visited[start]) continue;
    let head = 0;
    let count = 0;
    let componentMinX = width;
    let componentMinY = height;
    let componentMaxX = -1;
    let componentMaxY = -1;
    queue.length = 0;
    queue.push(start);
    visited[start] = 1;

    while (head < queue.length) {
      const index = queue[head];
      head += 1;
      const x = index % width;
      const y = Math.floor(index / width);
      count += 1;
      componentMinX = Math.min(componentMinX, x);
      componentMinY = Math.min(componentMinY, y);
      componentMaxX = Math.max(componentMaxX, x);
      componentMaxY = Math.max(componentMaxY, y);

      for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
        for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
          if (!offsetX && !offsetY) continue;
          const nextX = x + offsetX;
          const nextY = y + offsetY;
          if (nextX < 0 || nextX >= width || nextY < 0 || nextY >= height) continue;
          const nextIndex = nextY * width + nextX;
          if (!candidates[nextIndex] || visited[nextIndex]) continue;
          visited[nextIndex] = 1;
          queue.push(nextIndex);
        }
      }
    }

    const componentWidth = componentMaxX - componentMinX + 1;
    const componentHeight = componentMaxY - componentMinY + 1;
    const componentArea = componentWidth * componentHeight;
    const density = count / Math.max(1, componentArea);
    const lineLike = componentWidth > width * 0.08 && componentHeight <= Math.max(7, componentWidth * 0.045);
    const hugeShadow = componentArea > width * height * 0.055 || count > width * height * 0.018 || density > 0.72;
    const keep = count >= minComponentPixels && componentWidth >= 3 && componentHeight >= 3 && !lineLike && !hugeShadow;
    if (!keep) continue;

    components.push({
      pixels: [...queue],
      count,
      minX: componentMinX,
      minY: componentMinY,
      maxX: componentMaxX,
      maxY: componentMaxY,
      width: componentWidth,
      height: componentHeight,
      score: count * Math.max(componentWidth, componentHeight)
    });
  }

  if (!components.length) return null;
  components.sort((a, b) => b.score - a.score);
  const selected = selectSignatureCluster(components, width, height);
  if (!selected.length) return null;

  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  let keptPixels = 0;
  for (const component of selected) {
    component.pixels.forEach((index) => {
      mask[index] = 1;
    });
    minX = Math.min(minX, component.minX);
    minY = Math.min(minY, component.minY);
    maxX = Math.max(maxX, component.maxX);
    maxY = Math.max(maxY, component.maxY);
    keptPixels += component.count;
  }

  const boundsWidth = maxX - minX + 1;
  const boundsHeight = maxY - minY + 1;
  const boundsArea = boundsWidth * boundsHeight;
  const density = keptPixels / Math.max(1, boundsArea);
  const tooSparse = density < 0.0025 && keptPixels < width * height * 0.00009;
  const tooLarge = boundsWidth > width * 0.5 || boundsHeight > height * 0.38;
  if (keptPixels < Math.max(38, minComponentPixels * 2) || tooSparse || tooLarge) return null;
  return {
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1
  };
}

function selectSignatureCluster(components, width, height) {
  const seed = components[0];
  let bounds = { minX: seed.minX, minY: seed.minY, maxX: seed.maxX, maxY: seed.maxY };
  const selected = new Set([seed]);
  let changed = true;

  while (changed) {
    changed = false;
    const expandX = Math.max(36, (bounds.maxX - bounds.minX + 1) * 1.35, width * 0.045);
    const expandY = Math.max(28, (bounds.maxY - bounds.minY + 1) * 1.55, height * 0.035);
    const search = {
      minX: bounds.minX - expandX,
      minY: bounds.minY - expandY,
      maxX: bounds.maxX + expandX,
      maxY: bounds.maxY + expandY
    };

    for (const component of components) {
      if (selected.has(component)) continue;
      const centerX = (component.minX + component.maxX) / 2;
      const centerY = (component.minY + component.maxY) / 2;
      const overlaps = component.maxX >= search.minX && component.minX <= search.maxX && component.maxY >= search.minY && component.minY <= search.maxY;
      const centerInside = centerX >= search.minX && centerX <= search.maxX && centerY >= search.minY && centerY <= search.maxY;
      if (!overlaps && !centerInside) continue;
      selected.add(component);
      bounds = {
        minX: Math.min(bounds.minX, component.minX),
        minY: Math.min(bounds.minY, component.minY),
        maxX: Math.max(bounds.maxX, component.maxX),
        maxY: Math.max(bounds.maxY, component.maxY)
      };
      changed = true;
    }
  }

  const minimumUsefulCount = Math.max(18, seed.count * 0.055);
  return Array.from(selected).filter((component) => (
    component === seed
    || component.count >= minimumUsefulCount
    || (component.width >= seed.width * 0.1 && component.height >= seed.height * 0.1)
  ));
}

function softenSignatureMask({ mask, alphaMap, width, height }) {
  for (let pass = 0; pass < 2; pass += 1) {
    const alphaCopy = alphaMap.slice();
    const maskCopy = mask.slice();
    for (let y = 1; y < height - 1; y += 1) {
      for (let x = 1; x < width - 1; x += 1) {
        const index = y * width + x;
        const strongestNeighbor = Math.max(
          alphaCopy[index - 1],
          alphaCopy[index + 1],
          alphaCopy[index - width],
          alphaCopy[index + width],
          alphaCopy[index - width - 1],
          alphaCopy[index - width + 1],
          alphaCopy[index + width - 1],
          alphaCopy[index + width + 1]
        );
        if (!maskCopy[index] && strongestNeighbor < 135) continue;
        mask[index] = 1;
        alphaMap[index] = Math.max(alphaCopy[index], Math.round(strongestNeighbor * (pass ? 0.62 : 0.78)));
      }
    }
  }
}

function renderSmoothSignatureCanvas(sourceCanvas) {
  const scale = 2;
  const smoothCanvas = document.createElement("canvas");
  smoothCanvas.width = Math.max(1, sourceCanvas.width * scale);
  smoothCanvas.height = Math.max(1, sourceCanvas.height * scale);
  const smoothContext = smoothCanvas.getContext("2d");
  smoothContext.imageSmoothingEnabled = true;
  smoothContext.imageSmoothingQuality = "high";
  smoothContext.scale(scale, scale);
  smoothContext.filter = "blur(0.35px)";
  smoothContext.drawImage(sourceCanvas, 0, 0);
  smoothContext.filter = "none";
  smoothContext.globalAlpha = 0.85;
  smoothContext.drawImage(sourceCanvas, 0, 0);
  smoothContext.globalAlpha = 1;
  return smoothCanvas;
}

function drawProcessedSignatureOnPad({ canvas, context, processed }) {
  context.clearRect(0, 0, canvas.width, canvas.height);
  const visibleWidth = canvas.clientWidth || canvas.width;
  const visibleHeight = canvas.clientHeight || canvas.height;
  const fit = Math.min((visibleWidth * 0.82) / processed.width, (visibleHeight * 0.66) / processed.height, 1.8);
  const drawWidth = processed.width * fit;
  const drawHeight = processed.height * fit;
  const x = (visibleWidth - drawWidth) / 2;
  const y = (visibleHeight - drawHeight) / 2;
  context.drawImage(processed, x, y, drawWidth, drawHeight);
}

function loadImage(source) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("No se pudo leer la imagen de la firma."));
    image.src = source;
  });
}

function loadOpenCv() {
  if (window.cv?.Mat && window.cv?.imread) return Promise.resolve(window.cv);
  if (openCvLoader) return openCvLoader;

  openCvLoader = new Promise((resolve, reject) => {
    const existingScript = document.querySelector(`script[src="${OPENCV_JS_URL}"]`);
    const script = existingScript || document.createElement("script");
    let settled = false;
    const timeout = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error("OpenCV no cargo a tiempo."));
    }, 12000);

    const finish = () => {
      waitForOpenCvRuntime()
        .then((cv) => {
          if (settled) return;
          settled = true;
          window.clearTimeout(timeout);
          resolve(cv);
        })
        .catch((error) => {
          if (settled) return;
          settled = true;
          window.clearTimeout(timeout);
          reject(error);
        });
    };

    script.addEventListener("load", finish, { once: true });
    script.addEventListener("error", () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      reject(new Error("No se pudo cargar OpenCV."));
    }, { once: true });

    if (!existingScript) {
      script.src = OPENCV_JS_URL;
      script.async = true;
      script.crossOrigin = "anonymous";
      document.head.appendChild(script);
    } else if (window.cv) {
      finish();
    }
  });

  return openCvLoader;
}

function waitForOpenCvRuntime() {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const check = () => {
      const cv = window.cv;
      if (cv?.Mat && cv?.imread && cv?.connectedComponentsWithStats) {
        resolve(cv);
        return;
      }
      if (cv && typeof cv.then === "function") {
        cv.then(resolve).catch(reject);
        return;
      }
      if (Date.now() - startedAt > 11000) {
        reject(new Error("OpenCV no esta disponible."));
        return;
      }
      window.setTimeout(check, 80);
    };
    check();
  });
}
