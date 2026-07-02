import { NAV_ITEMS } from "../utils/constants.js";
import { initials } from "../utils/format.js";
import { icon } from "./icons.js";

export function renderLoginShell(onSubmit) {
  const root = document.createElement("main");
  root.className = "login-view container-fluid p-0";
  root.innerHTML = `
    <section class="login-panel">
      <div class="brand"><span class="brand-mark">SAD</span><span>Sistema de Autorizacion</span></div>
      <p class="eyebrow">Gestion documental interna</p>
      <h1>Autoriza documentos con orden, trazabilidad y control.</h1>
      <p>Ingresa con tu cuenta autorizada.</p>
      <form class="form" data-login-form>
        <label class="field">
          <span>Correo</span>
          <input class="input form-control" type="email" name="email" autocomplete="email" required>
        </label>
        <label class="field">
          <span>Contrasena</span>
          <input class="input form-control" type="password" name="password" autocomplete="current-password" required>
        </label>
        <button class="button btn btn-primary" type="submit">Iniciar sesion</button>
      </form>
    </section>
    <section class="login-art" aria-hidden="true">
      <div class="login-art-inner">
        <p class="eyebrow">Sistema de autorizacion documental</p>
        <h1>SAD</h1>
        <p>Solicitudes, adjuntos privados, aprobaciones, comentarios, auditoria y notificaciones en una sola experiencia web.</p>
      </div>
    </section>
  `;
  root.querySelector("[data-login-form]").addEventListener("submit", onSubmit);
  return root;
}

export function renderAppShell({ user, route, data, navigate, logout, openNotifications }) {
  const unread = data.notificaciones.filter((item) => item.usuario_id === user.id && !item.leida).length;
  const shell = document.createElement("div");
  shell.className = "layout container-fluid p-0";
  shell.innerHTML = `
    <aside class="sidebar" data-sidebar>
      <div class="brand"><span class="brand-mark">SAD</span><span>Autorizacion</span></div>
      <nav class="nav" aria-label="Navegacion principal">
        ${NAV_ITEMS.filter((item) => item.roles.includes(user.rol)).map((item) => `
          <button class="nav-button ${route === item.id ? "active" : ""}" data-route="${item.id}">
            ${icon(item.icon)}<span>${item.label}</span>
          </button>
        `).join("")}
      </nav>
    </aside>
    <main class="main">
      <header class="topbar">
        <div class="topbar-actions">
          <button class="icon-button mobile-toggle" data-menu aria-label="Abrir menu">${icon("layers")}</button>
          <strong>SAD</strong>
        </div>
        <div class="topbar-actions">
          <button class="icon-button" data-notifications aria-label="Notificaciones">${icon("bell")}${unread ? `<span class="badge Rechazado">${unread}</span>` : ""}</button>
          <div class="avatar" title="${user.nombre} ${user.apellido}">${initials(user)}</div>
          <button class="icon-button" data-logout aria-label="Cerrar sesion">${icon("logout")}</button>
        </div>
      </header>
      <section class="content" data-page></section>
    </main>
  `;
  shell.querySelectorAll("[data-route]").forEach((button) => {
    button.addEventListener("click", () => {
      navigate(button.dataset.route);
      shell.querySelector("[data-sidebar]").classList.remove("open");
    });
  });
  shell.querySelector("[data-logout]").addEventListener("click", logout);
  shell.querySelector("[data-notifications]").addEventListener("click", openNotifications);
  shell.querySelector("[data-menu]").addEventListener("click", () => shell.querySelector("[data-sidebar]").classList.toggle("open"));
  return shell;
}

export function pageTitle(title, subtitle, action = "") {
  const header = document.createElement("div");
  header.className = "page-title";
  header.innerHTML = `
    <div>
      <h1>${title}</h1>
      ${subtitle ? `<p>${subtitle}</p>` : ""}
    </div>
    ${action}
  `;
  return header;
}

export function emptyState(message) {
  const box = document.createElement("div");
  box.className = "empty-state";
  box.textContent = message;
  return box;
}
