import { ROLES, STATUS } from "../utils/constants.js";
import { formatDate } from "../utils/format.js";
import { pageTitle } from "../components/layout.js";
import { escapeAttr, escapeHtml } from "../utils/security.js";

export function renderDashboard({ user, data, navigate, openRequest }) {
  const page = document.createElement("div");
  page.className = "grid";
  const myRequests = data.solicitudes.filter((item) => item.creado_por === user.id);
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

  page.append(pageTitle("Dashboard", "Indicadores principales del sistema."));
  page.insertAdjacentHTML("beforeend", `
    <section class="grid cards">
      ${metrics.map(([label, value]) => `<article class="card metric"><span>${label}</span><strong>${value}</strong></article>`).join("")}
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
