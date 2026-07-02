import { ALLOWED_EXTENSIONS, BLOCKED_EXTENSIONS } from "./constants.js";
import { APP_CONFIG } from "../config.js";

export function getExtension(name = "") {
  return name.split(".").pop()?.toLowerCase() || "";
}

export function validateFiles(files) {
  const selected = Array.from(files || []);
  const errors = [];
  if (selected.length > APP_CONFIG.maxFilesPerRequest) {
    errors.push(`Solo puedes adjuntar hasta ${APP_CONFIG.maxFilesPerRequest} archivos.`);
  }

  selected.forEach((file) => {
    const extension = getExtension(file.name);
    const sizeMb = file.size / 1024 / 1024;
    if (BLOCKED_EXTENSIONS.includes(extension) || !ALLOWED_EXTENSIONS.includes(extension)) {
      errors.push(`${file.name}: tipo de archivo no permitido.`);
    }
    if (sizeMb > APP_CONFIG.maxFileSizeMb) {
      errors.push(`${file.name}: supera ${APP_CONFIG.maxFileSizeMb} MB.`);
    }
  });

  return { valid: errors.length === 0, errors };
}

export function requireFields(values, fields) {
  return fields
    .filter((field) => !String(values[field] ?? "").trim())
    .map((field) => `El campo ${field} es obligatorio.`);
}
