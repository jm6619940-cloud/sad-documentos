import { PRIORITIES, ROLES, STATUS } from "../utils/constants.js";
import { formatBytes, formatDate } from "../utils/format.js";
import { dataService } from "../services/dataService.js?v=20260713-5";
import { getSupabase } from "../services/supabaseClient.js";
import { toast } from "../components/toast.js?v=20260708-12";
import { closeModal, openModal } from "../components/modal.js?v=20260708-12";
import { icon } from "../components/icons.js";
import { escapeAttr, escapeHtml, textOrDash } from "../utils/security.js";
import { canSeePurchaseModule, isPurchaseRequest } from "../utils/purchases.js?v=20260709-4";

const PDFJS_URL = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.mjs";
const PDFJS_WORKER_URL = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.mjs";
const PDF_LIB_URL = "https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/+esm";
const SIGNATURE_INK_COLOR = "#1d4ed8";
const signatureTintCache = new Map();
let pdfJsPromise;
let pdfLibPromise;

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

function canCompletePurchase(user, solicitud, data) {
  return solicitud.estado === STATUS.APPROVED
    && canSeePurchaseModule(user, data)
    && isPurchaseRequest(solicitud)
    && solicitud.ejecucion_estado !== "Completada";
}

function canSignDocument(user, solicitud, data) {
  if (solicitud.estado !== STATUS.PENDING) return false;
  if (user.rol === ROLES.ADMIN) return true;
  return user.rol === ROLES.APPROVER && Boolean(assignmentForUser(data, solicitud.id, user.id));
}

