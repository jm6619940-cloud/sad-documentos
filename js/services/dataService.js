import { APP_CONFIG } from "../config.js";
import { getSupabase } from "./supabaseClient.js";
import { getExtension, validateFiles } from "../utils/validators.js";

function stripPassword(values) {
  const { password, ...rest } = values;
  return rest;
}

function cleanText(value) {
  return String(value || "").trim();
}

const STORAGE_MIME_BY_EXTENSION = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  txt: "text/plain",
  csv: "text/csv"
};

function storageFileName(file) {
  const extension = getExtension(file.name);
  const rawBase = file.name.replace(/\.[^/.]+$/, "");
  const safeBase = rawBase
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90) || "archivo";

  return `${crypto.randomUUID()}-${safeBase}.${extension}`;
}

function storageSignedFileName(originalName, extension) {
  const rawBase = String(originalName || "documento")
    .replace(/\.[^/.]+$/, "")
    .replace(/^firmado-/, "");
  const safeBase = rawBase
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "documento";

  return `${crypto.randomUUID()}-firmado-${safeBase}.${extension}`;
}

function validateCreateRequestPayload(values, files, user) {
  const errors = [];
  const approvers = Array.from(new Set(values.aprobadores || [])).filter(Boolean);
  const selectedFiles = Array.from(files || []);

  if (!cleanText(values.titulo)) errors.push("El titulo es obligatorio.");
  if (!cleanText(values.descripcion)) errors.push("La descripcion es obligatoria.");
  if (!cleanText(values.tipo_documento_id)) errors.push("Selecciona el tipo de documento.");
  if (!cleanText(values.prioridad)) errors.push("Selecciona la prioridad.");
  if (!approvers.length) errors.push("Selecciona al menos un aprobador.");
  if (!selectedFiles.length) errors.push("Adjunta al menos un archivo.");
  if (!user?.id) errors.push("No se encontro una sesion valida.");

  errors.push(...validateFiles(selectedFiles).errors);
  if (errors.length) throw new Error(errors.join(" "));
  return { approvers, selectedFiles };
}

function validateCorrectionPayload({ values, files, removeFileIds, existingFiles, user }) {
  const errors = [];
  const selectedFiles = Array.from(files || []);
  const removed = new Set(removeFileIds || []);
  const remainingFiles = existingFiles.filter((file) => !removed.has(file.id)).length + selectedFiles.length;

  if (!cleanText(values.titulo)) errors.push("El titulo es obligatorio.");
  if (!cleanText(values.descripcion)) errors.push("La descripcion es obligatoria.");
  if (!cleanText(values.tipo_documento_id)) errors.push("Selecciona el tipo de documento.");
  if (!cleanText(values.prioridad)) errors.push("Selecciona la prioridad.");
  if (!remainingFiles) errors.push("La solicitud debe conservar al menos un archivo.");
  if (!user?.id) errors.push("No se encontro una sesion valida.");

  errors.push(...validateFiles(selectedFiles).errors);
  if (errors.length) throw new Error(errors.join(" "));
  return { selectedFiles, removedFileIds: [...removed] };
}

async function uploadRequestFiles(supabase, solicitudId, files) {
  for (const file of files) {
    const extension = getExtension(file.name);
    const path = `${solicitudId}/${storageFileName(file)}`;
    const contentType = file.type || STORAGE_MIME_BY_EXTENSION[extension] || "application/octet-stream";
    const upload = await supabase.storage.from(APP_CONFIG.storageBucket).upload(path, file, {
      upsert: false,
      contentType
    });
    if (upload.error) throw upload.error;
    const insert = await supabase.rpc("registrar_archivo_solicitud", {
      p_solicitud_id: solicitudId,
      p_nombre_original: file.name,
      p_nombre_storage: path.split("/").pop(),
      p_mime_type: contentType,
      p_extension: extension,
      p_tamano: file.size,
      p_ruta_storage: path
    });
    if (insert.error) throw insert.error;
  }
}

async function deleteRequestFiles(supabase, files) {
  if (!files.length) return;
  const storage = await supabase.storage.from(APP_CONFIG.storageBucket).remove(files.map((file) => file.ruta_storage));
  if (storage.error) throw storage.error;
  const deleted = await supabase.from("archivos").delete().in("id", files.map((file) => file.id));
  if (deleted.error) throw deleted.error;
}

