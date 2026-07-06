import { ROLES, ROLE_LABELS } from "../utils/constants.js";
import { pageTitle } from "../components/layout.js";
import { dataService } from "../services/dataService.js?v=20260706-2";
import { toast } from "../components/toast.js?v=20260706-2";
import { escapeAttr, escapeHtml, textOrDash } from "../utils/security.js";

export function renderUsers({ data, refresh }) {
  const page = document.createElement("div");
  page.className = "grid";
  page.append(pageTitle("Usuarios", "Gestion de perfiles, roles y estado de acceso."));
  page.insertAdjacentHTML("beforeend", `
    <section class="panel">
      <div class="panel-header"><h2>Editar usuario</h2></div>
      <form class="form" data-user-form>
        <input type="hidden" name="id">
        <div class="row g-3">
          <label class="field col-12 col-md-6 col-xl-4"><span>Nombre</span><input class="input form-control" name="nombre" required></label>
          <label class="field col-12 col-md-6 col-xl-4"><span>Apellido</span><input class="input form-control" name="apellido" required></label>
          <label class="field col-12 col-md-6 col-xl-4"><span>Correo</span><input class="input form-control" name="correo" type="email" required></label>
          <label class="field col-12 col-md-6"><span>Rol</span><select class="form-select" name="rol" required>${Object.values(ROLES).map((role) => `<option value="${escapeAttr(role)}">${escapeHtml(ROLE_LABELS[role])}</option>`).join("")}</select></label>
          <label class="field col-12 col-md-6"><span>Departamento</span><select class="form-select" name="departamento_id" required>${data.departamentos.map((item) => `<option value="${escapeAttr(item.id)}">${escapeHtml(item.nombre)}</option>`).join("")}</select></label>
        </div>
        <div class="toolbar">
          <button class="button btn btn-primary" type="submit">Guardar usuario</button>
          <button class="button secondary btn btn-outline-secondary" type="reset">Limpiar</button>
        </div>
      </form>
    </section>
    <section class="panel">
      <div class="panel-header"><h2>Usuarios registrados</h2></div>
      <div class="table-wrap">
        <table class="table table-hover align-middle">
          <thead><tr><th>Nombre</th><th>Correo</th><th>Rol</th><th>Departamento</th><th>Estado</th><th>Acciones</th></tr></thead>
          <tbody>
            ${data.profiles.map((profile) => `
              <tr>
                <td data-label="Nombre">${textOrDash(`${profile.nombre || ""} ${profile.apellido || ""}`)}</td>
                <td data-label="Correo">${escapeHtml(profile.correo)}</td>
                <td data-label="Rol">${escapeHtml(ROLE_LABELS[profile.rol] || profile.rol)}</td>
                <td data-label="Departamento">${textOrDash(data.departamentos.find((item) => item.id === profile.departamento_id)?.nombre)}</td>
                <td data-label="Estado"><span class="badge ${profile.activo ? "activo" : "inactivo"}">${profile.activo ? "Activo" : "Inactivo"}</span></td>
                <td class="toolbar" data-label="">
                  <button class="button secondary btn btn-outline-secondary btn-sm" data-edit="${escapeAttr(profile.id)}">Editar</button>
                  <button class="button secondary btn btn-outline-secondary btn-sm" data-toggle="${escapeAttr(profile.id)}">${profile.activo ? "Desactivar" : "Activar"}</button>
                </td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </section>
  `);

  const form = page.querySelector("[data-user-form]");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(form).entries());
    if (!values.id) delete values.id;
    await dataService.upsertProfile(values);
    toast("Usuario guardado.", "success");
    await refresh();
  });
  page.querySelectorAll("[data-edit]").forEach((button) => {
    button.addEventListener("click", () => {
      const profile = data.profiles.find((item) => item.id === button.dataset.edit);
      Object.entries(profile).forEach(([key, value]) => {
        if (form.elements[key]) form.elements[key].value = value ?? "";
      });
    });
  });
  page.querySelectorAll("[data-toggle]").forEach((button) => {
    button.addEventListener("click", async () => {
      const profile = data.profiles.find((item) => item.id === button.dataset.toggle);
      await dataService.setProfileActive(profile.id, !profile.activo);
      toast("Estado actualizado.", "success");
      await refresh();
    });
  });
  return page;
}
