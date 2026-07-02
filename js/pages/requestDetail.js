import { ROLES, STATUS } from "../utils/constants.js";
import { formatBytes, formatDate } from "../utils/format.js";
import { dataService } from "../services/dataService.js";
import { toast } from "../components/toast.js";
import { icon } from "../components/icons.js";
import { escapeAttr, escapeHtml, textOrDash } from "../utils/security.js";

function canApprove(user, solicitud) {
  return [ROLES.ADMIN, ROLES.APPROVER].includes(user.rol) && solicitud.estado === STATUS.PENDING;
}

function canSee(user, solicitud) {
  return user.rol === ROLES.ADMIN || solicitud.creado_por === user.id || user.rol === ROLES.APPROVER;
}

export function renderRequestDetail({ solicitud, data, user, onChange }) {
  if (!canSee(user, solicitud)) {
    const denied = document.createElement("p");
    denied.textContent = "No tienes permisos para ver esta solicitud.";
    return denied;
  }

  const files = data.archivos.filter((file) => file.solicitud_id === solicitud.id);
  const comments = data.comentarios.filter((comment) => comment.solicitud_id === solicitud.id);
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
            ${previewMarkup(file)}
            <button class="button secondary btn btn-outline-secondary btn-sm" data-download="${escapeAttr(file.id)}">${icon("download")} Descargar</button>
          </li>
        `).join("") : "<li class='empty-state'>No hay archivos adjuntos.</li>"}
      </ul>
    </section>
    <section class="grid">
      <h3>Comentarios</h3>
      <ul class="timeline">
        ${comments.length ? comments.map((comment) => `<li class="timeline-item"><strong>${escapeHtml(comment.usuario?.nombre || profileName(data, comment.usuario_id))}</strong><p>${escapeHtml(comment.comentario)}</p><small>${formatDate(comment.created_at)}</small></li>`).join("") : "<li class='empty-state'>Sin comentarios.</li>"}
      </ul>
      <form class="form" data-comment-form>
        <label class="field"><span>Agregar comentario</span><textarea class="form-control" name="comentario" rows="2" required></textarea></label>
        <button class="button secondary btn btn-outline-secondary" type="submit">Agregar comentario</button>
      </form>
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
    ${canApprove(user, solicitud) ? `
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

  view.querySelector("[data-comment-form]").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await dataService.addComment(solicitud.id, user.id, form.get("comentario"));
    toast("Comentario agregado.", "success");
    await onChange();
  });

  view.querySelector("[data-action-form]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submitter = event.submitter;
    const form = new FormData(event.currentTarget);
    await dataService.actOnRequest(solicitud.id, user, submitter.value, form.get("comentario"));
    toast("Decision registrada.", "success");
    await onChange();
  });

  return view;
}

function previewMarkup(file) {
  const source = file.data_url || "";
  if (!source) return "";
  if (["jpg", "jpeg", "png", "webp"].includes(file.extension)) return `<img class="preview" src="${escapeAttr(source)}" alt="${escapeAttr(file.nombre_original)}">`;
  if (file.extension === "pdf") return `<iframe class="preview" src="${escapeAttr(source)}" title="${escapeAttr(file.nombre_original)}"></iframe>`;
  return "";
}

function profileName(data, id) {
  const profile = data.profiles.find((item) => item.id === id);
  return profile ? `${profile.nombre} ${profile.apellido}` : "Usuario";
}

function shortUserAgent(value = "") {
  return value.length > 90 ? `${value.slice(0, 90)}...` : value;
}
