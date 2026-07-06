export const ROLES = {
  ADMIN: "administrador",
  REQUESTER: "solicitante",
  APPROVER: "aprobador"
};

export const ROLE_LABELS = {
  [ROLES.ADMIN]: "Administrador",
  [ROLES.REQUESTER]: "Solicitante",
  [ROLES.APPROVER]: "Aprobador"
};

export const STATUS = {
  PENDING: "Pendiente",
  APPROVED: "Aprobado",
  REJECTED: "Rechazado",
  CORRECTION: "Correccion solicitada",
  CANCELLED: "Cancelado"
};

export const PRIORITIES = ["Baja", "Media", "Alta", "Urgente"];

export const ALLOWED_EXTENSIONS = [
  "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx",
  "jpg", "jpeg", "png", "webp", "txt", "csv"
];

export const BLOCKED_EXTENSIONS = ["exe", "bat", "msi", "dll", "js", "cmd", "scr"];

export const NAV_ITEMS = [
  { id: "dashboard", label: "Dashboard", icon: "grid", roles: [ROLES.ADMIN, ROLES.REQUESTER, ROLES.APPROVER] },
  { id: "new-request", label: "Nueva solicitud", icon: "plus", roles: [ROLES.ADMIN, ROLES.REQUESTER] },
  { id: "my-requests", label: "Mis solicitudes", icon: "folder", roles: [ROLES.ADMIN, ROLES.REQUESTER,] },
  { id: "pending", label: "Pendientes", icon: "clock", roles: [ROLES.ADMIN, ROLES.APPROVER] },
  { id: "history", label: "Historial", icon: "search", roles: [ROLES.ADMIN, ROLES.APPROVER] },
  { id: "users", label: "Usuarios", icon: "users", roles: [ROLES.ADMIN] },
  { id: "catalogs", label: "Catalogos", icon: "layers", roles: [ROLES.ADMIN] },
  { id: "profile", label: "Perfil", icon: "user", roles: [ROLES.ADMIN, ROLES.REQUESTER, ROLES.APPROVER] }
];
