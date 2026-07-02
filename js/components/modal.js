import { escapeHtml } from "../utils/security.js";

export function openModal(content, options = {}) {
  const root = document.querySelector("#modal-root");
  root.innerHTML = `
    <div class="modal-backdrop" role="presentation">
      <section class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <header class="modal-header">
          <h2 id="modal-title">${escapeHtml(options.title || "Detalle")}</h2>
          <button class="icon-button" data-close-modal aria-label="Cerrar">x</button>
        </header>
        <div class="modal-body"></div>
      </section>
    </div>
  `;
  root.querySelector(".modal-body").append(content);
  root.querySelector("[data-close-modal]").addEventListener("click", closeModal);
  root.querySelector(".modal-backdrop").addEventListener("click", (event) => {
    if (event.target.classList.contains("modal-backdrop")) closeModal();
  });
}

export function closeModal() {
  document.querySelector("#modal-root").innerHTML = "";
}
