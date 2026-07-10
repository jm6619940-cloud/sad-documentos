import { ROLE_LABELS, ROLES } from "../utils/constants.js";
import { pageTitle } from "../components/layout.js";
import { escapeAttr, escapeHtml, textOrDash } from "../utils/security.js";
import { dataService } from "../services/dataService.js?v=20260710-6";
import { toast } from "../components/toast.js?v=20260708-12";

export function renderProfile({ user, data, refresh }) {
  const departamento = data.departamentos.find((item) => item.id === user.departamento_id);
  const signature = data.firmas_usuarios?.find((item) => item.usuario_id === user.id);
  const canRegisterSignature = [ROLES.APPROVER, ROLES.ADMIN].includes(user.rol);
  const page = document.createElement("div");
  page.className = "grid";
  page.append(pageTitle("Perfil", "Informacion de tu cuenta."));
  page.insertAdjacentHTML("beforeend", `
    <section class="panel">
      <div class="detail-grid">
        <div class="detail-box"><strong>Nombre</strong><p>${textOrDash(`${user.nombre || ""} ${user.apellido || ""}`)}</p></div>
        <div class="detail-box"><strong>Correo</strong><p>${escapeHtml(user.correo)}</p></div>
        <div class="detail-box"><strong>Departamento</strong><p>${textOrDash(departamento?.nombre)}</p></div>
        <div class="detail-box"><strong>Rol</strong><p>${escapeHtml(ROLE_LABELS[user.rol] || user.rol)}</p></div>
      </div>
      <p>El cambio de correo y contrasena no esta disponible para usuarios en esta version.</p>
    </section>
    ${canRegisterSignature ? `
      <section class="panel signature-panel">
        <div class="compact-section-header">
          <div>
            <h3>Firma digitalizada</h3>
            <p>Esta firma se usa para colocarla visualmente sobre documentos aprobados.</p>
          </div>
          ${signature ? "<span class='badge Aprobado'>Registrada</span>" : "<span class='badge Pendiente'>Pendiente</span>"}
        </div>
        ${signature ? `
          <div class="signature-current">
            <span>Firma actual</span>
            <img src="${escapeAttr(signature.firma_data_url)}" alt="Firma registrada">
          </div>
        ` : ""}
        <form class="signature-form" data-signature-form>
          <label class="field">
            <span>Dibuja tu firma</span>
            <canvas class="signature-pad" width="860" height="260" data-signature-pad></canvas>
          </label>
          <div class="toolbar">
            <button class="button secondary btn btn-outline-secondary" type="button" data-clear-signature>Limpiar</button>
            <button class="button btn btn-primary" type="submit">Guardar firma</button>
          </div>
        </form>
      </section>
    ` : ""}
  `);

  const form = page.querySelector("[data-signature-form]");
  if (form) setupSignaturePad({ form, user, refresh });
  return page;
}

function setupSignaturePad({ form, user, refresh }) {
  const canvas = form.querySelector("[data-signature-pad]");
  const context = canvas.getContext("2d");
  let drawing = false;
  let hasInk = false;

  function resizeCanvas() {
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.max(320, Math.floor(rect.width * ratio));
    canvas.height = Math.max(150, Math.floor(rect.height * ratio));
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.lineWidth = 2.6;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.strokeStyle = "#0f172a";
  }

  function point(event) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    };
  }

  canvas.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    drawing = true;
    hasInk = true;
    canvas.setPointerCapture(event.pointerId);
    const start = point(event);
    context.beginPath();
    context.moveTo(start.x, start.y);
  });

  canvas.addEventListener("pointermove", (event) => {
    if (!drawing) return;
    event.preventDefault();
    const next = point(event);
    context.lineTo(next.x, next.y);
    context.stroke();
  });

  ["pointerup", "pointercancel", "pointerleave"].forEach((type) => {
    canvas.addEventListener(type, () => {
      drawing = false;
    });
  });

  form.querySelector("[data-clear-signature]").addEventListener("click", () => {
    context.clearRect(0, 0, canvas.width, canvas.height);
    hasInk = false;
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submitter = event.submitter;
    if (!hasInk) {
      toast("Dibuja tu firma antes de guardarla.", "warning");
      return;
    }
    submitter.disabled = true;
    const previousLabel = submitter.textContent;
    submitter.textContent = "Guardando...";
    try {
      await dataService.saveUserSignature(user.id, canvas.toDataURL("image/png"));
      toast("Firma guardada correctamente.", "success");
      await refresh();
    } catch (error) {
      toast(error.message || "No fue posible guardar la firma.", "error");
    } finally {
      submitter.textContent = previousLabel;
      submitter.disabled = false;
    }
  });

  requestAnimationFrame(resizeCanvas);
}
