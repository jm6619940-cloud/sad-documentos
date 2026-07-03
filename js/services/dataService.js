import { APP_CONFIG } from "../config.js";
import { getSupabase } from "./supabaseClient.js";
import { STATUS } from "../utils/constants.js";
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
      aprobadores
    ] = await Promise.all([
      supabase.from("profiles").select("*").order("created_at", { ascending: false }),
      supabase.from("departamentos").select("*").order("nombre"),
      supabase.from("tipos_documento").select("*").order("nombre"),
      supabase.from("solicitudes").select("*, tipo:tipos_documento(*), departamento:departamentos(*), creador:profiles!solicitudes_creado_por_fkey(*), aprobador:profiles!solicitudes_aprobado_por_fkey(*)").order("created_at", { ascending: false }),
      supabase.from("archivos").select("*").order("created_at", { ascending: false }),
      supabase.from("comentarios").select("*, usuario:profiles(*)").order("created_at", { ascending: false }),
      supabase.from("auditoria").select("*").order("created_at", { ascending: false }).limit(300),
      supabase.from("notificaciones").select("*").order("created_at", { ascending: false }).limit(100),
      supabase.from("solicitud_aprobadores").select("*")
    ]);
    const error = [profiles, departamentos, tipos, solicitudes, archivos, comentarios, auditoria, notificaciones, aprobadores].find((result) => result.error)?.error;
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
      solicitud_aprobadores: aprobadores.data
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

    for (const file of selectedFiles) {
      const extension = getExtension(file.name);
      const path = `${createdId}/${storageFileName(file)}`;
      const contentType = file.type || STORAGE_MIME_BY_EXTENSION[extension] || "application/octet-stream";
      const upload = await supabase.storage.from(APP_CONFIG.storageBucket).upload(path, file, {
        upsert: false,
        contentType
      });
      if (upload.error) throw upload.error;
      const insert = await supabase.from("archivos").insert({
        solicitud_id: createdId,
        nombre_original: file.name,
        nombre_storage: path.split("/").pop(),
        mime_type: contentType,
        extension,
        tamano: file.size,
        ruta_storage: path
      });
      if (insert.error) throw insert.error;
    }
    await this.audit(user.id, createdId, "CREACION_SOLICITUD", "Solicitud creada.");
    return { id: createdId };
  },

  async addComment(solicitudId, userId, comentario) {
    const supabase = await getSupabase();
    const { error } = await supabase.from("comentarios").insert({ solicitud_id: solicitudId, usuario_id: userId, comentario });
    if (error) throw error;
    await this.audit(userId, solicitudId, "COMENTARIO", "Comentario agregado.");
  },

  async actOnRequest(solicitudId, user, action, comentario) {
    const statusByAction = {
      aprobar: STATUS.APPROVED,
      rechazar: STATUS.REJECTED,
      correccion: STATUS.CORRECTION
    };
    const supabase = await getSupabase();
    const estado = statusByAction[action];
    if (!estado) throw new Error("Accion no permitida.");
    const now = new Date().toISOString();
    const assigned = await supabase
      .from("solicitud_aprobadores")
      .update({ estado, comentario, fecha_accion: now })
      .eq("solicitud_id", solicitudId)
      .eq("usuario_id", user.id);
    if (assigned.error) throw assigned.error;

    let finalStatus = null;
    if (estado === STATUS.REJECTED || estado === STATUS.CORRECTION) {
      finalStatus = estado;
    } else {
      const approvals = await supabase
        .from("solicitud_aprobadores")
        .select("estado")
        .eq("solicitud_id", solicitudId);
      if (approvals.error) throw approvals.error;
      if (approvals.data.length && approvals.data.every((item) => item.estado === STATUS.APPROVED)) {
        finalStatus = STATUS.APPROVED;
      }
    }

    if (!finalStatus) {
      await this.audit(user.id, solicitudId, action.toUpperCase(), "Aprobacion individual registrada.");
      return;
    }

    const { error } = await supabase
      .from("solicitudes")
      .update({ estado: finalStatus, aprobado_por: user.id, fecha_aprobacion: now, comentario_aprobacion: comentario || "" })
      .eq("id", solicitudId);
    if (error) throw error;
    await this.audit(user.id, solicitudId, action.toUpperCase(), `Solicitud marcada como ${finalStatus}.`);
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

  async markNotificationsRead(userId) {
    const supabase = await getSupabase();
    const { error } = await supabase.from("notificaciones").update({ leida: true }).eq("usuario_id", userId);
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
    await supabase.from("auditoria").insert({ usuario_id: usuarioId, solicitud_id: solicitudId, accion, descripcion, user_agent: navigator.userAgent });
  }
};
