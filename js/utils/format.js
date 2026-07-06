export function formatDate(value, options = {}) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("es-DO", {
    dateStyle: options.dateStyle || "medium",
    timeStyle: options.timeStyle || "short"
  }).format(new Date(value));
}

export function formatDateOnly(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("es-DO", {
    dateStyle: "medium"
  }).format(new Date(value));
}

export function formatDateTimeCompact(value) {
  if (!value) return "-";
  const date = new Date(value);
  const day = new Intl.DateTimeFormat("es-DO", { day: "numeric" }).format(date);
  const month = new Intl.DateTimeFormat("es-DO", { month: "short" }).format(date).replace(".", "");
  const year = new Intl.DateTimeFormat("es-DO", { year: "2-digit" }).format(date);
  const time = new Intl.DateTimeFormat("es-DO", {
    hour: "numeric",
    minute: "2-digit"
  }).format(date).replace(/\s+/g, " ");
  return `${day} ${month} ${year}, ${time}`;
}

export function formatBytes(bytes = 0) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index ? 1 : 0)} ${units[index]}`;
}

export function initials(profile) {
  const first = profile?.nombre?.[0] || "";
  const last = profile?.apellido?.[0] || "";
  return `${first}${last}`.toUpperCase() || "SA";
}

export function byNewest(a, b) {
  return new Date(b.created_at || b.updated_at) - new Date(a.created_at || a.updated_at);
}

export function normalize(value = "") {
  return String(value).trim().toLowerCase();
}
