import { renderLoginShell, renderAppShell } from "./components/layout.js?v=20260706-2";
import { openModal } from "./components/modal.js?v=20260706-2";
import { toast } from "./components/toast.js?v=20260706-2";
import { dataService } from "./services/dataService.js?v=20260706-2";
import { renderDashboard } from "./pages/dashboard.js?v=20260706-2";
import { renderNewRequest } from "./pages/newRequest.js?v=20260706-2";
import { renderRequestsTable } from "./pages/requestsTable.js?v=20260706-2";
import { renderUsers } from "./pages/users.js?v=20260706-2";
import { renderCatalogs } from "./pages/catalogs.js?v=20260706-2";
import { renderProfile } from "./pages/profile.js?v=20260706-2";
import { renderNotifications } from "./pages/notifications.js?v=20260706-2";

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
  const hasUnread = state.data?.notificaciones.some((item) => item.usuario_id === state.user.id && !item.leida);

  if (hasUnread) {
    state.data = {
      ...state.data,
      notificaciones: state.data.notificaciones.map((item) => (
        item.usuario_id === state.user.id ? { ...item, leida: true } : item
      ))
    };
    render();
  }

  openModal(renderNotifications({ user: state.user, data: state.data, refresh }), { title: "Notificaciones" });

  if (!hasUnread) return;
  try {
    await dataService.markNotificationsRead(state.user.id);
    state.data = await dataService.listData();
    render();
  } catch (error) {
    toast(error.message || "No fue posible marcar las notificaciones como leidas.", "error");
    await refresh();
  }
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
