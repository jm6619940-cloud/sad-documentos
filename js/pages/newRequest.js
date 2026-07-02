import { PRIORITIES } from "../utils/constants.js";
import { requireFields, validateFiles } from "../utils/validators.js";
import { pageTitle } from "../components/layout.js";
import { dataService } from "../services/dataService.js";
import { toast } from "../components/toast.js";
import { icon } from "../components/icons.js";

export function renderNewRequest({ user, data, refresh, navigate }) {
  const page = document.createElement("div");
  page.className = "grid";
  page.append(pageTitle("Nueva solicitud", "Completa la informacion y adjunta los documentos necesarios."));
  page.insertAdjacentHTML("beforeend", `
    <section class="panel">
      <form class="form" data-request-form>
        <label class="field"><span>Titulo</span><input class="input form-control" name="titulo" required maxlength="160"></label>
        <label class="field"><span>Descripcion</span><textarea class="form-control" name="descripcion" rows="4" required></textarea></label>
        <div class="row g-3">
          <label class="field col-12 col-lg-6"><span>Tipo de documento</span><select class="form-select" name="tipo_documento_id" required>${data.tipos_documento.map((item) => `<option value="${item.id}">${item.nombre}</option>`).join("")}</select></label>
          <label class="field col-12 col-lg-6"><span>Prioridad</span><select class="form-select" name="prioridad" required>${PRIORITIES.map((item) => `<option>${item}</option>`).join("")}</select></label>
        </div>
        <label class="field"><span>Observaciones</span><textarea class="form-control" name="observaciones" rows="3"></textarea></label>
        <label class="field file-drop">
          <span>${icon("upload")} Adjuntar archivos</span>
          <input class="form-control" type="file" name="files" multiple accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png,.webp,.txt,.csv">
          <small>Maximo 10 archivos, 20 MB por archivo.</small>
        </label>
        <ul class="file-list" data-selected-files></ul>
        <div class="toolbar">
          <button class="button btn btn-primary" type="submit">${icon("check")} Crear solicitud</button>
          <button class="button secondary btn btn-outline-secondary" type="button" data-cancel>Cancelar</button>
        </div>
      </form>
    </section>
  `);
  const form = page.querySelector("[data-request-form]");
  const fileInput = form.elements.files;
  fileInput.addEventListener("change", () => {
    const list = page.querySelector("[data-selected-files]");
    const validation = validateFiles(fileInput.files);
    list.innerHTML = Array.from(fileInput.files).map((file) => `<li class="file-item">${file.name}</li>`).join("");
    if (!validation.valid) validation.errors.forEach((error) => toast(error, "error"));
  });
  page.querySelector("[data-cancel]").addEventListener("click", () => navigate("my-requests"));
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(form).entries());
    const fieldErrors = requireFields(values, ["titulo", "descripcion", "tipo_documento_id", "prioridad"]);
    const fileValidation = validateFiles(fileInput.files);
    const errors = [...fieldErrors, ...fileValidation.errors];
    if (errors.length) {
      errors.forEach((error) => toast(error, "error"));
      return;
    }
    await dataService.createRequest(values, fileInput.files, user);
    toast("Solicitud creada correctamente.", "success");
    await refresh();
    navigate("my-requests");
  });
  return page;
}
