import { renderLoginShell, renderAppShell } from "./components/layout.js?v=20260708-6";
import { closeModal, openModal } from "./components/modal.js?v=20260708-6";
import { toast } from "./components/toast.js?v=20260708-6";
import { dataService } from "./services/dataService.js?v=20260708-6";
import { renderDashboard } from "./pages/dashboard.js?v=20260708-6";
import { renderNewRequest } from "./pages/newRequest.js?v=20260708-6";
import { renderRequestsTable } from "./pages/requestsTable.js?v=20260708-6";
import { renderRequestDetail } from "./pages/requestDetail.js?v=20260708-6";
import { renderUsers } from "./pages/users.js?v=20260708-6";
import { renderCatalogs } from "./pages/catalogs.js?v=20260708-6";
import { renderProfile } from "./pages/profile.js?v=20260708-6";
import { renderNotifications } from "./pages/notifications.js?v=20260708-6";
import { startBrowserNotificationStream, stopBrowserNotificationStream } from "./services/browserNotifications.js?v=20260708-6";
import { ROLES, STATUS } from "./utils/constants.js";

const root = document.querySelector("#app");
const state = {
  user: null,
  data: null,
  route: "dashboard"
};
let suppressAuthSyncUntil = 0;
let syncingAuthState = false;

async function init() {
  await watchAuthState();
  state.user = await dataService.getCurrentUser();
  if (state.user) state.data = await dataService.listData();
  await syncBrowserNotifications();
  render();
  await openRequestFromUrl();
}

async function refresh() {
  state.user = await dataService.getCurrentUser();
  state.data = state.user ? await dataService.listData() : null;
  await syncBrowserNotifications();
  render();
}

function navigate(route) {
  state.route = route;
  render();
}

async function openNotificationsModal() {
  openModal(renderNotifications({
    user: state.user,
    data: state.data,
    refresh: refreshNotificationsModal,
    openRequest: openRequestFromNotification
  }), { title: "Notificaciones" });
}

async function refreshNotificationsModal() {
  state.data = await dataService.listData();
  render();
  openNotificationsModal();
}

async function openRequestFromNotification(target) {
  state.data = await dataService.listData();
  if (typeof target !== "string" && target?.id && !target.leida) {
    await dataService.markNotificationRead(target.id, state.user.id);
  }
  const solicitudId = typeof target === "string"
    ? target
    : requestIdFromNotification(target);
  const solicitud = state.data.solicitudes.find((item) => item.id === solicitudId);
  if (!solicitud) {
    toast("No fue posible encontrar la solicitud vinculada.", "error");
    await refresh();
    return;
  }

  closeModal();
  state.route = routeForRequest(solicitud);
  render();
  openModal(renderRequestDetail({ solicitud, data: state.data, user: state.user, onChange: refresh }), { title: solicitud.codigo });
}

async function openRequestFromUrl() {
  if (!state.user || !state.data) return;
  const params = new URLSearchParams(window.location.search);
  const solicitudId = params.get("request");
  const notificationId = params.get("notification");
  if (!solicitudId) return;

  const cleanUrl = `${window.location.pathname}${window.location.hash}`;
  window.history.replaceState({}, document.title, cleanUrl);
  if (notificationId) {
    await dataService.markNotificationRead(notificationId, state.user.id).catch((error) => {
      console.warn("No se pudo marcar la notificacion como leida.", error);
    });
  }
  await openRequestFromNotification(solicitudId);
}

function requestIdFromNotification(notification) {
  if (!notification) return "";
  const text = `${notification.titulo || ""} ${notification.mensaje || ""}`;
  const codigo = text.match(/AUT-\d{4}-\d{6}/i)?.[0] || "";
  return state.data.solicitudes.find((item) => item.codigo.toLowerCase() === codigo.toLowerCase())?.id || "";
}

function routeForRequest(solicitud) {
  const assignedToCurrentUser = state.data.solicitud_aprobadores.some((item) => (
    item.solicitud_id === solicitud.id && item.usuario_id === state.user.id
  ));

  if (state.user.rol === ROLES.ADMIN) return solicitud.estado === STATUS.PENDING ? "pending" : "history";
  if (state.user.rol === ROLES.APPROVER && assignedToCurrentUser) return solicitud.estado === STATUS.PENDING ? "pending" : "history";
  return "my-requests";
}

