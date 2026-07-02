import { escapeHtml } from "../utils/security.js";

export function openModal(content, options = {}) {
  const root = document.querySelector("#modal-root");
  if (!root) return;
  closeModal();
  root.innerHTML = `
    <section class="app-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <header class="app-modal-header">
        <h2 id="modal-title">${escapeHtml(options.title || "Detalle")}</h2>
        <button class="icon-button" data-close-modal aria-label="Cerrar">x</button>
      </header>
      <div class="app-modal-body"></div>
    </section>
  `;
  const body = root.querySelector(".app-modal-body");
  if (!body) {
    closeModal();
    return;
  }
  try {
    body.append(content);
  } catch (error) {
    closeModal();
    throw error;
  }
  root.classList.add("is-open");
  document.body.classList.add("app-modal-open");
  root.querySelector("[data-close-modal]").addEventListener("click", closeModal);
  root.onclick = (event) => {
    if (event.target === root) closeModal();
  };
  window.addEventListener("keydown", handleModalKeydown);
}

export function closeModal() {
  const root = document.querySelector("#modal-root");
  if (!root) return;
  root.classList.remove("is-open");
  root.innerHTML = "";
  root.onclick = null;
  document.body.classList.remove("app-modal-open");
  window.removeEventListener("keydown", handleModalKeydown);
}

function handleModalKeydown(event) {
  if (event.key === "Escape") closeModal();
}