function isMissingStorageObjectError(error) {
  const message = `${error?.message || error?.error || error?.statusCode || ""}`.toLowerCase();
  return message.includes("not found")
    || message.includes("does not exist")
    || message.includes("404");
}

export const dataService = {
  async signIn(email, password) {
    const supabase = await getSupabase();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    const { data: profile, error: profileError } = await supabase.from("profiles").select("*").eq("id", data.user.id).single();
    if (profileError) throw profileError;
    await this.audit(profile.id, null, "INICIO_SESION", "Inicio de sesion.");
    return profile;
  },

  async signOut() {
    const user = await this.getCurrentUser();
    if (user) await this.audit(user.id, null, "CIERRE_SESION", "Cierre de sesion.");
    const supabase = await getSupabase();
    await supabase.auth.signOut();
  },

  async getCurrentUser() {
    const supabase = await getSupabase();
    const { data } = await supabase.auth.getUser();
    if (!data.user) return null;
    const { data: profile, error } = await supabase.from("profiles").select("*").eq("id", data.user.id).single();
    if (error) return null;
    return profile?.activo ? profile : null;
  },

  async onAuthStateChange(callback) {
    const supabase = await getSupabase();
    const { data } = supabase.auth.onAuthStateChange(callback);
    return data.subscription;
  },

  async listData() {
    const supabase = await getSupabase();
    const [
      profiles,
      departamentos,
      tipos,
      solicitudes,
      archivos,
      comentarios,
      auditoria,
      notificaciones,
      aprobadores,
      firmas
    ] = await Promise.all([
      supabase.from("profiles").select("*").order("created_at", { ascending: false }),
      supabase.from("departamentos").select("*").order("nombre"),
      supabase.from("tipos_documento").select("*").order("nombre"),
      supabase.from("solicitudes").select("*, tipo:tipos_documento(*), departamento:departamentos(*), creador:profiles!solicitudes_creado_por_fkey(*), aprobador:profiles!solicitudes_aprobado_por_fkey(*)").order("created_at", { ascending: false }),
      supabase.from("archivos").select("*").order("created_at", { ascending: false }),
      supabase.from("comentarios").select("*, usuario:profiles(*)").order("created_at", { ascending: false }),
      supabase.from("auditoria").select("*").order("created_at", { ascending: false }).limit(300),
      supabase.from("notificaciones").select("*").order("created_at", { ascending: false }).limit(100),
      supabase.from("solicitud_aprobadores").select("*"),
      supabase.from("firmas_usuarios").select("*")
    ]);
    const error = [profiles, departamentos, tipos, solicitudes, archivos, comentarios, auditoria, notificaciones, aprobadores, firmas].find((result) => result.error)?.error;
    if (error) throw error;
    return {
      profiles: profiles.data,
      departamentos: departamentos.data,
      tipos_documento: tipos.data,
      solicitudes: solicitudes.data,
      archivos: archivos.data,
      comentarios: comentarios.data,
      auditoria: auditoria.data,
      notificaciones: notificaciones.data,
      solicitud_aprobadores: aprobadores.data,
      firmas_usuarios: firmas.data || []
    };
  },

  async createRequest(values, files, user) {
    const supabase = await getSupabase();
    const solicitudId = crypto.randomUUID();
    const { approvers, selectedFiles } = validateCreateRequestPayload(values, files, user);
    const { data, error } = await supabase.rpc("crear_solicitud_con_aprobadores", {
      p_id: solicitudId,
      p_titulo: cleanText(values.titulo),
      p_descripcion: cleanText(values.descripcion),
      p_tipo_documento_id: values.tipo_documento_id,
      p_departamento_id: user.departamento_id || null,
      p_prioridad: cleanText(values.prioridad),
      p_observaciones: cleanText(values.observaciones),
      p_aprobadores: approvers
    });
    if (error) throw error;

    const createdId = data || solicitudId;

    await uploadRequestFiles(supabase, createdId, selectedFiles);
    await this.audit(user.id, createdId, "CREACION_SOLICITUD", "Solicitud creada.");
    return { id: createdId };
  },

  async updateRequestCorrection({ solicitud, values, files, removeFileIds, existingFiles, user }) {
    const supabase = await getSupabase();
    const { selectedFiles, removedFileIds } = validateCorrectionPayload({ values, files, removeFileIds, existingFiles, user });
    const filesToRemove = existingFiles.filter((file) => removedFileIds.includes(file.id));

    await uploadRequestFiles(supabase, solicitud.id, selectedFiles);
    await deleteRequestFiles(supabase, filesToRemove);

    const { error } = await supabase.rpc("reenviar_solicitud_corregida", {
      p_id: solicitud.id,
      p_titulo: cleanText(values.titulo),
      p_descripcion: cleanText(values.descripcion),
      p_tipo_documento_id: values.tipo_documento_id,
      p_prioridad: cleanText(values.prioridad),
      p_observaciones: cleanText(values.observaciones)
    });
    if (error) throw error;
    await this.audit(user.id, solicitud.id, "REENVIO_CORRECCION", "Solicitud corregida y reenviada.");
  },

  async addComment(solicitudId, userId, comentario) {
    const supabase = await getSupabase();
    const { data, error } = await supabase
      .from("comentarios")
      .insert({ solicitud_id: solicitudId, usuario_id: userId, comentario })
      .select("*, usuario:profiles(*)")
      .single();
    if (error) throw error;
    await this.audit(userId, solicitudId, "COMENTARIO", "Comentario agregado.");
    return data;
  },

  async actOnRequest(solicitudId, user, action, comentario) {
    const supabase = await getSupabase();
    const { error } = await supabase.rpc("actuar_solicitud", {
      p_id: solicitudId,
      p_accion: action,
      p_comentario: cleanText(comentario)
    });
    if (error) throw error;
  },

  async completePurchaseRequest(solicitudId, comentario, user) {
    if (!user?.id) throw new Error("No se encontro una sesion valida.");
    const supabase = await getSupabase();
    const { error } = await supabase.rpc("completar_solicitud_compra", {
      p_id: solicitudId,
      p_comentario: cleanText(comentario)
    });
    if (error) throw error;
  },

  async upsertCatalog(table, values) {
    const supabase = await getSupabase();
    const { error } = await supabase.from(table).upsert(values);
    if (error) throw error;
  },

  async upsertProfile(values) {
    if (!values.id) {
      throw new Error("Crea primero el usuario en Supabase Auth. Luego edita su perfil desde SAD.");
    }
    const supabase = await getSupabase();
    const { error } = await supabase.from("profiles").upsert(stripPassword(values));
    if (error) throw error;
  },

  async setProfileActive(id, activo) {
    const supabase = await getSupabase();
    const { error } = await supabase.from("profiles").update({ activo }).eq("id", id);
    if (error) throw error;
  },

  async saveUserSignature(userId, firmaDataUrl) {
    if (!userId) throw new Error("No se encontro una sesion valida.");
    if (!String(firmaDataUrl || "").startsWith("data:image/png;base64,")) {
      throw new Error("La firma debe guardarse como imagen PNG.");
    }
    const supabase = await getSupabase();
    const { error } = await supabase
      .from("firmas_usuarios")
      .upsert({ usuario_id: userId, firma_data_url: firmaDataUrl }, { onConflict: "usuario_id" });
    if (error) throw error;
  },

  async saveSignedDocument({ solicitudId, sourceFile, blob, extension, mimeType }) {
    if (!solicitudId || !sourceFile?.nombre_original || !blob?.size) {
      throw new Error("No se pudo preparar el documento firmado.");
    }
    if (blob.size > APP_CONFIG.maxFileSize) {
      throw new Error(`El archivo firmado pesa ${Math.round(blob.size / 1024 / 1024)} MB. El limite es ${Math.round(APP_CONFIG.maxFileSize / 1024 / 1024)} MB.`);
    }
    const supabase = await getSupabase();
    const normalizedExtension = String(extension || "pdf").toLowerCase();
    const contentType = mimeType || STORAGE_MIME_BY_EXTENSION[normalizedExtension] || blob.type || "application/octet-stream";
    const displayName = `firmado-${sourceFile.nombre_original.replace(/\.[^/.]+$/, "")}.${normalizedExtension}`;
    const path = `${solicitudId}/${storageSignedFileName(sourceFile.nombre_original, normalizedExtension)}`;
    const upload = await supabase.storage.from(APP_CONFIG.storageBucket).upload(path, blob, {
      upsert: false,
      contentType
    });
    if (upload.error) {
      const detail = upload.error.message || upload.error.error || upload.error.statusCode || "";
      throw new Error(detail ? `Storage rechazo el archivo firmado: ${detail}` : "Storage rechazo el archivo firmado.");
    }

    const insert = await supabase.rpc("registrar_archivo_firmado_solicitud", {
      p_solicitud_id: solicitudId,
      p_nombre_original: displayName,
      p_nombre_storage: path.split("/").pop(),
      p_mime_type: contentType,
      p_extension: normalizedExtension,
      p_tamano: blob.size,
      p_ruta_storage: path
    });
    if (insert.error) throw insert.error;

    if (sourceFile.id && sourceFile.ruta_storage) {
      const removed = await supabase.storage.from(APP_CONFIG.storageBucket).remove([sourceFile.ruta_storage]);
      if (removed.error && !isMissingStorageObjectError(removed.error)) throw removed.error;
      const cleanup = await supabase.rpc("eliminar_archivo_original_firmado", {
        p_archivo_id: sourceFile.id,
        p_solicitud_id: solicitudId
      });
      if (cleanup.error) throw cleanup.error;
    }

    return insert.data;
  },

  async cleanupOriginalSignedFile(solicitudId, fileId) {
    if (!solicitudId || !fileId) return;
    const supabase = await getSupabase();
    const cleanup = await supabase.rpc("eliminar_archivo_original_firmado", {
      p_archivo_id: fileId,
      p_solicitud_id: solicitudId
    });
    if (cleanup.error) throw cleanup.error;
  },

  async markNotificationsRead(userId) {
    const supabase = await getSupabase();
    const { error } = await supabase.from("notificaciones").update({ leida: true }).eq("usuario_id", userId);
    if (error) throw error;
  },

  async markNotificationRead(id, userId) {
    const supabase = await getSupabase();
    const { error } = await supabase.from("notificaciones").update({ leida: true }).eq("id", id).eq("usuario_id", userId);
    if (error) throw error;
  },

  async clearNotifications(userId) {
    const supabase = await getSupabase();
    const { error } = await supabase.from("notificaciones").delete().eq("usuario_id", userId);
    if (error) throw error;
  },

  async savePushSubscription(userId, subscription) {
    const payload = subscription?.toJSON ? subscription.toJSON() : subscription;
    const keys = payload?.keys || {};
    if (!userId || !payload?.endpoint || !keys.p256dh || !keys.auth) {
      throw new Error("La suscripcion push no esta completa.");
    }

    const supabase = await getSupabase();
    const { error } = await supabase.rpc("registrar_push_subscription", {
      p_endpoint: payload.endpoint,
      p_p256dh: keys.p256dh,
      p_auth: keys.auth,
      p_user_agent: navigator.userAgent
    });
    if (error) throw error;
  },

  async removePushSubscription(endpoint, userId) {
    if (!endpoint || !userId) return;
    const supabase = await getSupabase();
    const { error } = await supabase
      .from("push_subscriptions")
      .update({ activo: false, updated_at: new Date().toISOString() })
      .eq("endpoint", endpoint)
      .eq("usuario_id", userId);
    if (error) throw error;
  },

  async signedUrl(path) {
    const supabase = await getSupabase();
    const { data, error } = await supabase.storage.from(APP_CONFIG.storageBucket).createSignedUrl(path, 300);
    if (error) throw error;
    return data.signedUrl;
  },

  async audit(usuarioId, solicitudId, accion, descripcion) {
    const supabase = await getSupabase();
    const { error } = await supabase.rpc("registrar_auditoria", {
      p_solicitud_id: solicitudId,
      p_accion: accion,
      p_descripcion: descripcion
    });
    if (error) console.warn("No se pudo registrar auditoria.", error);
  }
};
