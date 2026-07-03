import { ALLOWED_EXTENSIONS, BLOCKED_EXTENSIONS } from "./constants.js";
import { APP_CONFIG } from "../config.js";

const MIME_BY_EXTENSION = {
  pdf: ["application/pdf"],
  doc: ["application/msword"],
  docx: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  xls: ["application/vnd.ms-excel"],
  xlsx: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  ppt: ["application/vnd.ms-powerpoint"],
  pptx: ["application/vnd.openxmlformats-officedocument.presentationml.presentation"],
  jpg: ["image/jpeg"],
  jpeg: ["image/jpeg"],
  png: ["image/png"],
  webp: ["image/webp"],
  txt: ["text/plain"],
  csv: ["text/csv", "application/csv", "application/vnd.ms-excel"]
};

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
    if (file.type && MIME_BY_EXTENSION[extension] && !MIME_BY_EXTENSION[extension].includes(file.type)) {
      errors.push(`${file.name}: el contenido no coincide con la extension.`);
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
