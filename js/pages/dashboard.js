import { ROLES, STATUS } from "../utils/constants.js";
import { formatDate } from "../utils/format.js";
import { pageTitle } from "../components/layout.js";
import { escapeAttr, escapeHtml } from "../utils/security.js";

export function renderDashboard({ user, data, navigate, openRequest }) {
  const page = document.createElement("div");
  page.className = "grid";
  const myRequests = data.solicitudes.filter((item) => item.creado_por === user.id);
  const visiblePurchases = purchaseRequests(user.rol === ROLES.REQUESTER ? myRequests : data.solicitudes);
  const today = new Date().toDateString();
  const metrics = user.rol === ROLES.ADMIN
    ? [
      ["Total usuarios", data.profiles.length],
      ["Total solicitudes", data.solicitudes.length],
      ["Pendientes", count(data.solicitudes, STATUS.PENDING)],
      ["Aprobadas", count(data.solicitudes, STATUS.APPROVED)],
      ["Rechazadas", count(data.solicitudes, STATUS.REJECTED)],
      ["Usuarios activos", data.profiles.filter((item) => item.activo).length]
    ]
    : user.rol === ROLES.APPROVER
      ? [
        ["Pendientes", count(data.solicitudes, STATUS.PENDING)],
        ["Aprobadas hoy", data.solicitudes.filter((item) => item.estado === STATUS.APPROVED && new Date(item.updated_at).toDateString() === today).length],
      ["Rechazadas hoy", data.solicitudes.filter((item) => item.estado === STATUS.REJECTED && new Date(item.updated_at).toDateString() === today).length]
      ]
      : [
        ["Mis solicitudes", myRequests.length],
        ["Pendientes", count(myRequests, STATUS.PENDING)],
        ["Aprobadas", count(myRequests, STATUS.APPROVED)],
        ["Rechazadas", count(myRequests, STATUS.REJECTED)]
      ];
  const purchaseMetrics = [
    ["Compras por completar", visiblePurchases.filter((item) => item.estado === STATUS.APPROVED && item.ejecucion_estado !== "Completada").length],
    ["Compras completadas", visiblePurchases.filter((item) => item.ejecucion_estado === "Completada").length],
    ["Promedio ejecucion", averagePurchaseExecution(visiblePurchases)]
  ];

  page.append(pageTitle("Dashboard", "Indicadores principales del sistema."));
  page.insertAdjacentHTML("beforeend", `
    <section class="grid cards">
      ${metrics.map(([label, value]) => `<article class="card metric"><span>${label}</span><strong>${value}</strong></article>`).join("")}
    </section>
    <section class="panel">
      <div class="panel-header">
        <h2>Seguimiento de compras</h2>
      </div>
      <section class="grid cards">
        ${purchaseMetrics.map(([label, value]) => `<article class="card metric metric-compact"><span>${label}</span><strong>${escapeHtml(String(value))}</strong></article>`).join("")}
      </section>
    </section>
    <section class="panel">
      <div class="panel-header">
        <h2>Actividad reciente</h2>
        <button class="button secondary btn btn-outline-secondary" data-route="history">Ver historial</button>
      </div>
      <div class="table-wrap">
        <table class="table table-hover align-middle">
          <thead><tr><th>Codigo</th><th>Titulo</th><th>Estado</th><th>Actualizacion</th></tr></thead>
          <tbody>
            ${data.solicitudes.slice(0, 6).map((item) => `
              <tr class="clickable-row" data-dashboard-request="${escapeAttr(item.id)}" tabindex="0">
                <td data-label="Codigo">${escapeHtml(item.codigo)}</td>
                <td data-label="Titulo">${escapeHtml(item.titulo)}</td>
                <td data-label="Estado"><span class="badge ${escapeHtml(item.estado.split(" ")[0])}">${escapeHtml(item.estado)}</span></td>
                <td data-label="Actualizacion">${formatDate(item.updated_at)}</td>
              </tr>
            `).join("") || `<tr><td data-label="" colspan="4">No hay solicitudes.</td></tr>`}
          </tbody>
        </table>
      </div>
    </section>
  `);
  page.querySelector("[data-route]")?.addEventListener("click", () => navigate("history"));
  page.querySelectorAll("[data-dashboard-request]").forEach((row) => {
    const open = () => openRequest?.(row.dataset.dashboardRequest);
    row.addEventListener("click", open);
    row.addEventListener("keydown", (event) => {
      if (!["Enter", " "].includes(event.key)) return;
      event.preventDefault();
      open();
    });
  });
  return page;
}

function count(items, status) {
  return items.filter((item) => item.estado === status).length;
}

function purchaseRequests(items) {
  return items.filter((item) => normalizePurchaseText(`${item.tipo?.nombre || ""} ${item.departamento?.nombre || ""}`).includes("compra"));
}

function averagePurchaseExecution(items) {
  const completed = items.filter((item) => item.fecha_aprobacion && item.fecha_completada);
  if (!completed.length) return "-";
  const averageMinutes = completed.reduce((total, item) => (
    total + Math.max(0, new Date(item.fecha_completada) - new Date(item.fecha_aprobacion)) / 60000
  ), 0) / completed.length;
  return formatDuration(averageMinutes);
}

function formatDuration(minutes) {
  const rounded = Math.round(minutes);
  const days = Math.floor(rounded / 1440);
  const hours = Math.floor((rounded % 1440) / 60);
  if (days) return `${days}d ${hours}h`;
  if (hours) return `${hours}h`;
  return `${rounded}m`;
}

function normalizePurchaseText(value = "") {
  return String(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}
