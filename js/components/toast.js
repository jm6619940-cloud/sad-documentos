import { escapeHtml } from "../utils/security.js";

export function toast(message, type = "info") {
  if (window.Swal) {
    const icon = type === "error" ? "error" : type === "success" ? "success" : type === "warning" ? "warning" : "info";
    window.Swal.fire({
      toast: true,
      position: "top-end",
      icon,
      title: message,
      showConfirmButton: false,
      timer: icon === "error" ? 4200 : 2600,
      timerProgressBar: true,
      showClass: {
        popup: "swal2-show swal2-animate-toast-in"
      },
      hideClass: {
        popup: "swal2-hide swal2-animate-toast-out"
      }
    });
    return;
  }

  const root = document.querySelector("#toast-root");
  const item = document.createElement("div");
  item.className = `toast toast-${type}`;
  item.textContent = message;
  root.appendChild(item);
  window.setTimeout(() => item.classList.add("is-visible"), 20);
  window.setTimeout(() => {
    item.classList.remove("is-visible");
    window.setTimeout(() => item.remove(), 180);
  }, 3600);
}

export function alertMessage(title, messages, type = "warning") {
  const list = Array.isArray(messages) ? messages : [messages];
  if (window.Swal) {
    window.Swal.fire({
      icon: type,
      title,
      html: `<ul class="swal-list">${list.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`,
      confirmButtonText: "Entendido",
      buttonsStyling: false,
      customClass: {
        confirmButton: "button btn btn-primary",
        popup: "swal-compact"
      }
    });
    return;
  }
  toast(`${title}: ${list.join(", ")}`, type);
}
