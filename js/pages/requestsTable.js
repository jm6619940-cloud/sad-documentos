import { ROLES } from "../utils/constants.js";
import { formatDate, normalize } from "../utils/format.js";
import { icon } from "../components/icons.js";
import { pageTitle } from "../components/layout.js";
import { openModal } from "../components/modal.js";
import { renderRequestDetail } from "./requestDetail.js?v=20260706-6";
import { escapeAttr, escapeHtml, textOrDash } from "../utils/security.js";

export function renderRequestsTable({ mode, user, data, refresh }) {
  const isPending = mode === "pending";
  const isHistory = mode === "history";
  const usePriorityFilter = isPending && user.rol === ROLES.APPROVER;
  const page = document.createElement("div");
  page.className = "grid";
  page.append(pageTitle(
    isPending ? "Pendientes" : isHistory ? "Historial" : "Mis solicitudes",
    isPending ? "Solicitudes listas para revision." : isHistory ? "Consulta global con filtros." : "Seguimiento de tus solicitudes."
  ));
  page.insertAdjacentHTML("beforeend", `
    <section class="panel">
      <div class="panel-header">
        <h2>${isPending ? "Cola de aprobacion" : "Solicitudes"}</h2>
        <div class="toolbar">
          <input class="input form-control" data-filter="text" placeholder="Buscar">
          ${usePriorityFilter
            ? `<select class="form-select" data-filter="prioridad"><option value="">Prioridad</option>${unique(data.solicitudes.map((item) => item.prioridad)).map(option).join("")}</select>`
            : `<select class="form-select" data-filter="estado"><option value="">Estado</option>${unique(data.solicitudes.map((item) => item.estado)).map(option).join("")}</select>`}
          <select class="form-select" data-filter="tipo"><option value="">Tipo</option>${data.tipos_documento.map((item) => `<option value="${escapeAttr(item.id)}">${escapeHtml(item.nombre)}</option>`).join("")}</select>
        </div>
      </div>
      <div class="table-wrap" data-table></div>
    </section>
  `);

  const renderRows = () => {
    const filters = Object.fromEntries([...page.querySelectorAll("[data-filter]")].map((input) => [input.dataset.filter, input.value]));
    const rows = filteredRows({ mode, user, data, filters });
    page.querySelector("[data-table]").innerHTML = `
      <table class="table table-hover align-middle">
        <thead>
          <tr>
            <th>Codigo</th>
            ${isPending || isHistory ? "<th>Solicitante</th><th>Departamento</th>" : ""}
            <th>Estado</th>
            <th>Tipo</th>
            <th>Prioridad</th>
            <th>Aprobadores</th>
            <th>Fecha</th>
            <th>Ultima actualizacion</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((item) => `
            <tr>
              <td data-label="Codigo"><strong>${escapeHtml(item.codigo)}</strong></td>
              ${isPending || isHistory ? `<td data-label="Solicitante">${textOrDash(`${item.creador?.nombre || ""} ${item.creador?.apellido || ""}`)}</td><td data-label="Departamento">${textOrDash(item.departamento?.nombre)}</td>` : ""}
              <td data-label="Estado"><span class="badge ${escapeAttr(item.estado.split(" ")[0])}">${escapeHtml(item.estado)}</span></td>
              <td data-label="Tipo">${textOrDash(item.tipo?.nombre)}</td>
              <td data-label="Prioridad"><span class="badge ${escapeAttr(item.prioridad)}">${escapeHtml(item.prioridad)}</span></td>
              <td data-label="Aprobadores">${approverSummary(data, item.id)}</td>
              <td data-label="Fecha">${formatDate(item.created_at)}</td>
              <td data-label="Actualizacion">${formatDate(item.updated_at)}</td>
              <td data-label=""><button class="button secondary btn btn-outline-secondary btn-sm" data-detail="${escapeAttr(item.id)}">${icon("eye")} Ver</button></td>
            </tr>
          `).join("") || `<tr><td data-label="" colspan="10">No hay resultados.</td></tr>`}
        </tbody>
      </table>
    `;
    page.querySelectorAll("[data-detail]").forEach((button) => {
      button.addEventListener("click", () => {
        const solicitud = data.solicitudes.find((item) => item.id === button.dataset.detail);
        openModal(renderRequestDetail({ solicitud, data, user, onChange: refresh }), { title: solicitud.codigo });
      });
    });
  };

  page.querySelectorAll("[data-filter]").forEach((input) => input.addEventListener("input", renderRows));
  renderRows();
  return page;
}

function filteredRows({ mode, user, data, filters }) {
  return data.solicitudes.filter((item) => {
    if (mode === "my-requests" && user.rol !== ROLES.ADMIN && item.creado_por !== user.id) return false;
    if (mode === "pending" && item.estado !== "Pendiente") return false;
    if (mode === "pending" && user.rol === ROLES.APPROVER && !assignedToUser(data, item.id, user.id, "Pendiente")) return false;
    if (mode === "history" && user.rol === ROLES.APPROVER && !assignedToUser(data, item.id, user.id)) return false;
    if (filters.estado && item.estado !== filters.estado) return false;
    if (filters.prioridad && item.prioridad !== filters.prioridad) return false;
    if (filters.tipo && item.tipo_documento_id !== filters.tipo) return false;
    if (filters.text) {
      const haystack = normalize(`${item.codigo} ${item.titulo} ${item.descripcion} ${item.creador?.nombre || ""} ${item.departamento?.nombre || ""}`);
      if (!haystack.includes(normalize(filters.text))) return false;
    }
    return true;
  });
}

function assignedToUser(data, solicitudId, userId, estado = "") {
  return data.solicitud_aprobadores.some((item) => (
    item.solicitud_id === solicitudId
    && item.usuario_id === userId
    && (!estado || item.estado === estado)
  ));
}

function approverSummary(data, solicitudId) {
  const rows = data.solicitud_aprobadores
    .filter((item) => item.solicitud_id === solicitudId)
    .sort((a, b) => a.orden - b.orden);
  if (!rows.length) return "<span class='text-muted'>Sin asignar</span>";
  return `
    <div class="approval-summary">
      ${rows.map((row) => `
        <span class="approval-chip">
          ${escapeHtml(profileName(data, row.usuario_id))}
          <span class="badge ${escapeAttr(row.estado.split(" ")[0])}">${escapeHtml(row.estado)}</span>
        </span>
      `).join("")}
    </div>
  `;
}

function profileName(data, id) {
  const profile = data.profiles.find((item) => item.id === id);
  return profile ? `${profile.nombre} ${profile.apellido}`.trim() || profile.correo : "Aprobador";
}

function unique(items) {
  return [...new Set(items.filter(Boolean))];
}

function option(value) {
  return `<option value="${escapeAttr(value)}">${escapeHtml(value)}</option>`;
}
