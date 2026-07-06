import { pageTitle } from "../components/layout.js";
import { dataService } from "../services/dataService.js?v=20260706-2";
import { toast } from "../components/toast.js?v=20260706-2";
import { escapeAttr, escapeHtml, textOrDash } from "../utils/security.js";

export function renderCatalogs({ data, refresh }) {
  const page = document.createElement("div");
  page.className = "grid";
  page.append(pageTitle("Catalogos", "Departamentos y tipos de documento."));
  page.append(catalogPanel("departamentos", "Departamentos", data.departamentos, refresh));
  page.append(catalogPanel("tipos_documento", "Tipos de documento", data.tipos_documento, refresh));
  return page;
}

function catalogPanel(table, title, rows, refresh) {
  const panel = document.createElement("section");
  panel.className = "panel";
  panel.innerHTML = `
    <div class="panel-header"><h2>${escapeHtml(title)}</h2></div>
    <form class="form" data-catalog-form>
      <input type="hidden" name="id">
      <div class="detail-grid">
        <label class="field"><span>Nombre</span><input class="input form-control" name="nombre" required></label>
        <label class="field"><span>Descripcion</span><input class="input form-control" name="descripcion"></label>
      </div>
      <div class="toolbar">
        <button class="button btn btn-primary" type="submit">Guardar</button>
        <button class="button secondary btn btn-outline-secondary" type="reset">Limpiar</button>
      </div>
    </form>
    <div class="table-wrap">
      <table class="table table-hover align-middle">
        <thead><tr><th>Nombre</th><th>Descripcion</th><th>Creado</th><th></th></tr></thead>
        <tbody>
          ${rows.map((item) => `
            <tr>
              <td data-label="Nombre">${escapeHtml(item.nombre)}</td>
              <td data-label="Descripcion">${textOrDash(item.descripcion)}</td>
              <td data-label="Creado">${new Date(item.created_at).toLocaleDateString("es-DO")}</td>
              <td data-label=""><button class="button secondary btn btn-outline-secondary btn-sm" data-edit="${escapeAttr(item.id)}">Editar</button></td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
  const form = panel.querySelector("[data-catalog-form]");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(form).entries());
    if (!values.id) delete values.id;
    await dataService.upsertCatalog(table, values);
    toast(`${title} actualizado.`, "success");
    await refresh();
  });
  panel.querySelectorAll("[data-edit]").forEach((button) => {
    button.addEventListener("click", () => {
      const row = rows.find((item) => item.id === button.dataset.edit);
      form.elements.id.value = row.id;
      form.elements.nombre.value = row.nombre;
      form.elements.descripcion.value = row.descripcion || "";
    });
  });
  return panel;
}
