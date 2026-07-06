import { PRIORITIES, ROLES, STATUS } from "../utils/constants.js";
import { formatBytes, formatDate } from "../utils/format.js";
import { dataService } from "../services/dataService.js?v=20260706-5";
import { toast } from "../components/toast.js?v=20260706-5";
import { closeModal } from "../components/modal.js?v=20260706-5";
import { icon } from "../components/icons.js";
import { escapeAttr, escapeHtml, textOrDash } from "../utils/security.js";

const PDFJS_URL = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.mjs";
const PDFJS_WORKER_URL = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.mjs";
let pdfJsPromise;

function canApprove(user, solicitud, data) {
  if (solicitud.estado !== STATUS.PENDING) return false;
  const assignment = assignmentForUser(data, solicitud.id, user.id);
  return user.rol === ROLES.APPROVER && assignment?.estado === STATUS.PENDING;
}

function canSee(user, solicitud, data) {
  return user.rol === ROLES.ADMIN || solicitud.creado_por === user.id || Boolean(assignmentForUser(data, solicitud.id, user.id));
}

function canEditCorrection(user, solicitud) {
  return solicitud.estado === STATUS.CORRECTION && solicitud.creado_por === user.id;
}

export function renderRequestDetail({ solicitud, data, user, onChange }) {
  if (!canSee(user, solicitud, data)) {
    const denied = document.createElement("p");
    denied.textContent = "No tienes permisos para ver esta solicitud.";
    return denied;
  }

  const files = data.archivos.filter((file) => file.solicitud_id === solicitud.id);
  const comments = data.comentarios.filter((comment) => comment.solicitud_id === solicitud.id);
  const approvalRows = approvalsForRequest(data, solicitud.id);
  const canDecide = canApprove(user, solicitud, data);
  const auditTrail = user.rol === ROLES.ADMIN
    ? (data.auditoria || []).filter((entry) => entry.solicitud_id === solicitud.id)
    : [];
  const view = document.createElement("div");
  view.className = "grid request-detail";
  view.innerHTML = `
    <div class="detail-grid detail-grid-compact">
      <div class="detail-box"><strong>Codigo</strong><p>${escapeHtml(solicitud.codigo)}</p></div>
      <div class="detail-box"><strong>Estado</strong><p><span class="badge ${escapeAttr(solicitud.estado.split(" ")[0])}">${escapeHtml(solicitud.estado)}</span></p></div>
      <div class="detail-box"><strong>Tipo</strong><p>${textOrDash(solicitud.tipo?.nombre)}</p></div>
      <div class="detail-box"><strong>Prioridad</strong><p><span class="badge ${escapeAttr(solicitud.prioridad)}">${escapeHtml(solicitud.prioridad)}</span></p></div>
      <div class="detail-box"><strong>Solicitante</strong><p>${textOrDash(`${solicitud.creador?.nombre || ""} ${solicitud.creador?.apellido || ""}`)}</p></div>
      <div class="detail-box"><strong>Fecha</strong><p>${formatDate(solicitud.created_at)}</p></div>
    </div>
    <section>
      <h3>${escapeHtml(solicitud.titulo)}</h3>
      <p>${escapeHtml(solicitud.descripcion || "Sin descripcion.")}</p>
      ${solicitud.observaciones ? `<p><strong>Observaciones:</strong> ${escapeHtml(solicitud.observaciones)}</p>` : ""}
      ${solicitud.comentario_aprobacion ? `<p><strong>Comentario de decision:</strong> ${escapeHtml(solicitud.comentario_aprobacion)}</p>` : ""}
    </section>
    <section>
      <div class="panel-header compact-section-header"><h3>Archivos</h3></div>
      <ul class="file-list">
        ${files.length ? files.map((file) => `
          <li class="file-item file-item-compact">
            <div>
              <strong>${escapeHtml(file.nombre_original)}</strong>
              <p>${escapeHtml(file.extension?.toUpperCase())} · ${formatBytes(file.tamano)}</p>
            </div>
            <div class="file-actions">
              <button class="button secondary btn btn-outline-secondary btn-sm" type="button" data-preview="${escapeAttr(file.id)}">${icon("eye")} Vista previa</button>
              <button class="button secondary btn btn-outline-secondary btn-sm" type="button" data-download="${escapeAttr(file.id)}">${icon("download")} Descargar</button>
            </div>
          </li>
        `).join("") : "<li class='empty-state'>No hay archivos adjuntos.</li>"}
      </ul>
    </section>
    ${canEditCorrection(user, solicitud) ? `
      <section class="panel correction-panel">
        <h3>Enviar correccion</h3>
        <form class="form" data-correction-form novalidate>
          <label class="field"><span>Titulo</span><input class="input form-control" name="titulo" required maxlength="160" value="${escapeAttr(solicitud.titulo || "")}"></label>
          <label class="field"><span>Descripcion</span><textarea class="form-control" name="descripcion" rows="3" required>${escapeHtml(solicitud.descripcion || "")}</textarea></label>
          <div class="row g-3">
            <label class="field col-12 col-lg-6">
              <span>Tipo de documento</span>
              <select class="form-select" name="tipo_documento_id" required>
                ${data.tipos_documento.map((item) => `<option value="${escapeAttr(item.id)}" ${item.id === solicitud.tipo_documento_id ? "selected" : ""}>${escapeHtml(item.nombre)}</option>`).join("")}
              </select>
            </label>
            <label class="field col-12 col-lg-6">
              <span>Prioridad</span>
              <select class="form-select" name="prioridad" required>
                ${PRIORITIES.map((item) => `<option ${item === solicitud.prioridad ? "selected" : ""}>${escapeHtml(item)}</option>`).join("")}
              </select>
            </label>
          </div>
          <label class="field"><span>Observaciones</span><textarea class="form-control" name="observaciones" rows="2">${escapeHtml(solicitud.observaciones || "")}</textarea></label>
          <fieldset class="field correction-files">
            <legend>Archivos actuales</legend>
            ${files.length ? files.map((file) => `
              <label class="correction-file-option">
                <input class="form-check-input" type="checkbox" name="remove_files" value="${escapeAttr(file.id)}">
                <span>
                  <strong>${escapeHtml(file.nombre_original)}</strong>
                  <small>${escapeHtml(file.extension?.toUpperCase())} · ${formatBytes(file.tamano)}</small>
                </span>
                <em>Eliminar</em>
              </label>
            `).join("") : "<p class='empty-state'>No hay archivos actuales.</p>"}
          </fieldset>
          <label class="field file-drop">
            <span>${icon("upload")} Adjuntar archivos corregidos</span>
            <input class="form-control" type="file" name="files" multiple accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png,.webp,.txt,.csv">
            <small>Puedes reemplazar el documento marcando el anterior para eliminar y adjuntando el corregido.</small>
          </label>
          <ul class="file-list" data-correction-selected-files></ul>
          <div class="toolbar">
            <button class="button btn btn-primary" type="submit">${icon("check")} Guardar correccion</button>
          </div>
        </form>
      </section>
    ` : ""}
    <section class="grid">
      <h3>Aprobadores</h3>
      <ul class="approval-list">
        ${approvalRows.length ? approvalRows.map((row) => `
          <li class="approval-item">
            <div>
              <strong>${escapeHtml(profileName(data, row.usuario_id))}</strong>
              <p>${row.comentario ? escapeHtml(row.comentario) : "Sin comentario."}</p>
            </div>
            <div class="approval-state">
              <span class="badge ${escapeAttr(row.estado.split(" ")[0])}">${escapeHtml(row.estado)}</span>
              ${row.fecha_accion ? `<small>${formatDate(row.fecha_accion)}</small>` : "<small>Pendiente de accion</small>"}
            </div>
          </li>
        `).join("") : "<li class='empty-state'>No hay aprobadores asignados.</li>"}
      </ul>
    </section>
    <section class="grid">
      <h3>Comentarios</h3>
      <ul class="timeline">
        ${comments.length ? comments.map((comment) => `<li class="timeline-item"><strong>${escapeHtml(comment.usuario?.nombre || profileName(data, comment.usuario_id))}</strong><p>${escapeHtml(comment.comentario)}</p><small>${formatDate(comment.created_at)}</small></li>`).join("") : "<li class='empty-state'>Sin comentarios.</li>"}
      </ul>
      ${canDecide ? "" : `<form class="form" data-comment-form>
        <label class="field"><span>Agregar comentario</span><textarea class="form-control" name="comentario" rows="2" required></textarea></label>
        <button class="button secondary btn btn-outline-secondary" type="submit">Agregar comentario</button>
      </form>`}
    </section>
    ${user.rol === ROLES.ADMIN ? `
      <section class="grid">
        <h3>Historial de auditoria</h3>
        <ul class="timeline">
          ${auditTrail.length ? auditTrail.map((entry) => `
            <li class="timeline-item audit-item">
              <div class="audit-row">
                <strong>${escapeHtml(entry.accion)}</strong>
                <small>${formatDate(entry.created_at)}</small>
              </div>
              <p>${escapeHtml(entry.descripcion || "Sin descripcion.")}</p>
              <small>${escapeHtml(profileName(data, entry.usuario_id))}${entry.user_agent ? ` · ${escapeHtml(shortUserAgent(entry.user_agent))}` : ""}</small>
            </li>
          `).join("") : "<li class='empty-state'>Sin eventos de auditoria.</li>"}
        </ul>
      </section>
    ` : ""}
    ${canDecide ? `
      <section class="panel">
        <h3>Decision</h3>
        <form class="form" data-action-form>
          <label class="field"><span>Comentario</span><textarea class="form-control" name="comentario" rows="2"></textarea></label>
          <div class="toolbar">
            <button class="button success btn btn-success" name="action" value="aprobar">${icon("check")} Aprobar</button>
            <button class="button danger btn btn-danger" name="action" value="rechazar">${icon("x")} Rechazar</button>
            <button class="button secondary btn btn-outline-secondary" name="action" value="correccion">${icon("edit")} Solicitar correccion</button>
          </div>
        </form>
      </section>
    ` : ""}
  `;

  view.querySelectorAll("[data-download]").forEach((button) => {
    button.addEventListener("click", async () => {
      const file = files.find((item) => item.id === button.dataset.download);
      const url = file.data_url || await dataService.signedUrl(file.ruta_storage);
      if (url) window.open(url, "_blank", "noopener");
      await dataService.audit(user.id, solicitud.id, "DESCARGA_ARCHIVO", `Descarga de ${file.nombre_original}.`);
    });
  });

  view.querySelectorAll("[data-preview]").forEach((button) => {
    button.addEventListener("click", async () => {
      const file = files.find((item) => item.id === button.dataset.preview);
      if (!file) return;

      button.disabled = true;
      const previousLabel = button.innerHTML;
      button.textContent = "Cargando...";
      try {
        const url = file.data_url || await dataService.signedUrl(file.ruta_storage);
        openFilePreview(file, url, async () => {
          window.open(url, "_blank", "noopener");
          await dataService.audit(user.id, solicitud.id, "DESCARGA_ARCHIVO", `Descarga de ${file.nombre_original}.`);
        });
        await dataService.audit(user.id, solicitud.id, "VISTA_PREVIA_ARCHIVO", `Vista previa de ${file.nombre_original}.`);
      } catch (error) {
        toast(error.message || "No fue posible abrir la vista previa.", "error");
      } finally {
        button.innerHTML = previousLabel;
        button.disabled = false;
      }
    });
  });

  view.querySelector("[data-comment-form]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await dataService.addComment(solicitud.id, user.id, form.get("comentario"));
    toast("Comentario agregado.", "success");
    closeModal();
    await onChange();
  });

  view.querySelector("[data-action-form]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submitter = event.submitter;
    const form = new FormData(event.currentTarget);
    await dataService.actOnRequest(solicitud.id, user, submitter.value, form.get("comentario"));
    toast("Decision registrada.", "success");
    closeModal();
    await onChange();
  });

  const correctionForm = view.querySelector("[data-correction-form]");
  correctionForm?.elements.files.addEventListener("change", () => {
    const list = view.querySelector("[data-correction-selected-files]");
    list.innerHTML = Array.from(correctionForm.elements.files.files).map((file) => `<li class="file-item">${escapeHtml(file.name)}</li>`).join("");
  });
  correctionForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submitter = event.submitter;
    submitter.disabled = true;
    const previousLabel = submitter.innerHTML;
    submitter.textContent = "Guardando...";
    try {
      const formData = new FormData(correctionForm);
      const values = Object.fromEntries(formData.entries());
      values.titulo = String(values.titulo || "").trim();
      values.descripcion = String(values.descripcion || "").trim();
      values.observaciones = String(values.observaciones || "").trim();
      await dataService.updateRequestCorrection({
        solicitud,
        values,
        files: correctionForm.elements.files.files,
        removeFileIds: formData.getAll("remove_files"),
        existingFiles: files,
        user
      });
      toast("Correccion enviada.", "success");
      closeModal();
      await onChange();
    } catch (error) {
      toast(error.message || "No fue posible guardar la correccion.", "error");
    } finally {
      submitter.innerHTML = previousLabel;
      submitter.disabled = false;
    }
  });

  return view;
}

