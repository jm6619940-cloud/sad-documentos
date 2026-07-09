import { ROLES } from "../utils/constants.js";
import { formatDateTimeCompact, normalize } from "../utils/format.js?v=20260708-12";
import { icon } from "../components/icons.js";
import { pageTitle } from "../components/layout.js";
import { openModal } from "../components/modal.js";
import { renderRequestDetail } from "./requestDetail.js?v=20260708-12";
import { escapeAttr, escapeHtml, textOrDash } from "../utils/security.js";

const TABLE_STATE = new Map();
const PAGE_SIZE_OPTIONS = [15, 25, 50, 100, "all"];

export function renderRequestsTable({ mode, user, data, refresh }) {
  const isPending = mode === "pending";
  const isHistory = mode === "history";
  const usePriorityFilter = isPending && user.rol === ROLES.APPROVER;
  const stateKey = `${user.id}:${user.rol}:${mode}`;
  const tableState = TABLE_STATE.get(stateKey) || { currentPage: 1, pageSize: 15 };
  TABLE_STATE.set(stateKey, tableState);
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
          <select class="form-select" data-filter="dias">
            <option value="">Todos los dias</option>
            <option value="today">Hoy</option>
            <option value="7">Ultimos 7 dias</option>
            <option value="30">Ultimos 30 dias</option>
            <option value="month">Este mes</option>
          </select>
        </div>
      </div>
      <div class="table-controls">
        <label class="page-size-control">
          <span>Mostrar</span>
          <select class="form-select" data-page-size>
            ${PAGE_SIZE_OPTIONS.map((value) => `<option value="${value}" ${String(tableState.pageSize) === String(value) ? "selected" : ""}>${value === "all" ? "Todas" : value}</option>`).join("")}
          </select>
        </label>
      </div>
      <div class="table-wrap" data-table></div>
    </section>
  `);

  const renderRows = () => {
    const filters = Object.fromEntries([...page.querySelectorAll("[data-filter]")].map((input) => [input.dataset.filter, input.value]));
    const rows = filteredRows({ mode, user, data, filters });
    const pageSize = tableState.pageSize;
    const totalPages = pageSize === "all" ? 1 : Math.max(1, Math.ceil(rows.length / pageSize));
    tableState.currentPage = clamp(tableState.currentPage, 1, totalPages);
    const visibleRows = pageSize === "all"
      ? rows
      : rows.slice((tableState.currentPage - 1) * pageSize, tableState.currentPage * pageSize);
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
          ${visibleRows.map((item) => `
            <div class="request-grid request-row clickable-row" data-row-detail="${escapeAttr(item.id)}" role="row" tabindex="0">
              <div class="request-cell request-cell-title" data-label="Titulo" role="cell" title="${escapeAttr(item.titulo || item.codigo)}"><strong class="cell-ellipsis">${escapeHtml(item.titulo || item.codigo)}</strong></div>
              ${isPending || isHistory ? `<div class="request-cell request-cell-person" data-label="Solicitante" role="cell" title="${escapeAttr(`${item.creador?.nombre || ""} ${item.creador?.apellido || ""}`.trim())}"><span class="cell-ellipsis">${textOrDash(`${item.creador?.nombre || ""} ${item.creador?.apellido || ""}`)}</span></div><div class="request-cell request-cell-department" data-label="Departamento" role="cell" title="${escapeAttr(item.departamento?.nombre || "")}"><span class="cell-ellipsis">${textOrDash(item.departamento?.nombre)}</span></div>` : ""}
              <div class="request-cell request-cell-status" data-label="Estado" role="cell">${statusSummary(item)}</div>
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
      ${paginationMarkup(rows.length, visibleRows.length, tableState.currentPage, totalPages, pageSize)}
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
    page.querySelectorAll("[data-page]").forEach((button) => {
      button.addEventListener("click", () => {
        tableState.currentPage = Number(button.dataset.page);
        renderRows();
      });
    });
    page.querySelector("[data-page-prev]")?.addEventListener("click", () => {
      tableState.currentPage -= 1;
      renderRows();
    });
    page.querySelector("[data-page-next]")?.addEventListener("click", () => {
      tableState.currentPage += 1;
      renderRows();
    });
  };

  const openDetail = (id) => {
    const solicitud = data.solicitudes.find((item) => item.id === id);
    if (!solicitud) return;
    openModal(renderRequestDetail({ solicitud, data, user, onChange: refresh }), { title: solicitud.codigo });
  };

  const refreshFilteredRows = () => {
    tableState.currentPage = 1;
    renderRows();
  };
  page.querySelectorAll("[data-filter]").forEach((input) => {
    input.addEventListener("input", refreshFilteredRows);
    input.addEventListener("change", refreshFilteredRows);
  });
  page.querySelector("[data-page-size]").addEventListener("change", (event) => {
    tableState.pageSize = event.target.value === "all" ? "all" : Number(event.target.value);
    tableState.currentPage = 1;
    renderRows();
  });
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
    if (filters.dias && !matchesDayFilter(item.created_at, filters.dias)) return false;
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

