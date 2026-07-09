import { ROLES, STATUS } from "./constants.js";

export function canSeePurchaseModule(user, data) {
  return user?.rol === ROLES.ADMIN || isPurchaseDepartmentUser(user, data);
}

export function isPurchaseDepartmentUser(user, data) {
  if (!user?.departamento_id) return false;
  const department = data?.departamentos?.find((item) => item.id === user.departamento_id);
  return normalizePurchaseText(department?.nombre).includes("compra");
}

export function isPurchaseRequest(item) {
  return normalizePurchaseText(`${item?.tipo?.nombre || ""} ${item?.departamento?.nombre || ""}`).includes("compra");
}

export function purchaseRequests(items = []) {
  return items.filter(isPurchaseRequest);
}

export function purchaseRequestsForUser(user, data, items = data?.solicitudes || []) {
  const purchases = purchaseRequests(items);
  if (user?.rol === ROLES.ADMIN) return purchases;
  if (!isPurchaseDepartmentUser(user, data)) return [];
  return purchases.filter((item) => purchaseBelongsToUser(item, data, user.id));
}

export function purchaseBelongsToUser(item, data, userId) {
  return item.creado_por === userId
    || item.completado_por === userId
    || data.solicitud_aprobadores.some((approval) => approval.solicitud_id === item.id && approval.usuario_id === userId);
}

export function purchaseUsers(data) {
  return data.profiles
    .filter((profile) => profile.activo && isPurchaseDepartmentUser(profile, data))
    .sort((a, b) => profileName(a).localeCompare(profileName(b), "es"));
}

export function purchaseStats(items) {
  const approved = items.filter((item) => item.estado === STATUS.APPROVED);
  const pendingExecution = approved.filter((item) => item.ejecucion_estado !== "Completada");
  const completed = items.filter((item) => item.ejecucion_estado === "Completada");
  const completedWithDates = completed.filter((item) => item.fecha_aprobacion && item.fecha_completada);
  const averageMinutes = completedWithDates.length
    ? completedWithDates.reduce((total, item) => total + purchaseExecutionMinutes(item), 0) / completedWithDates.length
    : 0;
  const slowPending = pendingExecution.filter((item) => item.fecha_aprobacion && purchaseExecutionMinutes(item) >= 4320);
  const completionRate = approved.length ? Math.round((completed.length / approved.length) * 100) : 0;

  return {
    total: items.length,
    approved: approved.length,
    pendingExecution: pendingExecution.length,
    completed: completed.length,
    rejected: items.filter((item) => item.estado === STATUS.REJECTED).length,
    correction: items.filter((item) => item.estado === STATUS.CORRECTION).length,
    averageMinutes,
    slowPending: slowPending.length,
    completionRate
  };
}

export function purchaseExecutionMinutes(item) {
  const start = item.fecha_aprobacion ? new Date(item.fecha_aprobacion) : new Date(item.updated_at || item.created_at);
  const end = item.fecha_completada ? new Date(item.fecha_completada) : new Date();
  return Math.max(0, end - start) / 60000;
}

export function formatDuration(minutes) {
  if (!minutes) return "-";
  const rounded = Math.round(minutes);
  const days = Math.floor(rounded / 1440);
  const hours = Math.floor((rounded % 1440) / 60);
  if (days) return `${days}d ${hours}h`;
  if (hours) return `${hours}h`;
  return `${rounded}m`;
}

export function matchesPurchaseRange(item, range) {
  if (!range || range === "all") return true;
  const value = item.fecha_completada || item.fecha_aprobacion || item.updated_at || item.created_at;
  if (!value) return false;
  const date = new Date(value);
  const now = new Date();
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  if (range === "today") return date >= today;
  if (range === "month") return date >= new Date(now.getFullYear(), now.getMonth(), 1);
  const days = Number(range);
  if (!days) return true;
  const since = new Date(now);
  since.setDate(now.getDate() - (days - 1));
  since.setHours(0, 0, 0, 0);
  return date >= since;
}

export function profileName(profile) {
  return `${profile?.nombre || ""} ${profile?.apellido || ""}`.trim() || profile?.correo || "Usuario";
}

function normalizePurchaseText(value = "") {
  return String(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}
