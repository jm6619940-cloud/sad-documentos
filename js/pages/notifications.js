import { formatDate } from "../utils/format.js";
import { dataService } from "../services/dataService.js?v=20260706-6";
import { toast } from "../components/toast.js?v=20260706-6";
import { escapeHtml } from "../utils/security.js";

export function renderNotifications({ user, data, refresh }) {
  const notifications = data.notificaciones.filter((item) => item.usuario_id === user.id);
  const hasUnread = notifications.some((item) => !item.leida);
  const view = document.createElement("div");
  view.className = "grid";
  view.innerHTML = `
    ${hasUnread ? `<div class="toolbar">
      <button class="button secondary btn btn-outline-secondary" data-read>Marcar como leidas</button>
    </div>` : ""}
    <ul class="notification-list">
      ${notifications.map((item) => `
        <li class="notification-item">
          <strong>${escapeHtml(item.titulo)}</strong>
          <p>${escapeHtml(item.mensaje)}</p>
          <small>${formatDate(item.created_at)} · ${item.leida ? "Leida" : "Nueva"}</small>
        </li>
      `).join("") || "<li class='empty-state'>No tienes notificaciones.</li>"}
    </ul>
  `;
  view.querySelector("[data-read]")?.addEventListener("click", async () => {
    await dataService.markNotificationsRead(user.id);
    toast("Notificaciones marcadas como leidas.", "success");
    await refresh();
  });
  return view;
}