export function renderRequestDetail({ solicitud, data, user, onChange }) {
  if (!canSee(user, solicitud, data)) {
    const denied = document.createElement("p");
    denied.textContent = "No tienes permisos para ver esta solicitud.";
    return denied;
  }

  const files = data.archivos.filter((file) => file.solicitud_id === solicitud.id);
  const comments = data.comentarios
    .filter((comment) => comment.solicitud_id === solicitud.id)
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  const approvalRows = approvalsForRequest(data, solicitud.id);
  const canDecide = canApprove(user, solicitud, data);
  const canSign = canSignDocument(user, solicitud, data);
  const userSignature = data.firmas_usuarios?.find((item) => item.usuario_id === user.id);
  const canComplete = canCompletePurchase(user, solicitud, data);
  const activeDocumentTypes = data.tipos_documento.filter((item) => item.activo !== false);
  const showPurchaseExecution = canSeePurchaseModule(user, data) && isPurchaseRequest(solicitud) && solicitud.estado === STATUS.APPROVED;
  const auditTrail = user.rol === ROLES.ADMIN
    ? (data.auditoria || []).filter((entry) => entry.solicitud_id === solicitud.id)
    : [];
  const signatureEvidence = user.rol === ROLES.ADMIN
    ? (data.firma_evidencias || []).filter((entry) => entry.solicitud_id === solicitud.id)
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
    ${showPurchaseExecution ? `
      <section class="panel execution-panel">
        <div class="panel-header compact-section-header">
          <h3>Ejecucion de compra</h3>
          <span class="badge ${solicitud.ejecucion_estado === "Completada" ? "Aprobado" : "Pendiente"}">${escapeHtml(solicitud.ejecucion_estado || "Pendiente")}</span>
        </div>
        <div class="detail-grid detail-grid-compact">
          <div class="detail-box"><strong>Aprobada</strong><p>${formatDate(solicitud.fecha_aprobacion || solicitud.updated_at)}</p></div>
          <div class="detail-box"><strong>Tiempo de ejecucion</strong><p>${escapeHtml(executionDuration(solicitud))}</p></div>
          ${solicitud.fecha_completada ? `<div class="detail-box"><strong>Completada</strong><p>${formatDate(solicitud.fecha_completada)}</p></div>` : ""}
          ${solicitud.comentario_completado ? `<div class="detail-box"><strong>Comentario final</strong><p>${escapeHtml(solicitud.comentario_completado)}</p></div>` : ""}
        </div>
        ${canComplete ? `
          <form class="form" data-complete-purchase-form>
            <label class="field"><span>Comentario de cierre</span><textarea class="form-control" name="comentario" rows="2" placeholder="Ejemplo: mercancia recibida, factura validada, servicio entregado."></textarea></label>
            <div class="toolbar">
              <button class="button success btn btn-success" type="submit">${icon("check")} Marcar compra completada</button>
            </div>
          </form>
        ` : ""}
      </section>
    ` : ""}
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
              <select class="form-select" name="tipo_documento_id" required ${activeDocumentTypes.length ? "" : "disabled"}>
                ${activeDocumentTypes.map((item) => `<option value="${escapeAttr(item.id)}" ${item.id === solicitud.tipo_documento_id ? "selected" : ""}>${escapeHtml(item.nombre)}</option>`).join("")}
              </select>
            </label>
            <label class="field col-12 col-lg-6">
              <span>Prioridad</span>
              <select class="form-select" name="prioridad" required>
                ${PRIORITIES.map((item) => `<option ${item === solicitud.prioridad ? "selected" : ""}>${escapeHtml(item)}</option>`).join("")}
              </select>
            </label>
          </div>
          ${activeDocumentTypes.length ? "" : "<p class='inline-warning'>No hay tipos de documento activos para reenviar la correccion.</p>"}
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
            <button class="button btn btn-primary" type="submit" ${activeDocumentTypes.length ? "" : "disabled"}>${icon("check")} Guardar correccion</button>
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
    <section class="chat-panel">
      <div class="compact-section-header">
        <h3>Conversacion</h3>
        <span data-comment-count>${comments.length ? `${comments.length} mensaje${comments.length === 1 ? "" : "s"}` : "Sin mensajes"}</span>
      </div>
      <div class="chat-thread" data-comment-list>
        ${comments.length ? comments.map((comment) => commentBubble(comment, data, user)).join("") : "<p class='chat-empty' data-comment-empty>Inicia la conversacion con un mensaje claro para el equipo.</p>"}
      </div>
      <form class="chat-composer" data-comment-form>
        <label class="visually-hidden" for="comentario-chat-${escapeAttr(solicitud.id)}">Escribir mensaje</label>
        <textarea id="comentario-chat-${escapeAttr(solicitud.id)}" class="form-control" name="comentario" rows="1" required placeholder="Escribe un mensaje para esta solicitud..."></textarea>
        <button class="button btn btn-primary" type="submit">Enviar</button>
      </form>
    </section>
    ${user.rol === ROLES.ADMIN ? `
      <section class="grid">
        <h3>Evidencia de firma avanzada</h3>
        <ul class="timeline">
          ${signatureEvidence.length ? signatureEvidence.map((entry) => `
            <li class="timeline-item audit-item">
              <div class="audit-row">
                <strong>${escapeHtml(entry.accion)}</strong>
                <small>${formatDate(entry.created_at)}</small>
              </div>
              <p>${escapeHtml(entry.nombre_usuario || "Usuario")} · ${escapeHtml(entry.correo_usuario || "")}</p>
              <small>Metodo: ${escapeHtml(entry.metodo)} · Version firma: ${escapeHtml(entry.firma_version)}${entry.ip ? ` · IP: ${escapeHtml(entry.ip)}` : ""}${entry.user_agent ? ` · ${escapeHtml(shortUserAgent(entry.user_agent))}` : ""}</small>
            </li>
          `).join("") : "<li class='empty-state'>Sin evidencias de firma.</li>"}
        </ul>
      </section>
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
        ${!userSignature ? `
          <p class="inline-warning">Registra tu firma en Perfil antes de aprobar. Puedes rechazar o solicitar correccion sin firma.</p>
        ` : ""}
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

  const commentList = view.querySelector("[data-comment-list]");
  const commentCount = view.querySelector("[data-comment-count]");
  const renderedCommentIds = new Set(comments.map((comment) => comment.id).filter(Boolean));
  updateChatScroll(commentList);

  const stopCommentRealtime = subscribeRequestComments({
    solicitud,
    data,
    user,
    renderedCommentIds,
    onNewComment: (comment) => {
      appendCommentToThread({ comment, data, user, commentList, commentCount, renderedCommentIds });
      onChange({ silent: true }).catch(() => {});
    }
  });
  cleanupWhenDetached(view, stopCommentRealtime);

  view.querySelectorAll("[data-download]").forEach((button) => {
    button.addEventListener("click", async () => {
      const file = files.find((item) => item.id === button.dataset.download);
      try {
        const url = file.data_url || await dataService.signedUrl(file.ruta_storage);
        if (url) window.open(url, "_blank", "noopener");
        await dataService.audit(user.id, solicitud.id, "DESCARGA_ARCHIVO", `Descarga de ${file.nombre_original}.`);
      } catch (error) {
        toast(error.message || "No fue posible descargar el archivo.", "error");
      }
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
        }, {
          canSign: canSign && (isPdf(file) || isImage(file)),
          signature: userSignature,
          solicitud,
          user,
          onSigned: async () => {
            closeFilePreview();
            const freshData = await onChange();
            const freshSolicitud = freshData?.solicitudes?.find((item) => item.id === solicitud.id);
            if (freshData && freshSolicitud) {
              openModal(renderRequestDetail({ solicitud: freshSolicitud, data: freshData, user, onChange }), { title: freshSolicitud.codigo });
            }
          }
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
    const formElement = event.currentTarget;
    const submitter = event.submitter;
    const form = new FormData(formElement);
    const message = String(form.get("comentario") || "").trim();
    if (!message) return;
    submitter.disabled = true;
    try {
      const comment = await dataService.addComment(solicitud.id, user.id, message);
      appendCommentToThread({ comment, data, user, commentList, commentCount, renderedCommentIds });
      formElement.reset();
      toast("Mensaje enviado.", "success");
      await onChange({ silent: true });
    } catch (error) {
      toast(error.message || "No fue posible enviar el mensaje.", "error");
    } finally {
      submitter.disabled = false;
    }
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

  view.querySelector("[data-complete-purchase-form]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submitter = event.submitter;
    const form = new FormData(event.currentTarget);
    submitter.disabled = true;
    const previousLabel = submitter.innerHTML;
    submitter.textContent = "Guardando...";
    try {
      await dataService.completePurchaseRequest(solicitud.id, form.get("comentario"), user);
      toast("Compra marcada como completada.", "success");
      closeModal();
      await onChange();
    } catch (error) {
      toast(error.message || "No fue posible completar la compra.", "error");
    } finally {
      submitter.innerHTML = previousLabel;
      submitter.disabled = false;
    }
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
  if (isImage(file)) {
    return `
      <div class="image-preview-stage" data-image-stage>
        <img class="quicklook-media quicklook-image" src="${escapeAttr(source)}" alt="${escapeAttr(file.nombre_original)}">
      </div>
    `;
  }
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

function openFilePreview(file, source, onDownload, signing = {}) {
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
          ${signing.canSign ? `<button class="button btn btn-primary btn-sm" type="button" data-sign-document>${icon("edit")} Agregar firma</button>` : ""}
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
  root.querySelector("[data-sign-document]")?.addEventListener("click", () => {
    startSigningMode({ root, file, source, signing });
  });
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

function startSigningMode({ root, file, source, signing }) {
  if (!signing.signature?.firma_data_url) {
    toast("Primero registra tu firma en Perfil.", "warning");
    return;
  }

  const body = root.querySelector(".quicklook-body");
  const signButton = root.querySelector("[data-sign-document]");
  signButton.disabled = true;
  body.classList.add("is-signing");
  root.querySelector("[data-signing-help]")?.remove();
  body.insertAdjacentHTML("afterbegin", `
    <div class="signing-help" data-signing-help>
      <span data-signing-message>Toca el documento, arrastra la firma y confirma cuando este lista.</span>
      <label class="signing-size-control">
        <span>Tamano</span>
        <input type="range" min="60" max="180" step="10" value="100" data-signature-size>
        <output data-signature-size-label>100%</output>
      </label>
      <div class="signing-actions">
        <button class="button btn btn-primary btn-sm signing-confirm-button" type="button" data-confirm-signature disabled>Confirmar firma</button>
        <button class="button secondary btn btn-outline-light btn-sm" type="button" data-cancel-signature>Cancelar</button>
      </div>
    </div>
  `);

  const sizeInput = root.querySelector("[data-signature-size]");
  const sizeLabel = root.querySelector("[data-signature-size-label]");
  const message = root.querySelector("[data-signing-message]");
  const confirmButton = root.querySelector("[data-confirm-signature]");
  const cancelButton = root.querySelector("[data-cancel-signature]");
  const placement = {
    target: null,
    stage: null,
    ratioX: 0.5,
    ratioY: 0.5,
    visualX: 0,
    visualY: 0,
    targetWidth: 0,
    pdfViewport: null,
    pageIndex: 0,
    sizeScale: Number(sizeInput.value) / 100,
    overlay: null
  };

  sizeInput.addEventListener("input", () => {
    sizeLabel.textContent = `${sizeInput.value}%`;
    placement.sizeScale = Number(sizeInput.value) / 100;
    updateSignatureOverlay(placement);
  });

  const targets = isPdf(file)
    ? [...root.querySelectorAll(".pdf-page canvas")]
    : [...root.querySelectorAll(".quicklook-image")];

  if (!targets.length) {
    toast("Espera a que el documento termine de cargar.", "warning");
    signButton.disabled = false;
    root.querySelector("[data-signing-help]")?.remove();
    body.classList.remove("is-signing");
    return;
  }

  const resetSigningMode = () => {
    removeSigningListeners(targets, placeHandler);
    placement.overlay?.remove();
    root.querySelector("[data-signing-help]")?.remove();
    body.classList.remove("is-signing");
    signButton.disabled = false;
  };

  const placeHandler = (event) => {
    event.preventDefault();
    updatePlacementFromPointer({ placement, target: event.currentTarget, event, file });
    renderSignatureOverlay({ placement, signing });
    confirmButton.disabled = false;
    message.textContent = "Ajusta el tamano o arrastra la firma. Luego confirma.";
  };

  const confirmHandler = async () => {
    if (!placement.target) return;
    confirmButton.disabled = true;
    cancelButton.disabled = true;
    message.textContent = "Aplicando firma...";
    try {
      const pin = await requestSignaturePin();
      if (!pin) {
        confirmButton.disabled = false;
        cancelButton.disabled = false;
        message.textContent = "Ajusta la firma y vuelve a confirmar.";
        return;
      }
      if (isPdf(file)) {
        await signPdfAtPoint({ file, source, signing, placement, pin });
      } else {
        await signImageAtPoint({ file, source, signing, placement, pin });
      }
      toast("Firma preparada. Pulsa Aprobar para publicar el documento firmado.", "success");
      await signing.onSigned?.();
    } catch (error) {
      toast(error.message || "No fue posible firmar el documento.", "error");
      confirmButton.disabled = false;
      cancelButton.disabled = false;
      message.textContent = "Ajusta la firma y vuelve a confirmar.";
    }
  };

  confirmButton.addEventListener("click", confirmHandler);
  cancelButton.addEventListener("click", resetSigningMode);
  targets.forEach((target) => {
    target.classList.add("signable-target");
    target.addEventListener("click", placeHandler);
  });
}

async function requestSignaturePin() {
  if (window.Swal) {
    const result = await window.Swal.fire({
      title: "PIN de firma",
      input: "password",
      inputLabel: "Confirma tu identidad para aplicar la firma",
      inputPlaceholder: "PIN numerico",
      inputAttributes: {
        inputmode: "numeric",
        maxlength: "12",
        autocomplete: "off"
      },
      showCancelButton: true,
      confirmButtonText: "Firmar documento",
      cancelButtonText: "Cancelar",
      preConfirm: (value) => {
        if (!/^[0-9]{4,12}$/.test(String(value || ""))) {
          window.Swal.showValidationMessage("Ingresa un PIN numerico de 4 a 12 digitos.");
          return false;
        }
        return value;
      }
    });
    return result.isConfirmed ? result.value : "";
  }

  return window.prompt("PIN de firma") || "";
}

function removeSigningListeners(targets, handler) {
  targets.forEach((target) => {
    target.classList.remove("signable-target");
    target.removeEventListener("click", handler);
  });
}

function updatePlacementFromPointer({ placement, target, event, file }) {
  const stage = isPdf(file) ? target.closest(".pdf-canvas-stage") : target.closest("[data-image-stage]");
  updatePlacementFromClientPoint({
    placement,
    target,
    stage,
    file,
    clientX: event.clientX,
    clientY: event.clientY
  });
}

function updatePlacementFromClientPoint({ placement, target, stage, file, clientX, clientY }) {
  const targetRect = target.getBoundingClientRect();
  const stageRect = stage.getBoundingClientRect();
  placement.target = target;
  placement.stage = stage;
  placement.pageIndex = Number(target.dataset.pageIndex || 0);
  placement.ratioX = clamp((clientX - targetRect.left) / targetRect.width, 0, 1);
  placement.ratioY = clamp((clientY - targetRect.top) / targetRect.height, 0, 1);
  placement.visualX = (targetRect.left - stageRect.left) + (placement.ratioX * targetRect.width);
  placement.visualY = (targetRect.top - stageRect.top) + (placement.ratioY * targetRect.height);
  placement.targetWidth = targetRect.width;
  placement.pdfViewport = isPdf(file) ? target._sadPdfViewport || null : null;
}

function renderSignatureOverlay({ placement, signing }) {
  placement.overlay?.remove();
  const overlay = document.createElement("div");
  overlay.className = "signature-placement";
  overlay.innerHTML = `<img src="${escapeAttr(signing.signature.firma_data_url)}" alt="Firma">`;
  placement.stage.append(overlay);
  placement.overlay = overlay;
  const image = overlay.querySelector("img");
  signatureInkDataUrl(signing.signature.firma_data_url).then((blueSignature) => {
    if (placement.overlay === overlay) image.src = blueSignature;
  }).catch(() => {});
  updateSignatureOverlay(placement);
  enableSignatureDrag(placement);
}

function updateSignatureOverlay(placement) {
  if (!placement.overlay) return;
  const widthPx = clamp((placement.targetWidth || placement.stage.getBoundingClientRect().width) * 0.32 * placement.sizeScale, 64, 320);
  placement.overlay.style.left = `${placement.visualX}px`;
  placement.overlay.style.top = `${placement.visualY}px`;
  placement.overlay.style.width = `${widthPx}px`;
}

function enableSignatureDrag(placement) {
  const overlay = placement.overlay;
  overlay.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    event.stopPropagation();
    overlay.setPointerCapture(event.pointerId);
    const move = (moveEvent) => {
      updatePlacementFromClientPoint({
        placement,
        target: placement.target,
        stage: placement.stage,
        file: placement.target?.dataset.pdfPage === "true" ? { extension: "pdf" } : { extension: "image" },
        clientX: moveEvent.clientX,
        clientY: moveEvent.clientY
      });
      updateSignatureOverlay(placement);
    };
    const stop = () => {
      overlay.removeEventListener("pointermove", move);
      overlay.removeEventListener("pointerup", stop);
      overlay.removeEventListener("pointercancel", stop);
    };
    overlay.addEventListener("pointermove", move);
    overlay.addEventListener("pointerup", stop);
    overlay.addEventListener("pointercancel", stop);
  });
}

async function signPdfAtPoint({ file, source, signing, placement, pin }) {
  const { PDFDocument, degrees } = await getPdfLib();
  const pdfBytes = await fetchBytes(source);
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const page = pdfDoc.getPages()[placement.pageIndex];
  if (!page) throw new Error("No se pudo ubicar la pagina seleccionada.");

  const signatureBytes = dataUrlToBytes(await signatureInkDataUrl(signing.signature.firma_data_url));
  const signatureImage = await pdfDoc.embedPng(signatureBytes);
  const { width: pageWidth, height: pageHeight } = page.getSize();
  const pdfRect = pdfSignatureRect({ placement, signatureImage, pageWidth, pageHeight });
  const imageWidth = pdfRect.width;
  const imageHeight = pdfRect.height;
  const x = clamp(pdfRect.x, 0, Math.max(0, pageWidth - imageWidth));
  const y = clamp(pdfRect.y, 0, Math.max(0, pageHeight - imageHeight));
  const rotation = normalizePdfRotation(page.getRotation()?.angle || 0);

  page.drawImage(signatureImage, rotatedPdfImageOptions({ x, y, width: imageWidth, height: imageHeight, rotation, degrees }));

  const signedBytes = await pdfDoc.save();
  const blob = new Blob([signedBytes], { type: "application/pdf" });
  await dataService.saveSignedDraft({
    solicitudId: signing.solicitud.id,
    sourceFile: file,
    userId: signing.user.id,
    blob,
    extension: "pdf",
    mimeType: "application/pdf",
    pin
  });
}

function pdfSignatureRect({ placement, signatureImage, pageWidth, pageHeight }) {
  const aspect = signatureImage.height / signatureImage.width;
  const viewport = placement.pdfViewport;
  if (!viewport?.convertToPdfPoint) {
    const width = Math.min(Math.min(260, pageWidth * 0.32) * placement.sizeScale, pageWidth - 24);
    const height = width * aspect;
    return {
      x: (placement.ratioX * pageWidth) - (width / 2),
      y: ((1 - placement.ratioY) * pageHeight) - (height / 2),
      width,
      height
    };
  }

  const viewportWidth = Math.max(1, viewport.width);
  const centerX = placement.ratioX * viewportWidth;
  const centerY = placement.ratioY * Math.max(1, viewport.height);
  const visualWidth = clamp(viewportWidth * 0.32 * placement.sizeScale, 64, Math.min(320, viewportWidth));
  const visualHeight = visualWidth * aspect;
  const topLeft = viewport.convertToPdfPoint(centerX - (visualWidth / 2), centerY - (visualHeight / 2));
  const bottomRight = viewport.convertToPdfPoint(centerX + (visualWidth / 2), centerY + (visualHeight / 2));
  const x = Math.min(topLeft[0], bottomRight[0]);
  const y = Math.min(topLeft[1], bottomRight[1]);
  const width = Math.abs(bottomRight[0] - topLeft[0]);
  const height = Math.abs(bottomRight[1] - topLeft[1]);

  return {
    x,
    y,
    width: clamp(width, 24, pageWidth),
    height: clamp(height, 12, pageHeight)
  };
}

function normalizePdfRotation(value) {
  return ((Number(value) % 360) + 360) % 360;
}

function rotatedPdfImageOptions({ x, y, width, height, rotation, degrees }) {
  if (rotation === 180) {
    return { x: x + width, y: y + height, width, height, rotate: degrees(180) };
  }
  if (rotation === 90) {
    return { x: x + height, y, width, height, rotate: degrees(90) };
  }
  if (rotation === 270) {
    return { x, y: y + width, width, height, rotate: degrees(270) };
  }
  return { x, y, width, height };
}

async function signImageAtPoint({ file, source, signing, placement, pin }) {
  const imageUrl = await fetchObjectUrl(source);
  try {
    const image = await loadImage(imageUrl);
    const signatureImage = await loadImage(await signatureInkDataUrl(signing.signature.firma_data_url));
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth || image.width;
    canvas.height = image.naturalHeight || image.height;
    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    const signatureWidth = Math.min(Math.min(canvas.width * 0.32, 620) * placement.sizeScale, canvas.width - 24);
    const signatureHeight = signatureWidth * (signatureImage.height / signatureImage.width);
    const x = clamp((placement.ratioX * canvas.width) - (signatureWidth / 2), 12, canvas.width - signatureWidth - 12);
    const y = clamp((placement.ratioY * canvas.height) - (signatureHeight / 2), 12, canvas.height - signatureHeight - 28);

    context.drawImage(signatureImage, x, y, signatureWidth, signatureHeight);

    const blob = await canvasToBlob(canvas, "image/jpeg", 0.88);
    await dataService.saveSignedDraft({
      solicitudId: signing.solicitud.id,
      sourceFile: file,
      userId: signing.user.id,
      blob,
      extension: "jpg",
      mimeType: "image/jpeg",
      pin
    });
  } finally {
    URL.revokeObjectURL(imageUrl);
  }
}

function closeFilePreview() {
  const root = document.querySelector("#file-preview-root");
  if (!root) return;
  window.removeEventListener("keydown", root.handleFilePreviewKeydown, true);
  root.remove();
  document.body.classList.remove("file-preview-open");
}

function appendCommentToThread({ comment, data, user, commentList, commentCount, renderedCommentIds }) {
  if (!commentList || !comment) return;
  const key = comment.id || `${comment.usuario_id}-${comment.created_at}-${comment.comentario}`;
  if (renderedCommentIds.has(key)) return;

  const normalized = {
    ...comment,
    usuario: comment.usuario || data.profiles.find((profile) => profile.id === comment.usuario_id) || null
  };

  renderedCommentIds.add(key);
  if (comment.id && !data.comentarios.some((item) => item.id === comment.id)) {
    data.comentarios.push(normalized);
  }

  commentList.querySelector("[data-comment-empty]")?.remove();
  commentList.insertAdjacentHTML("beforeend", commentBubble(normalized, data, user));
  updateCommentCount(commentCount, commentList);
  updateChatScroll(commentList);
}

function updateCommentCount(commentCount, commentList) {
  if (!commentCount || !commentList) return;
  const total = commentList.querySelectorAll(".chat-message").length;
  commentCount.textContent = total ? `${total} mensaje${total === 1 ? "" : "s"}` : "Sin mensajes";
}

function updateChatScroll(commentList) {
  if (!commentList) return;
  requestAnimationFrame(() => {
    commentList.scrollTop = commentList.scrollHeight;
  });
}

function subscribeRequestComments({ solicitud, data, user, renderedCommentIds, onNewComment }) {
  let channel = null;
  let disposed = false;

  getSupabase()
    .then((supabase) => {
      if (disposed) return;
      channel = supabase
        .channel(`sad-chat-${solicitud.id}-${crypto.randomUUID()}`)
        .on("postgres_changes", {
          event: "INSERT",
          schema: "public",
          table: "comentarios",
          filter: `solicitud_id=eq.${solicitud.id}`
        }, (payload) => {
          const comment = {
            ...payload.new,
            usuario: data.profiles.find((profile) => profile.id === payload.new.usuario_id) || null
          };
          if (comment.id && renderedCommentIds.has(comment.id)) return;
          onNewComment(comment);
          if (comment.usuario_id !== user.id) toast("Nuevo mensaje recibido.", "info");
        })
        .subscribe();
    })
    .catch((error) => {
      console.warn("No se pudo iniciar el chat en tiempo real.", error);
    });

  return async () => {
    disposed = true;
    if (!channel) return;
    const supabase = await getSupabase();
    await supabase.removeChannel(channel);
    channel = null;
  };
}

function cleanupWhenDetached(element, cleanup) {
  const observer = new MutationObserver(() => {
    if (document.body.contains(element)) return;
    observer.disconnect();
    cleanup();
  });
  observer.observe(document.body, { childList: true, subtree: true });
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

async function getPdfLib() {
  if (!pdfLibPromise) pdfLibPromise = import(PDF_LIB_URL);
  return pdfLibPromise;
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
    const targetWidth = Math.min(920, Math.max(260, container.clientWidth - 18));
    const scale = targetWidth / viewport.width;
    const scaledViewport = page.getViewport({ scale });
    const outputScale = Math.min(window.devicePixelRatio || 1, 3);
    const pageBox = document.createElement("article");
    pageBox.className = "pdf-page";
    pageBox.innerHTML = `<span>Pagina ${pageNumber} de ${pdf.numPages}</span>`;
    const canvasStage = document.createElement("div");
    canvasStage.className = "pdf-canvas-stage";
    const canvas = document.createElement("canvas");
    canvas.dataset.pageIndex = String(pageNumber - 1);
    canvas.dataset.pdfPage = "true";
    canvas._sadPdfViewport = scaledViewport;
    const context = canvas.getContext("2d");
    canvas.width = Math.floor(scaledViewport.width * outputScale);
    canvas.height = Math.floor(scaledViewport.height * outputScale);
    canvas.style.width = `${Math.floor(scaledViewport.width)}px`;
    canvas.style.height = `${Math.floor(scaledViewport.height)}px`;
    canvasStage.append(canvas);
    pageBox.append(canvasStage);
    pages.append(pageBox);
    await page.render({
      canvasContext: context,
      viewport: scaledViewport,
      transform: outputScale === 1 ? null : [outputScale, 0, 0, outputScale, 0, 0]
    }).promise;
  }
}

async function fetchBytes(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error("No se pudo leer el archivo original.");
  return new Uint8Array(await response.arrayBuffer());
}

async function fetchObjectUrl(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error("No se pudo leer la imagen original.");
  return URL.createObjectURL(await response.blob());
}

function dataUrlToBytes(dataUrl) {
  const base64 = String(dataUrl || "").split(",")[1] || "";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function signatureInkDataUrl(dataUrl) {
  if (!dataUrl) return dataUrl;
  if (signatureTintCache.has(dataUrl)) return signatureTintCache.get(dataUrl);

  const tinted = loadImage(dataUrl).then((image) => {
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth || image.width;
    canvas.height = image.naturalHeight || image.height;
    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    context.globalCompositeOperation = "source-in";
    context.fillStyle = SIGNATURE_INK_COLOR;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.globalCompositeOperation = "source-over";
    return canvas.toDataURL("image/png");
  });

  signatureTintCache.set(dataUrl, tinted);
  return tinted;
}

function loadImage(source) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("No se pudo cargar la imagen."));
    image.src = source;
  });
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("No se pudo generar la imagen firmada."));
    }, type, quality);
  });
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function profileName(data, id) {
  const profile = data.profiles.find((item) => item.id === id);
  return profile ? `${profile.nombre} ${profile.apellido}` : "Usuario";
}

function commentBubble(comment, data, user) {
  const isMine = comment.usuario_id === user.id;
  const name = isMine
    ? "Tu"
    : comment.usuario
      ? `${comment.usuario.nombre || ""} ${comment.usuario.apellido || ""}`.trim() || comment.usuario.correo
      : profileName(data, comment.usuario_id);
  return `
    <article class="chat-message ${isMine ? "is-mine" : "is-other"}">
      <div class="chat-bubble">
        <div class="chat-meta">
          <strong>${escapeHtml(name)}</strong>
          <time>${formatDate(comment.created_at)}</time>
        </div>
        <p>${escapeHtml(comment.comentario)}</p>
      </div>
    </article>
  `;
}

function approvalsForRequest(data, solicitudId) {
  return data.solicitud_aprobadores
    .filter((item) => item.solicitud_id === solicitudId)
    .sort((a, b) => a.orden - b.orden);
}

function assignmentForUser(data, solicitudId, userId) {
  return data.solicitud_aprobadores.find((item) => item.solicitud_id === solicitudId && item.usuario_id === userId);
}

function executionDuration(solicitud) {
  const start = solicitud.fecha_aprobacion || solicitud.updated_at;
  if (!start) return "-";
  const end = solicitud.fecha_completada || new Date().toISOString();
  const minutes = Math.max(0, Math.round((new Date(end) - new Date(start)) / 60000));
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  if (days) return `${days} dia${days === 1 ? "" : "s"} ${hours} h`;
  if (hours) return `${hours} h ${mins} min`;
  return `${mins} min`;
}

function shortUserAgent(value = "") {
  return value.length > 90 ? `${value.slice(0, 90)}...` : value;
}