function previewMarkup(file, source = "") {
  if (!source) return previewUnavailable(file);
  if (isImage(file)) return `<img class="quicklook-media quicklook-image" src="${escapeAttr(source)}" alt="${escapeAttr(file.nombre_original)}">`;
  if (isPdf(file)) return `<div class="pdf-preview" data-pdf-source="${escapeAttr(source)}"><div class="pdf-loading">Cargando PDF...</div></div>`;
  if (isFramePreview(file)) return `<iframe class="quicklook-media quicklook-frame" src="${escapeAttr(source)}" title="${escapeAttr(file.nombre_original)}"></iframe>`;
  return previewUnavailable(file);
}

function previewUnavailable(file) {
  return `
    <div class="preview-unavailable">
      <strong>Vista previa no disponible para ${escapeHtml(file.extension?.toUpperCase() || "este formato")}.</strong>
      <p>Este tipo de archivo no se puede mostrar directamente en el navegador. Puedes descargarlo para revisarlo.</p>
    </div>
  `;
}

function isImage(file) {
  return ["jpg", "jpeg", "png", "webp"].includes(file.extension);
}

function isPdf(file) {
  return file.extension === "pdf" || file.mime_type === "application/pdf";
}

function isFramePreview(file) {
  return ["txt", "csv"].includes(file.extension) || file.mime_type?.startsWith("text/");
}

