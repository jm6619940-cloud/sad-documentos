import { formatDate } from "../utils/format.js";
import { dataService } from "../services/dataService.js?v=20260708-9";
import { browserNotificationState, pushNotificationState, requestBrowserNotificationPermission, showServiceWorkerNotification } from "../services/browserNotifications.js?v=20260708-9";
import { toast } from "../components/toast.js?v=20260708-9";
import { icon } from "../components/icons.js";
import { escapeAttr, escapeHtml } from "../utils/security.js";

export function renderNotifications({ user, data, refresh, openRequest }) {
  const notifications = data.notificaciones
    .filter((item) => item.usuario_id === user.id)
    .map((item) => enrichNotification(item, data));
  const hasUnread = notifications.some((item) => !item.leida);
  const hasNotifications = notifications.length > 0;
  const browserState = browserNotificationState();
  const pushState = pushNotificationState();
  const canEnableNotifications = ["default", "granted", "missing-vapid-key"].includes(pushState);
  const view = document.createElement("div");
  view.className = "grid";
  view.innerHTML = `
    <section class="notification-permission">
      <div>
        <strong>Notificaciones en segundo plano</strong>
        <p>${escapeHtml(browserPermissionText(pushState, browserState))}</p>
      </div>
      <div class="toolbar">
        ${canEnableNotifications ? `<button class="button btn btn-primary" data-enable-browser-notifications>${icon("bell")} Activar</button>` : ""}
        ${browserState === "granted" ? `<button class="button secondary btn btn-outline-secondary" data-test-browser-notification>${icon("bell")} Probar</button>` : ""}
      </div>
    </section>
    ${hasNotifications ? `<div class="toolbar">
      ${hasUnread ? `<button class="button secondary btn btn-outline-secondary" data-read>${icon("check")} Marcar leidas</button>` : ""}
      <button class="button danger btn btn-danger" data-clear>${icon("x")} Vaciar</button>
    </div>` : ""}
    <ul class="notification-list">
      ${notifications.map((item) => `
        <li class="notification-item ${item.leida ? "" : "unread"} ${item.solicitud ? "clickable-notification" : ""}" data-notification="${escapeAttr(item.id)}" tabindex="${item.solicitud ? "0" : "-1"}" role="${item.solicitud ? "button" : "listitem"}">
          <div>
            <strong>${escapeHtml(notificationTitle(item))}</strong>
            <p>${escapeHtml(notificationSummary(item))}</p>
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
  view.querySelector("[data-enable-browser-notifications]")?.addEventListener("click", async () => {
    try {
      const permission = await requestBrowserNotificationPermission(user);
      if (permission !== "granted") {
        toast("Permiso de notificaciones no activado.", "info");
        await refresh();
        return;
      }
      await showServiceWorkerNotification({
        titulo: "Notificaciones activadas",
        mensaje: "SAD ya puede avisarte cuando llegue una nueva solicitud o actualizacion."
      });
      toast("Notificaciones en segundo plano activadas.", "success");
      await refresh();
    } catch (error) {
      toast(error.message || "No fue posible activar las notificaciones.", "error");
    }
  });
  view.querySelector("[data-test-browser-notification]")?.addEventListener("click", async () => {
    try {
      await showServiceWorkerNotification({
        titulo: "SAD",
        mensaje: "Esta es una notificacion de prueba del navegador."
      });
      toast("Notificacion de prueba enviada.", "success");
    } catch (error) {
      toast(error.message || "No fue posible mostrar la notificacion de prueba.", "error");
    }
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

function browserPermissionText(pushState, browserState) {
  if (pushState === "missing-vapid-key") {
    return "Falta configurar la clave publica VAPID para activar avisos con la app cerrada.";
  }
  const labels = {
    granted: "Activas. Recibiras avisos aunque la app quede en segundo plano, despues de desplegar la funcion push.",
    default: "Puedes activarlas para recibir avisos como una app, incluso con la pagina cerrada.",
    denied: "Bloqueadas por el navegador. Debes habilitarlas desde la configuracion del sitio.",
    unsupported: "Este navegador no soporta notificaciones.",
    insecure: "Necesitan HTTPS para funcionar fuera de localhost.",
    "push-unsupported": "Este navegador permite avisos basicos, pero no soporta notificaciones push en segundo plano.",
    "ios-not-installed": "En iPhone debes agregar SAD a la pantalla de inicio, abrirla desde ese icono y luego activar notificaciones. Safari como pestana normal no entrega avisos con el celular bloqueado."
  };
  return labels[pushState] || labels[browserState] || "Estado no disponible.";
}

function enrichNotification(notification, data) {
  const codigo = extractRequestCode(`${notification.titulo} ${notification.mensaje}`);
  const solicitud = codigo
    ? data.solicitudes.find((item) => item.codigo.toLowerCase() === codigo.toLowerCase())
    : null;
  return { ...notification, codigo, solicitud };
}

function notificationTitle(notification) {
  return notification.solicitud?.titulo || stripRequestCode(notification.mensaje) || notification.titulo;
}

function notificationSummary(notification) {
  if (notification.solicitud) {
    return notification.titulo;
  }
  return stripRequestCode(notification.mensaje) || notification.titulo;
}

function stripRequestCode(text = "") {
  return text.replace(/AUT-\d{4}-\d{6}:?\s*/i, "").trim();
}

function extractRequestCode(text) {
  return text.match(/AUT-\d{4}-\d{6}/i)?.[0] || "";
}