async function login(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  try {
    suppressAuthSyncUntil = Date.now() + 2500;
    state.user = await dataService.signIn(form.get("email"), form.get("password"));
    state.data = await dataService.listData();
    state.route = "dashboard";
    await syncBrowserNotifications();
    toast("Sesion iniciada.", "success");
    render();
    await openRequestFromUrl();
  } catch (error) {
    const message = error.message === "Invalid login credentials"
      ? "Correo o contrasena incorrectos."
      : error.message || "No fue posible iniciar sesion.";
    toast(message, "error");
  }
}

async function logout() {
  suppressAuthSyncUntil = Date.now() + 2500;
  await stopBrowserNotificationStream();
  await dataService.signOut();
  state.user = null;
  state.data = null;
  state.route = "dashboard";
  render();
}

async function watchAuthState() {
  await dataService.onAuthStateChange((event, session) => {
    if (Date.now() < suppressAuthSyncUntil || ["INITIAL_SESSION", "TOKEN_REFRESHED"].includes(event)) return;
    const sessionUserId = session?.user?.id || "";
    const currentUserId = state.user?.id || "";
    if (sessionUserId === currentUserId) return;
    setTimeout(() => {
      syncCurrentSession({ notify: Boolean(currentUserId || sessionUserId) }).catch((error) => {
        console.warn("No se pudo sincronizar el cambio de sesion.", error);
      });
    }, 0);
  });
}

async function syncCurrentSession({ notify = false } = {}) {
  if (syncingAuthState) return;
  syncingAuthState = true;
  try {
    const previousUserId = state.user?.id || "";
    const currentUser = await dataService.getCurrentUser();
    const currentUserId = currentUser?.id || "";
    if (previousUserId === currentUserId) return;

    closeModal();
    await stopBrowserNotificationStream();
    state.user = currentUser;
    state.data = currentUser ? await dataService.listData() : null;
    state.route = "dashboard";
    await syncBrowserNotifications();
    render();

    if (notify && currentUser) toast("Sesion actualizada para el usuario activo.", "info");
    if (notify && !currentUser) toast("La sesion se cerro en esta maquina.", "info");
  } finally {
    syncingAuthState = false;
  }
}

async function syncBrowserNotifications() {
  if (!state.user || !state.data) {
    await stopBrowserNotificationStream();
    return;
  }
  await startBrowserNotificationStream({
    user: state.user,
    data: state.data,
    loadData: async () => {
      state.data = await dataService.listData();
      return state.data;
    },
    onData: () => render(),
    onClick: openRequestFromNotification
  });
}

function render() {
  root.innerHTML = "";
  if (!state.user) {
    root.append(renderLoginShell(login));
    return;
  }
  const shell = renderAppShell({
    user: state.user,
    route: state.route,
    data: state.data,
    navigate,
    logout,
    openNotifications: openNotificationsModal
  });
  root.append(shell);
  const outlet = shell.querySelector("[data-page]");
  outlet.append(renderPage());
}

function renderPage() {
  const context = { user: state.user, data: state.data, refresh, navigate };
  if (state.route === "new-request") return renderNewRequest(context);
  if (state.route === "my-requests") return renderRequestsTable({ ...context, mode: "my-requests" });
  if (state.route === "pending") return renderRequestsTable({ ...context, mode: "pending" });
  if (state.route === "history") return renderRequestsTable({ ...context, mode: "history" });
  if (state.route === "users") return renderUsers(context);
  if (state.route === "catalogs") return renderCatalogs(context);
  if (state.route === "profile") return renderProfile(context);
  return renderDashboard(context);
}

window.addEventListener("unhandledrejection", (event) => {
  toast(event.reason?.message || "Ocurrio un error inesperado.", "error");
});

window.addEventListener("focus", () => {
  syncCurrentSession().catch((error) => {
    console.warn("No se pudo sincronizar la sesion activa.", error);
  });
});

init();
