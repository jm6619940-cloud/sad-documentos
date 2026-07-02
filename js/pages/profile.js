import { ROLE_LABELS } from "../utils/constants.js";
import { pageTitle } from "../components/layout.js";

export function renderProfile({ user, data }) {
  const departamento = data.departamentos.find((item) => item.id === user.departamento_id);
  const page = document.createElement("div");
  page.className = "grid";
  page.append(pageTitle("Perfil", "Informacion de tu cuenta."));
  page.insertAdjacentHTML("beforeend", `
    <section class="panel">
      <div class="detail-grid">
        <div class="detail-box"><strong>Nombre</strong><p>${user.nombre} ${user.apellido}</p></div>
        <div class="detail-box"><strong>Correo</strong><p>${user.correo}</p></div>
        <div class="detail-box"><strong>Departamento</strong><p>${departamento?.nombre || "-"}</p></div>
        <div class="detail-box"><strong>Rol</strong><p>${ROLE_LABELS[user.rol] || user.rol}</p></div>
      </div>
      <p>El cambio de correo y contrasena no esta disponible para usuarios en esta version.</p>
    </section>
  `);
  return page;
}
