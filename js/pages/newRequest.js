import { PRIORITIES } from "../utils/constants.js";
import { validateFiles } from "../utils/validators.js?v=20260708-12";
import { pageTitle } from "../components/layout.js";
import { dataService } from "../services/dataService.js?v=20260713-3";
import * as toastApi from "../components/toast.js?v=20260708-12";
import { icon } from "../components/icons.js";
import { escapeAttr, escapeHtml } from "../utils/security.js";

const toast = toastApi.toast;
const alertMessage = toastApi.alertMessage || ((title, messages, type = "warning") => {
  const list = Array.isArray(messages) ? messages : [messages];
  toast(`${title}: ${list.join(", ")}`, type);
});

function isCatalogActive(item) {
  return item.activo !== false;
}

function validateRequestForm(values, files, hasApprovers, hasDocumentTypes) {
  const errors = [];
  const requiredFields = [
    ["titulo", "El titulo es obligatorio."],
    ["descripcion", "La descripcion es obligatoria."],
    ["prioridad", "Selecciona la prioridad."]
  ];

  requiredFields.forEach(([field, message]) => {
    if (!String(values[field] ?? "").trim()) errors.push(message);
  });

  if (!hasDocumentTypes) {
    errors.push("No hay tipos de documento activos disponibles. Pide al administrador que active al menos uno.");
  } else if (!String(values.tipo_documento_id ?? "").trim()) {
    errors.push("Selecciona el tipo de documento.");
  }

  if (!hasApprovers) {
    errors.push("No hay aprobadores activos disponibles. Pide al administrador que active al menos uno.");
  } else if (!values.aprobadores.length) {
    errors.push("Selecciona al menos un aprobador.");
  }

  if (!Array.from(files || []).length) {
    errors.push("Adjunta al menos un archivo.");
  }

  const fileValidation = validateFiles(files);
  return [...errors, ...fileValidation.errors];
}

export function renderNewRequest({ user, data, refresh, navigate }) {
  const approvers = data.profiles.filter((profile) => profile.rol === "aprobador" && profile.activo);
  const documentTypes = data.tipos_documento.filter(isCatalogActive);
  const page = document.createElement("div");
  page.className = "grid";
  page.append(pageTitle("Nueva solicitud", "Completa la informacion y adjunta los documentos necesarios."));
  page.insertAdjacentHTML("beforeend", `
    <section class="panel">
      <form class="form" data-request-form novalidate>
        <label class="field"><span>Titulo</span><input class="input form-control" name="titulo" required maxlength="160"></label>
        <label class="field"><span>Descripcion</span><textarea class="form-control" name="descripcion" rows="4" required></textarea></label>
        <div class="row g-3">
          <label class="field col-12 col-lg-6"><span>Tipo de documento</span><select class="form-select" name="tipo_documento_id" required ${documentTypes.length ? "" : "disabled"}>${documentTypes.map((item) => `<option value="${escapeAttr(item.id)}">${escapeHtml(item.nombre)}</option>`).join("")}</select></label>
          <label class="field col-12 col-lg-6"><span>Prioridad</span><select class="form-select" name="prioridad" required>${PRIORITIES.map((item) => `<option>${escapeHtml(item)}</option>`).join("")}</select></label>
        </div>
        ${documentTypes.length ? "" : "<p class='inline-warning'>No hay tipos de documento activos disponibles.</p>"}
        <fieldset class="field approver-picker">
          <legend>Aprobadores</legend>
          <div class="approver-options">
            ${approvers.length ? approvers.map((profile) => `
              <label class="approver-option">
                <input class="form-check-input" type="checkbox" name="aprobadores" value="${escapeAttr(profile.id)}">
                <span>
                  <strong>${escapeHtml(`${profile.nombre} ${profile.apellido}`.trim() || profile.correo)}</strong>
                  <small>${escapeHtml(profile.correo)}</small>
                </span>
              </label>
            `).join("") : "<p class='empty-state'>No hay aprobadores activos disponibles.</p>"}
          </div>
        </fieldset>
        <label class="field"><span>Observaciones</span><textarea class="form-control" name="observaciones" rows="3"></textarea></label>
        <label class="field file-drop">
          <span>${icon("upload")} Adjuntar archivos</span>
          <input class="form-control" type="file" name="files" multiple required accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png,.webp,.txt,.csv">
          <small>Maximo 10 archivos, 20 MB por archivo.</small>
        </label>
        <ul class="file-list" data-selected-files></ul>
        <div class="toolbar">
          <button class="button btn btn-primary" type="submit" ${approvers.length && documentTypes.length ? "" : "disabled"}>${icon("check")} Crear solicitud</button>
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
    list.innerHTML = Array.from(fileInput.files).map((file) => `<li class="file-item">${escapeHtml(file.name)}</li>`).join("");
    if (!validation.valid) alertMessage("Revisa los archivos", validation.errors, "warning");
  });
  page.querySelector("[data-cancel]").addEventListener("click", () => navigate("my-requests"));
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const values = Object.fromEntries(formData.entries());
    values.titulo = String(values.titulo || "").trim();
    values.descripcion = String(values.descripcion || "").trim();
    values.observaciones = String(values.observaciones || "").trim();
    values.aprobadores = formData.getAll("aprobadores").filter(Boolean);
    const errors = validateRequestForm(values, fileInput.files, approvers.length > 0, documentTypes.length > 0);
    if (errors.length) {
      alertMessage("Falta completar informacion", errors, "warning");
      return;
    }
    try {
      await dataService.createRequest(values, fileInput.files, user);
      toast("Solicitud creada correctamente.", "success");
      await refresh();
      navigate("my-requests");
    } catch (error) {
      const code = error.code ? ` (${error.code})` : "";
      toast(`${error.message || "No fue posible crear la solicitud."}${code}`, "error");
    }
  });
  return page;
}