function openFilePreview(file, source, onDownload) {
  closeFilePreview();
  const root = document.createElement("div");
  root.id = "file-preview-root";
  root.innerHTML = `
    <div class="quicklook-backdrop" data-file-preview-close></div>
    <section class="quicklook" role="dialog" aria-modal="true" aria-labelledby="quicklook-title">
      <header class="quicklook-header">
        <div>
          <h2 id="quicklook-title">${escapeHtml(file.nombre_original)}</h2>
          <p>${escapeHtml(file.extension?.toUpperCase() || "Archivo")} · ${formatBytes(file.tamano)}</p>
        </div>
        <div class="quicklook-actions">
          <button class="button secondary btn btn-outline-secondary btn-sm" type="button" data-file-preview-download>${icon("download")} Descargar</button>
          <button class="icon-button" type="button" data-file-preview-close aria-label="Cerrar">${icon("x")}</button>
        </div>
      </header>
      <div class="quicklook-body">
        ${previewMarkup(file, source)}
      </div>
    </section>
  `;

  const handleKeydown = (event) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopImmediatePropagation();
    closeFilePreview();
  };

  root.querySelectorAll("[data-file-preview-close]").forEach((item) => {
    item.addEventListener("click", closeFilePreview);
  });
  root.querySelector("[data-file-preview-download]").addEventListener("click", onDownload);
  root.handleFilePreviewKeydown = handleKeydown;
  window.addEventListener("keydown", handleKeydown, true);
  document.body.classList.add("file-preview-open");
  document.body.append(root);

  const pdfPreview = root.querySelector("[data-pdf-source]");
  if (pdfPreview) {
    renderPdfPreview(pdfPreview, source).catch(() => {
      pdfPreview.innerHTML = previewUnavailable(file);
    });
  }
}

