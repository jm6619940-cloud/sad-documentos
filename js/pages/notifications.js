import { formatDate } from "../utils/format.js";
import { dataService } from "../services/dataService.js?v=20260707-2";
import { toast } from "../components/toast.js?v=20260707-2";
import { icon } from "../components/icons.js";
import { escapeAttr, escapeHtml } from "../utils/security.js";

export function renderNotifications({ user, data, refresh, openRequest }) {
  const notifications = data.notificaciones
    .filter((item) => item.usuario_id === user.id)
    .map((item) => enrichNotification(item, data));
  const hasUnread = notifications.some((item) => !item.leida);
  const hasNotifications = notifications.length > 0;
  const view = document.createElement("div");
  view.className = "grid";
  view.innerHTML = `
    ${hasNotifications ? `<div class="toolbar">
      ${hasUnread ? `<button class="button secondary btn btn-outline-secondary" data-read>${icon("check")} Marcar leidas</button>` : ""}
      <button class="button danger btn btn-danger" data-clear>${icon("x")} Vaciar</button>
    </div>` : ""}
    <ul class="notification-list">
      ${notifications.map((item) => `
        <li class="notification-item ${item.leida ? "" : "unread"} ${item.solicitud ? "clickable-notification" : ""}" data-notification="${escapeAttr(item.id)}" tabindex="${item.solicitud ? "0" : "-1"}" role="${item.solicitud ? "button" : "listitem"}">
          <div>
            <strong>${escapeHtml(item.titulo)}</strong>
            <p>
              ${item.codigo ? `<span class="notification-code">${escapeHtml(item.codigo)}</span>${item.solicitud?.titulo ? " · " : ""}` : ""}
              ${item.solicitud?.titulo ? `<span>${escapeHtml(item.solicitud.titulo)}</span>` : ""}
              ${!item.solicitud?.titulo ? escapeHtml(item.mensaje) : ""}
            </p>
            <small>${formatDate(item.created_at)} · ${item.leida ? "Leida" : "Nueva"}</small>
          </div>
          ${item.solicitud ? `<span class="notification-action">${icon("eye")} Abrir</span>` : ""}
        </li>
      `).join("") || "<li class='empty-state'>No tienes notificaciones.</li>"}
    </ul>
  `;
  view.querySelector("[data-read]")?.addEventListener("click", async () => {
    await dataService.markNotificationsRead(user.id);
    toast("Notificaciones marcadas como leidas.", "success");
    await refresh();
  });
  view.querySelector("[data-clear]")?.addEventListener("click", async () => {
    await dataService.clearNotifications(user.id);
    toast("Notificaciones vaciadas.", "success");
    await refresh();
  });
  view.querySelectorAll("[data-notification]").forEach((item) => {
    const open = async () => {
      const notification = notifications.find((entry) => entry.id === item.dataset.notification);
      if (!notification) return;
      if (!notification.leida) await dataService.markNotificationRead(notification.id, user.id);
      if (notification.solicitud) {
        await openRequest(notification.solicitud.id);
        return;
      }
      toast("Notificacion marcada como leida.", "success");
      await refresh();
    };
    item.addEventListener("click", open);
    item.addEventListener("keydown", (event) => {
      if (!["Enter", " "].includes(event.key)) return;
      event.preventDefault();
      open();
    });
  });
  return view;
}

function enrichNotification(notification, data) {
  const codigo = extractRequestCode(`${notification.titulo} ${notification.mensaje}`);
  const solicitud = codigo
    ? data.solicitudes.find((item) => item.codigo.toLowerCase() === codigo.toLowerCase())
    : null;
  return { ...notification, codigo, solicitud };
}

function extractRequestCode(text) {
  return text.match(/AUT-\d{4}-\d{6}/i)?.[0] || "";
}
