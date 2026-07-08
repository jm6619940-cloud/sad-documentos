import { ROLES } from "../utils/constants.js";
import { formatDateTimeCompact, normalize } from "../utils/format.js?v=20260708-12";
import { icon } from "../components/icons.js";
import { pageTitle } from "../components/layout.js";
import { openModal } from "../components/modal.js";
import { renderRequestDetail } from "./requestDetail.js?v=20260708-12";
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
    const gridClass = isPending || isHistory ? "request-grid-wide" : "request-grid-own";
    page.querySelector("[data-table]").innerHTML = `
      <div class="request-list ${gridClass}" role="table">
        <div class="request-grid request-header" role="row">
          <span role="columnheader">Titulo</span>
          ${isPending || isHistory ? `<span role="columnheader">Solicitante</span><span role="columnheader">Departamento</span>` : ""}
          <span role="columnheader">Estado</span>
          <span role="columnheader">Tipo</span>
          <span role="columnheader">Prioridad</span>
          <span role="columnheader">Aprobadores</span>
          <span role="columnheader">Fecha</span>
          <span role="columnheader">Ultima actualizacion</span>
          <span role="columnheader"></span>
        </div>
        <div class="request-list-body">
          ${rows.map((item) => `
            <div class="request-grid request-row clickable-row" data-row-detail="${escapeAttr(item.id)}" role="row" tabindex="0">
              <div class="request-cell request-cell-title" data-label="Titulo" role="cell" title="${escapeAttr(item.titulo || item.codigo)}"><strong class="cell-ellipsis">${escapeHtml(item.titulo || item.codigo)}</strong></div>
              ${isPending || isHistory ? `<div class="request-cell request-cell-person" data-label="Solicitante" role="cell" title="${escapeAttr(`${item.creador?.nombre || ""} ${item.creador?.apellido || ""}`.trim())}"><span class="cell-ellipsis">${textOrDash(`${item.creador?.nombre || ""} ${item.creador?.apellido || ""}`)}</span></div><div class="request-cell request-cell-department" data-label="Departamento" role="cell" title="${escapeAttr(item.departamento?.nombre || "")}"><span class="cell-ellipsis">${textOrDash(item.departamento?.nombre)}</span></div>` : ""}
              <div class="request-cell request-cell-status" data-label="Estado" role="cell"><span class="badge ${escapeAttr(item.estado.split(" ")[0])}">${escapeHtml(item.estado)}</span></div>
              <div class="request-cell request-cell-type" data-label="Tipo" role="cell" title="${escapeAttr(item.tipo?.nombre || "")}"><span class="cell-ellipsis">${textOrDash(item.tipo?.nombre)}</span></div>
              <div class="request-cell request-cell-priority" data-label="Prioridad" role="cell"><span class="badge ${escapeAttr(item.prioridad)}">${escapeHtml(item.prioridad)}</span></div>
              <div class="request-cell request-cell-approvers" data-label="Aprobadores" role="cell">${approverSummary(data, item.id)}</div>
              <div class="request-cell request-cell-date" data-label="Fecha" role="cell"><span class="cell-ellipsis compact-date">${formatDateTimeCompact(item.created_at)}</span></div>
              <div class="request-cell request-cell-date" data-label="Actualizacion" role="cell"><span class="cell-ellipsis compact-date">${formatDateTimeCompact(item.updated_at)}</span></div>
              <div class="request-cell request-actions" data-label="" role="cell"><button class="button secondary btn btn-outline-secondary btn-sm" data-detail="${escapeAttr(item.id)}">${icon("eye")} Ver</button></div>
            </div>
          `).join("") || `<div class="empty-state">No hay resultados.</div>`}
        </div>
      </div>
    `;
    page.querySelectorAll("[data-detail]").forEach((button) => {
      button.addEventListener("click", () => {
        openDetail(button.dataset.detail);
      });
    });
    page.querySelectorAll("[data-row-detail]").forEach((row) => {
      row.addEventListener("click", (event) => {
        if (event.target.closest("button, a, input, select, textarea, label")) return;
        openDetail(row.dataset.rowDetail);
      });
      row.addEventListener("keydown", (event) => {
        if (!["Enter", " "].includes(event.key)) return;
        event.preventDefault();
        openDetail(row.dataset.rowDetail);
      });
    });
  };

  const openDetail = (id) => {
    const solicitud = data.solicitudes.find((item) => item.id === id);
    if (!solicitud) return;
    openModal(renderRequestDetail({ solicitud, data, user, onChange: refresh }), { title: solicitud.codigo });
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
          <span class="approval-name">${escapeHtml(profileName(data, row.usuario_id))}</span>
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