function closeFilePreview() {
  const root = document.querySelector("#file-preview-root");
  if (!root) return;
  window.removeEventListener("keydown", root.handleFilePreviewKeydown, true);
  root.remove();
  document.body.classList.remove("file-preview-open");
}

async function getPdfJs() {
  if (!pdfJsPromise) {
    pdfJsPromise = import(PDFJS_URL).then((pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;
      return pdfjs;
    });
  }
  return pdfJsPromise;
}

async function renderPdfPreview(container, source) {
  const pdfjs = await getPdfJs();
  const loadingTask = pdfjs.getDocument({ url: source });
  const pdf = await loadingTask.promise;
  container.innerHTML = `<div class="pdf-pages" data-pdf-pages></div>`;
  const pages = container.querySelector("[data-pdf-pages]");

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    if (!document.body.contains(container)) return;
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1 });
    const targetWidth = Math.min(1100, Math.max(280, container.clientWidth - 18));
    const scale = targetWidth / viewport.width;
    const scaledViewport = page.getViewport({ scale });
    const outputScale = Math.min(window.devicePixelRatio || 1, 2);
    const pageBox = document.createElement("article");
    pageBox.className = "pdf-page";
    pageBox.innerHTML = `<span>Pagina ${pageNumber} de ${pdf.numPages}</span>`;
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    canvas.width = Math.floor(scaledViewport.width * outputScale);
    canvas.height = Math.floor(scaledViewport.height * outputScale);
    canvas.style.width = `${Math.floor(scaledViewport.width)}px`;
    canvas.style.height = `${Math.floor(scaledViewport.height)}px`;
    pageBox.append(canvas);
    pages.append(pageBox);
    await page.render({
      canvasContext: context,
      viewport: scaledViewport,
      transform: outputScale === 1 ? null : [outputScale, 0, 0, outputScale, 0, 0]
    }).promise;
  }
}

function profileName(data, id) {
  const profile = data.profiles.find((item) => item.id === id);
  return profile ? `${profile.nombre} ${profile.apellido}` : "Usuario";
}

function approvalsForRequest(data, solicitudId) {
  return data.solicitud_aprobadores
    .filter((item) => item.solicitud_id === solicitudId)
    .sort((a, b) => a.orden - b.orden);
}

function assignmentForUser(data, solicitudId, userId) {
  return data.solicitud_aprobadores.find((item) => item.solicitud_id === solicitudId && item.usuario_id === userId);
}

function shortUserAgent(value = "") {
  return value.length > 90 ? `${value.slice(0, 90)}...` : value;
}
