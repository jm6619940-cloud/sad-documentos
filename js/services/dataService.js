import { APP_CONFIG } from "../config.js";
import { getSupabase } from "./supabaseClient.js";
import { STATUS } from "../utils/constants.js";
import { getExtension } from "../utils/validators.js";

function stripPassword(values) {
  const { password, ...rest } = values;
  return rest;
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
    const { error } = await supabase
      .from("solicitudes")
      .insert({
        id: solicitudId,
        titulo: values.titulo,
        descripcion: values.descripcion,
        tipo_documento_id: values.tipo_documento_id,
        departamento_id: user.departamento_id,
        prioridad: values.prioridad,
        estado: STATUS.PENDING,
        creado_por: user.id,
        observaciones: values.observaciones || ""
      });
    if (error) throw error;

    const approverRows = Array.from(new Set(values.aprobadores || [])).map((id, index) => ({
      solicitud_id: solicitudId,
      usuario_id: id,
      orden: index + 1,
      estado: STATUS.PENDING
    }));
    if (approverRows.length) {
      const assignment = await supabase.from("solicitud_aprobadores").insert(approverRows);
      if (assignment.error) throw assignment.error;
    }

    for (const file of Array.from(files || [])) {
      const path = `${solicitudId}/${crypto.randomUUID()}-${file.name}`;
      const upload = await supabase.storage.from(APP_CONFIG.storageBucket).upload(path, file, { upsert: false });
      if (upload.error) throw upload.error;
      const insert = await supabase.from("archivos").insert({
        solicitud_id: solicitudId,
        nombre_original: file.name,
        nombre_storage: path.split("/").pop(),
        mime_type: file.type,
        extension: getExtension(file.name),
        tamano: file.size,
        ruta_storage: path
      });
      if (insert.error) throw insert.error;
    }
    await this.audit(user.id, solicitudId, "CREACION_SOLICITUD", "Solicitud creada.");
    return { id: solicitudId };
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