function statusSummary(item) {
  const execution = isPurchaseRequest(item) && item.estado === "Aprobado"
    ? `<span class="badge ${item.ejecucion_estado === "Completada" ? "Aprobado" : "Pendiente"}">${escapeHtml(item.ejecucion_estado || "Pendiente")}</span>`
    : "";
  return `
    <div class="status-stack">
      <span class="badge ${escapeAttr(item.estado.split(" ")[0])}">${escapeHtml(item.estado)}</span>
      ${execution}
    </div>
  `;
}

function isPurchaseRequest(item) {
  return normalizePurchaseText(`${item.tipo?.nombre || ""} ${item.departamento?.nombre || ""}`).includes("compra");
}

function normalizePurchaseText(value = "") {
  return String(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function clamp(value, min, max) {
  return Math.min(Math.max(Number(value) || min, min), max);
}

function matchesDayFilter(value, filter) {
  if (!value) return false;
  const date = new Date(value);
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);

  if (filter === "today") return date >= start;
  if (filter === "month") {
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    return date >= monthStart;
  }

  const days = Number(filter);
  if (!days) return true;
  const since = new Date(now);
  since.setDate(now.getDate() - (days - 1));
  since.setHours(0, 0, 0, 0);
  return date >= since;
}

function paginationMarkup(totalRows, visibleRows, currentPage, totalPages, pageSize) {
  const start = totalRows === 0 || pageSize === "all" ? (totalRows ? 1 : 0) : ((currentPage - 1) * pageSize) + 1;
  const end = pageSize === "all" ? totalRows : Math.min(totalRows, start + visibleRows - 1);
  const pages = paginationPages(currentPage, totalPages);
  return `
    <div class="pagination-bar">
      <span class="pagination-summary">${escapeHtml(summaryText(start, end, totalRows))}</span>
      <div class="pagination-actions" aria-label="Paginacion">
        <button class="icon-button pagination-button" type="button" data-page-prev ${currentPage <= 1 ? "disabled" : ""} aria-label="Pagina anterior">${icon("chevronLeft")}</button>
        ${pages.map((page) => page === "gap"
          ? `<span class="pagination-gap">...</span>`
          : `<button class="pagination-page ${page === currentPage ? "active" : ""}" type="button" data-page="${page}" ${page === currentPage ? "aria-current=\"page\"" : ""}>${page}</button>`
        ).join("")}
        <button class="icon-button pagination-button" type="button" data-page-next ${currentPage >= totalPages ? "disabled" : ""} aria-label="Pagina siguiente">${icon("chevronRight")}</button>
      </div>
    </div>
  `;
}

function paginationPages(currentPage, totalPages) {
  if (totalPages <= 1) return [1];
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, index) => index + 1);
  const pages = new Set([1, totalPages, currentPage, currentPage - 1, currentPage + 1]);
  const sorted = [...pages]
    .filter((page) => page >= 1 && page <= totalPages)
    .sort((a, b) => a - b);
  return sorted.flatMap((page, index) => (
    index > 0 && page - sorted[index - 1] > 1 ? ["gap", page] : [page]
  ));
}

function summaryText(start, end, totalRows) {
  if (!totalRows) return "0 solicitudes";
  return `${start}-${end} de ${totalRows} solicitudes`;
}
