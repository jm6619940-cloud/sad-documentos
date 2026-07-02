create extension if not exists pgcrypto;

create table if not exists public.departamentos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  descripcion text,
  created_at timestamptz not null default now()
);

create table if not exists public.tipos_documento (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  descripcion text,
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nombre text not null default '',
  apellido text not null default '',
  correo text not null unique,
  rol text not null default 'solicitante' check (rol in ('administrador', 'solicitante', 'aprobador')),
  departamento_id uuid references public.departamentos(id),
  activo boolean not null default true,
  avatar text,
  created_at timestamptz not null default now()
);

create table if not exists public.solicitud_consecutivos (
  anio int primary key,
  ultimo int not null default 0
);

create table if not exists public.solicitudes (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  titulo text not null,
  descripcion text,
  tipo_documento_id uuid not null references public.tipos_documento(id),
  departamento_id uuid references public.departamentos(id),
  prioridad text not null check (prioridad in ('Baja', 'Media', 'Alta', 'Urgente')),
  estado text not null default 'Pendiente' check (estado in ('Pendiente', 'Aprobado', 'Rechazado', 'Correccion solicitada', 'Cancelado')),
  creado_por uuid not null references public.profiles(id),
  aprobado_por uuid references public.profiles(id),
  fecha_aprobacion timestamptz,
  comentario_aprobacion text,
  observaciones text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.solicitud_aprobadores (
  id uuid primary key default gen_random_uuid(),
  solicitud_id uuid not null references public.solicitudes(id) on delete cascade,
  usuario_id uuid not null references public.profiles(id),
  orden int not null default 1,
  estado text not null default 'Pendiente' check (estado in ('Pendiente', 'Aprobado', 'Rechazado', 'Correccion solicitada', 'Cancelado')),
  comentario text,
  fecha_accion timestamptz,
  unique (solicitud_id, usuario_id, orden)
);

create table if not exists public.archivos (
  id uuid primary key default gen_random_uuid(),
  solicitud_id uuid not null references public.solicitudes(id) on delete cascade,
  nombre_original text not null,
  nombre_storage text not null,
  mime_type text,
  extension text not null check (lower(extension) in ('pdf','doc','docx','xls','xlsx','ppt','pptx','jpg','jpeg','png','webp','txt','csv')),
  tamano bigint not null check (tamano <= 20971520),
  ruta_storage text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.comentarios (
  id uuid primary key default gen_random_uuid(),
  solicitud_id uuid not null references public.solicitudes(id) on delete cascade,
  usuario_id uuid not null references public.profiles(id),
  comentario text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.auditoria (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid references public.profiles(id),
  solicitud_id uuid references public.solicitudes(id),
  accion text not null,
  descripcion text,
  ip inet,
  user_agent text,
  created_at timestamptz not null default now()
);

create table if not exists public.notificaciones (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references public.profiles(id) on delete cascade,
  titulo text not null,
  mensaje text not null,
  leida boolean not null default false,
  created_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_solicitudes_updated_at on public.solicitudes;
create trigger trg_solicitudes_updated_at
before update on public.solicitudes
for each row execute function public.set_updated_at();

create or replace function public.generar_codigo_solicitud()
returns trigger
security definer
set search_path = public
language plpgsql
as $$
declare
  v_anio int := extract(year from now());
  v_numero int;
begin
  if new.codigo is not null and new.codigo <> '' then
    return new;
  end if;

  insert into public.solicitud_consecutivos(anio, ultimo)
  values (v_anio, 0)
  on conflict (anio) do nothing;

  update public.solicitud_consecutivos
  set ultimo = ultimo + 1
  where anio = v_anio
  returning ultimo into v_numero;

  new.codigo := 'AUT-' || v_anio || '-' || lpad(v_numero::text, 6, '0');
  return new;
end;
$$;

drop trigger if exists trg_generar_codigo_solicitud on public.solicitudes;
create trigger trg_generar_codigo_solicitud
before insert on public.solicitudes
for each row execute function public.generar_codigo_solicitud();

create or replace function public.handle_new_user()
returns trigger
security definer
set search_path = public
language plpgsql
as $$
begin
  insert into public.profiles (id, nombre, apellido, correo, rol)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'nombre', ''),
    coalesce(new.raw_user_meta_data->>'apellido', ''),
    new.email,
    coalesce(new.raw_user_meta_data->>'rol', 'solicitante')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.current_profile_role()
returns text
security definer
set search_path = public
language sql
stable
as $$
  select rol from public.profiles where id = auth.uid() and activo = true;
$$;

create or replace function public.is_admin()
returns boolean
security definer
set search_path = public
language sql
stable
as $$
  select coalesce(public.current_profile_role() = 'administrador', false);
$$;

create or replace function public.can_access_solicitud(p_solicitud_id uuid)
returns boolean
security definer
set search_path = public
language sql
stable
as $$
  select exists (
    select 1
    from public.solicitudes s
    left join public.solicitud_aprobadores sa on sa.solicitud_id = s.id
    where s.id = p_solicitud_id
      and (
        public.is_admin()
        or s.creado_por = auth.uid()
        or (public.current_profile_role() = 'aprobador' and (s.estado = 'Pendiente' or sa.usuario_id = auth.uid() or s.aprobado_por = auth.uid()))
      )
  );
$$;

create or replace function public.asignar_aprobador_y_notificar()
returns trigger
security definer
set search_path = public
language plpgsql
as $$
declare
  v_aprobador uuid;
begin
  select id into v_aprobador
  from public.profiles
  where rol = 'aprobador' and activo = true
  order by created_at
  limit 1;

  if v_aprobador is not null then
    insert into public.solicitud_aprobadores (solicitud_id, usuario_id, orden)
    values (new.id, v_aprobador, 1)
    on conflict do nothing;

    insert into public.notificaciones (usuario_id, titulo, mensaje)
    values (v_aprobador, 'Nueva solicitud pendiente', new.codigo || ' requiere revision.');
  end if;

  return new;
end;
$$;

drop trigger if exists trg_asignar_aprobador_y_notificar on public.solicitudes;
create trigger trg_asignar_aprobador_y_notificar
after insert on public.solicitudes
for each row execute function public.asignar_aprobador_y_notificar();

create or replace function public.notificar_decision_solicitud()
returns trigger
security definer
set search_path = public
language plpgsql
as $$
begin
  if old.estado is distinct from new.estado and new.estado <> 'Pendiente' then
    insert into public.notificaciones (usuario_id, titulo, mensaje)
    values (new.creado_por, 'Solicitud ' || new.estado, new.codigo || ': ' || coalesce(new.comentario_aprobacion, 'Sin comentario adicional.'));
  end if;
  return new;
end;
$$;

drop trigger if exists trg_notificar_decision_solicitud on public.solicitudes;
create trigger trg_notificar_decision_solicitud
after update on public.solicitudes
for each row execute function public.notificar_decision_solicitud();

alter table public.profiles enable row level security;
alter table public.departamentos enable row level security;
alter table public.tipos_documento enable row level security;
alter table public.solicitud_consecutivos enable row level security;
alter table public.solicitudes enable row level security;
alter table public.solicitud_aprobadores enable row level security;
alter table public.archivos enable row level security;
alter table public.comentarios enable row level security;
alter table public.auditoria enable row level security;
alter table public.notificaciones enable row level security;

create policy "profiles_select_scope" on public.profiles for select using (public.is_admin() or id = auth.uid() or public.current_profile_role() = 'aprobador');
create policy "profiles_admin_write" on public.profiles for all using (public.is_admin()) with check (public.is_admin());

create policy "departamentos_read" on public.departamentos for select using (auth.uid() is not null);
create policy "departamentos_admin_write" on public.departamentos for all using (public.is_admin()) with check (public.is_admin());

create policy "tipos_read" on public.tipos_documento for select using (auth.uid() is not null);
create policy "tipos_admin_write" on public.tipos_documento for all using (public.is_admin()) with check (public.is_admin());

create policy "solicitudes_select_scope" on public.solicitudes for select using (public.can_access_solicitud(id));
create policy "solicitudes_insert_owner" on public.solicitudes for insert with check (creado_por = auth.uid() or public.is_admin());
create policy "solicitudes_update_owner_pending" on public.solicitudes for update using (creado_por = auth.uid() and estado in ('Pendiente', 'Correccion solicitada')) with check (creado_por = auth.uid());
create policy "solicitudes_update_approver" on public.solicitudes for update using (public.is_admin() or (public.current_profile_role() = 'aprobador' and estado = 'Pendiente')) with check (public.is_admin() or public.current_profile_role() = 'aprobador');

create policy "aprobadores_read_scope" on public.solicitud_aprobadores for select using (public.is_admin() or usuario_id = auth.uid() or public.can_access_solicitud(solicitud_id));
create policy "aprobadores_admin_insert" on public.solicitud_aprobadores for insert with check (public.is_admin());
create policy "aprobadores_update_assigned" on public.solicitud_aprobadores for update using (public.is_admin() or usuario_id = auth.uid()) with check (public.is_admin() or usuario_id = auth.uid());

create policy "archivos_read_scope" on public.archivos for select using (public.can_access_solicitud(solicitud_id));
create policy "archivos_insert_owner" on public.archivos for insert with check (exists (select 1 from public.solicitudes s where s.id = solicitud_id and (s.creado_por = auth.uid() or public.is_admin())));

create policy "comentarios_read_scope" on public.comentarios for select using (public.can_access_solicitud(solicitud_id));
create policy "comentarios_insert_scope" on public.comentarios for insert with check (usuario_id = auth.uid() and public.can_access_solicitud(solicitud_id));

create policy "auditoria_read_admin" on public.auditoria for select using (public.is_admin() or usuario_id = auth.uid());
create policy "auditoria_insert_auth" on public.auditoria for insert with check (usuario_id = auth.uid() or public.is_admin());

create policy "notificaciones_owner_read" on public.notificaciones for select using (usuario_id = auth.uid() or public.is_admin());
create policy "notificaciones_owner_update" on public.notificaciones for update using (usuario_id = auth.uid() or public.is_admin()) with check (usuario_id = auth.uid() or public.is_admin());
create policy "notificaciones_insert_admin" on public.notificaciones for insert with check (public.is_admin());

insert into public.departamentos (nombre, descripcion) values
  ('Compras', 'Adquisiciones y suplidores'),
  ('Finanzas', 'Pagos, presupuestos y control'),
  ('Recursos Humanos', 'Personas y cultura'),
  ('Tecnologia', 'Sistemas internos')
on conflict (nombre) do nothing;

insert into public.tipos_documento (nombre, descripcion) values
  ('Factura', 'Documentos de facturacion'),
  ('Contrato', 'Acuerdos y renovaciones'),
  ('Cotizacion', 'Propuestas de proveedores'),
  ('Vacaciones', 'Solicitudes de descanso'),
  ('Permiso', 'Autorizaciones internas'),
  ('Compra', 'Ordenes y requisiciones'),
  ('Otro', 'Documento no clasificado')
on conflict (nombre) do nothing;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'documentos',
  'documentos',
  false,
  20971520,
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'image/jpeg',
    'image/png',
    'image/webp',
    'text/plain',
    'text/csv'
  ]
)
on conflict (id) do update set public = false, file_size_limit = 20971520;

create policy "storage_private_read" on storage.objects for select
using (
  bucket_id = 'documentos'
  and public.can_access_solicitud((storage.foldername(name))[1]::uuid)
);

create policy "storage_private_insert" on storage.objects for insert
with check (
  bucket_id = 'documentos'
  and exists (
    select 1 from public.solicitudes s
    where s.id = (storage.foldername(name))[1]::uuid
      and (s.creado_por = auth.uid() or public.is_admin())
  )
);
