import { ROLE_LABELS, ROLES } from "../utils/constants.js";
import { pageTitle } from "../components/layout.js";
import { escapeAttr, escapeHtml, textOrDash } from "../utils/security.js";
import { dataService } from "../services/dataService.js?v=20260713-5";
import { toast } from "../components/toast.js?v=20260708-12";

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
        ${signature ? `
          <div class="signature-current">
            <span>Firma actual · version ${escapeHtml(signature.version || 1)}</span>
            <img src="${escapeAttr(signature.firma_data_url)}" alt="Firma registrada">
          </div>
        ` : ""}
        <form class="signature-form" data-signature-form>
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
            <label class="field">
              <span>Foto o imagen de tu firma</span>
              <input class="input form-control" type="file" accept="image/*" capture="environment" data-signature-upload>
            </label>
            <p>Escribe tu firma en papel blanco, toma una foto con buena luz y la convertiremos a firma digital azul.</p>
          </div>
          <label class="field">
            <span data-signature-pad-label>${signature ? "Dibuja la nueva firma" : "Dibuja tu firma"}</span>
            <canvas class="signature-pad" width="860" height="260" data-signature-pad></canvas>
          </label>
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
          </div>
          <div class="row g-3">
            ${signature?.pin_updated_at ? `
              <label class="field col-12 col-md-6"><span>PIN actual</span><input class="input form-control" type="password" name="pin_actual" inputmode="numeric" maxlength="12" autocomplete="off" required></label>
            ` : `
              <label class="field col-12 col-md-6"><span>Crea tu PIN de firma</span><input class="input form-control" type="password" name="pin_nuevo" inputmode="numeric" maxlength="12" autocomplete="off" required></label>
            `}
          </div>
          <div class="toolbar">
            <button class="button secondary btn btn-outline-secondary" type="button" data-clear-signature>Limpiar</button>
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
  const scanPanel = form.querySelector("[data-signature-scan-panel]");
  const uploadInput = form.querySelector("[data-signature-upload]");
  const padLabel = form.querySelector("[data-signature-pad-label]");
  let drawing = false;
  let hasInk = false;
  let strokeWidth = Number(strokeInput?.value || 2.6);

  function clearPad() {
    context.clearRect(0, 0, canvas.width, canvas.height);
    hasInk = false;
  }

  function resizeCanvas() {
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.max(320, Math.floor(rect.width * ratio));
    canvas.height = Math.max(150, Math.floor(rect.height * ratio));
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.lineWidth = strokeWidth;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.strokeStyle = "#1d4ed8";
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
    resizeCanvas();
    hasInk = false;
    if (hadInk) toast("El area cambio de tamano. Dibuja la firma nuevamente.", "info");
  }

  function point(event) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    };
  }

  canvas.addEventListener("pointerdown", (event) => {
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
    context.lineTo(next.x, next.y);
    context.stroke();
  });

  ["pointerup", "pointercancel", "pointerleave"].forEach((type) => {
    canvas.addEventListener(type, () => {
      drawing = false;
    });
  });

  form.querySelector("[data-clear-signature]").addEventListener("click", () => {
    clearPad();
    if (uploadInput) uploadInput.value = "";
  });

  strokeInput?.addEventListener("input", updateStroke);
  padSizeInput?.addEventListener("input", updatePadSize);
  form.querySelectorAll("[data-signature-mode]").forEach((input) => {
    input.addEventListener("change", () => {
      const mode = form.elements.signature_mode.value;
      scanPanel.hidden = mode !== "scan";
      if (padLabel) padLabel.textContent = mode === "scan" ? "Vista previa digitalizada" : (signature ? "Dibuja la nueva firma" : "Dibuja tu firma");
    });
  });
  uploadInput?.addEventListener("change", async () => {
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
      toast("Firma escaneada y digitalizada.", "success");
    } catch (error) {
      toast(error.message || "No fue posible digitalizar la firma.", "error");
    }
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
  });
}

async function processScannedSignature(file) {
  const imageUrl = URL.createObjectURL(file);
  try {
    const image = await loadImage(imageUrl);
    const maxSide = 1600;
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

    const extraction = extractSignatureInk(sourceContext, width, height);
    if (!extraction) throw new Error("No detectamos la firma. Usa una foto con fondo claro y tinta visible.");
    const { mask, bounds } = extraction;

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
      const inkAlpha = mask[sourceY * width + sourceX] && alpha > 10 ? 235 : 0;
      output.data[index] = 29;
      output.data[index + 1] = 78;
      output.data[index + 2] = 216;
      output.data[index + 3] = inkAlpha;
    }

    const outputCanvas = document.createElement("canvas");
    outputCanvas.width = cropWidth;
    outputCanvas.height = cropHeight;
    outputCanvas.getContext("2d").putImageData(output, 0, 0);
    return outputCanvas;
  } finally {
    URL.revokeObjectURL(imageUrl);
  }
}

function extractSignatureInk(context, width, height) {
  const pixels = context.getImageData(0, 0, width, height).data;
  const gray = new Uint8ClampedArray(width * height);
  const candidates = new Uint8Array(width * height);
  const visited = new Uint8Array(width * height);
  const mask = new Uint8Array(width * height);
  const radius = Math.max(8, Math.round(Math.min(width, height) * 0.014));

  for (let index = 0; index < gray.length; index += 1) {
    const pixelIndex = index * 4;
    gray[index] = Math.round((pixels[pixelIndex] * 0.299) + (pixels[pixelIndex + 1] * 0.587) + (pixels[pixelIndex + 2] * 0.114));
  }

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      const pixelIndex = index * 4;
      const alpha = pixels[pixelIndex + 3];
      if (alpha <= 10) continue;
      const brightness = gray[index];
      const localBackground = localGrayAverage(gray, width, height, x, y, radius);
      const localContrast = localBackground - brightness;
      if (brightness < 218 && localContrast > 18) candidates[index] = 1;
    }
  }

  const keptBounds = collectSignatureComponents({ candidates, visited, mask, width, height });
  if (!keptBounds) return null;
  return { mask, bounds: keptBounds };
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
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  let keptPixels = 0;
  const minComponentPixels = Math.max(10, Math.round(width * height * 0.000006));
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
    const lineLike = componentWidth > width * 0.18 && componentHeight <= Math.max(8, componentWidth * 0.035);
    const hugeShadow = componentArea > width * height * 0.18 || count > width * height * 0.055;
    const keep = count >= minComponentPixels && componentWidth >= 3 && componentHeight >= 3 && !lineLike && !hugeShadow;
    if (!keep) continue;

    for (const index of queue) mask[index] = 1;
    minX = Math.min(minX, componentMinX);
    minY = Math.min(minY, componentMinY);
    maxX = Math.max(maxX, componentMaxX);
    maxY = Math.max(maxY, componentMaxY);
    keptPixels += count;
  }

  if (keptPixels < minComponentPixels || maxX < minX || maxY < minY) return null;
  return {
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1
  };
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
