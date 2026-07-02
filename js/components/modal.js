import { escapeHtml } from "../utils/security.js";

export function openModal(content, options = {}) {
  const root = document.querySelector("#modal-root");
  closeModal();
  root.innerHTML = `
    <div class="app-modal-backdrop" role="presentation">
      <section class="app-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <header class="app-modal-header">
          <h2 id="modal-title">${escapeHtml(options.title || "Detalle")}</h2>
          <button class="icon-button" data-close-modal aria-label="Cerrar">x</button>
        </header>
        <div class="app-modal-body"></div>
      </section>
    </div>
  `;
  const body = root.querySelector(".app-modal-body");
  if (!body) {
    closeModal();
    return;
  }
  body.append(content);
  root.querySelector("[data-close-modal]").addEventListener("click", closeModal);
  root.querySelector(".app-modal-backdrop").addEventListener("click", (event) => {
    if (event.target.classList.contains("app-modal-backdrop")) closeModal();
  });
}

export function closeModal() {
  document.querySelector("#modal-root").innerHTML = "";
}
