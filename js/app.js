import { renderLoginShell, renderAppShell } from "./components/layout.js?v=20260708-14";
import { closeModal, openModal } from "./components/modal.js?v=20260708-12";
import { toast } from "./components/toast.js?v=20260708-12";
import { dataService } from "./services/dataService.js?v=20260713-5";
import { renderDashboard } from "./pages/dashboard.js?v=20260710-1";
import { renderNewRequest } from "./pages/newRequest.js?v=20260713-1";
import { clearRequestTableState, renderRequestsTable } from "./pages/requestsTable.js?v=20260710-9";
import { renderRequestDetail } from "./pages/requestDetail.js?v=20260713-7";
import { renderUsers } from "./pages/users.js?v=20260713-1";
import { renderCatalogs } from "./pages/catalogs.js?v=20260713-1";
import { renderProfile } from "./pages/profile.js?v=20260714-7";
import { renderNotifications } from "./pages/notifications.js?v=20260710-1";
import { startBrowserNotificationStream, stopBrowserNotificationStream, syncAppBadge } from "./services/browserNotifications.js?v=20260714-7";
import { ROLES, STATUS } from "./utils/constants.js";

const root = document.querySelector("#app");
const launchScreen = document.querySelector("#launch-screen");
const THEME_KEY = "sad-theme";
const state = {
  user: null,
  data: null,
  route: "dashboard",
  theme: initialTheme()
};
let suppressAuthSyncUntil = 0;
let syncingAuthState = false;

async function init() {
  applyTheme(state.theme);
  registerAppServiceWorker();
  await watchAuthState();
  state.user = await dataService.getCurrentUser();
  if (state.user) state.data = await dataService.listData();
  await updateAppBadge();
  await syncBrowserNotifications();
  render();
  await openRequestFromUrl();
}

function registerAppServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register("./sw.js?v=20260714-7", { scope: "./" })
    .then((registration) => {
      const worker = registration.active || registration.waiting || registration.installing;
      worker?.postMessage?.({ type: "SAD_PRECACHE" });
      navigator.serviceWorker.ready.then((readyRegistration) => {
        readyRegistration.active?.postMessage?.({ type: "SAD_PRECACHE" });
      }).catch(() => {});
    })
    .catch((error) => {
      console.warn("No se pudo preparar el cache local de SAD.", error);
    });
}

async function refresh(options = {}) {
  state.user = await dataService.getCurrentUser();
  state.data = state.user ? await dataService.listData() : null;
  await updateAppBadge();
  await syncBrowserNotifications();
  if (!options.silent) render();
  return state.data;
}

function navigate(route) {
  if (requiresSecuritySetup() && route !== "profile") {
    state.route = "profile";
    toast("Completa tu perfil y seguridad de firma antes de continuar.", "warning");
    render();
    return;
  }
  if (state.route !== route) clearRequestTableState();
  state.route = route;
  render();
}

function initialTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  if (["light", "dark"].includes(saved)) return saved;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  document.querySelector("meta[name='theme-color']")?.setAttribute("content", theme === "dark" ? "#0f172a" : "#2563eb");
}

function toggleTheme() {
  state.theme = state.theme === "dark" ? "light" : "dark";
  localStorage.setItem(THEME_KEY, state.theme);
  applyTheme(state.theme);
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
  await updateAppBadge();
  render();
  openNotificationsModal();
}

async function openRequestFromNotification(target) {
  state.data = await dataService.listData();
  if (typeof target !== "string" && target?.id && !target.leida) {
    await dataService.markNotificationRead(target.id, state.user.id);
    target.leida = true;
    const storedNotification = state.data.notificaciones.find((item) => item.id === target.id);
    if (storedNotification) storedNotification.leida = true;
    await updateAppBadge();
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
  const nextRoute = routeForRequest(solicitud);
  if (state.route !== nextRoute) clearRequestTableState();
  state.route = nextRoute;
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
    await updateAppBadge();
    clearRequestTableState();
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
  clearRequestTableState();
  state.route = "dashboard";
  await updateAppBadge();
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
    await updateAppBadge();
    clearRequestTableState();
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
      await updateAppBadge();
      return state.data;
    },
    onData: async (data) => {
      await syncAppBadge(data, state.user);
      render();
    },
    onClick: openRequestFromNotification
  });
}

function render() {
  root.innerHTML = "";
  if (!state.user) {
    root.append(renderLoginShell(login, { theme: state.theme, toggleTheme }));
    hideLaunchScreen();
    return;
  }
  if (requiresSecuritySetup()) state.route = "profile";
  const shell = renderAppShell({
    user: state.user,
    route: state.route,
    data: state.data,
    navigate,
    logout,
    openNotifications: openNotificationsModal,
    theme: state.theme,
    toggleTheme
  });
  root.append(shell);
  const outlet = shell.querySelector("[data-page]");
  outlet.append(renderPage());
  hideLaunchScreen();
}

function requiresSecuritySetup() {
  if (!state.user || !state.data) return false;
  const hasBasicProfile = Boolean(
    String(state.user.nombre || "").trim()
    && String(state.user.apellido || "").trim()
    && state.user.onboarding_completed_at
  );
  const signature = state.data.firmas_usuarios?.find((item) => item.usuario_id === state.user.id);
  const needsSignaturePin = [ROLES.ADMIN, ROLES.APPROVER].includes(state.user.rol) && !signature?.pin_updated_at;
  return !hasBasicProfile || needsSignaturePin;
}

function hideLaunchScreen() {
  launchScreen?.classList.add("hidden");
}

async function updateAppBadge() {
  if (!state.user || !state.data) {
    await syncAppBadge({ notificaciones: [] }, { id: "" });
    return;
  }
  await syncAppBadge(state.data, state.user);
}

function renderPage() {
  const context = { user: state.user, data: state.data, refresh, navigate, openRequest: openRequestFromNotification };
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
