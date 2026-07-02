export function toast(message, type = "info") {
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
