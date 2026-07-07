import { renderLoginShell, renderAppShell } from "./components/layout.js?v=20260707-1";
import { closeModal, openModal } from "./components/modal.js?v=20260707-1";
import { toast } from "./components/toast.js?v=20260707-1";
import { dataService } from "./services/dataService.js?v=20260707-1";
import { renderDashboard } from "./pages/dashboard.js?v=20260707-1";
import { renderNewRequest } from "./pages/newRequest.js?v=20260707-1";
import { renderRequestsTable } from "./pages/requestsTable.js?v=20260707-1";
import { renderRequestDetail } from "./pages/requestDetail.js?v=20260707-1";
import { renderUsers } from "./pages/users.js?v=20260707-1";
import { renderCatalogs } from "./pages/catalogs.js?v=20260707-1";
import { renderProfile } from "./pages/profile.js?v=20260707-1";
import { renderNotifications } from "./pages/notifications.js?v=20260707-1";
import { ROLES, STATUS } from "./utils/constants.js";

const root = document.querySelector("#app");
const state = {
  user: null,
  data: null,
  route: "dashboard"
};

async function init() {
  state.user = await dataService.getCurrentUser();
  if (state.user) state.data = await dataService.listData();
  render();
}

async function refresh() {
  state.user = await dataService.getCurrentUser();
  state.data = state.user ? await dataService.listData() : null;
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

async function openRequestFromNotification(solicitudId) {
  state.data = await dataService.listData();
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
    state.user = await dataService.signIn(form.get("email"), form.get("password"));
    state.data = await dataService.listData();
    state.route = "dashboard";
    toast("Sesion iniciada.", "success");
    render();
  } catch (error) {
    const message = error.message === "Invalid login credentials"
      ? "Correo o contrasena incorrectos."
      : error.message || "No fue posible iniciar sesion.";
    toast(message, "error");
  }
}

async function logout() {
  await dataService.signOut();
  state.user = null;
  state.data = null;
  state.route = "dashboard";
  render();
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

init();
