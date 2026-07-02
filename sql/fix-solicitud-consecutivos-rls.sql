-- Corrige errores 403 al crear solicitudes desde Supabase REST:
-- new row violates row-level security policy for table "solicitud_consecutivos"
-- permission denied / missing grants on public tables
--
-- Ejecuta este archivo en Supabase SQL Editor.

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

alter table public.solicitud_consecutivos enable row level security;

grant usage on schema public to authenticated;

grant select, update on public.profiles to authenticated;
grant select on public.departamentos to authenticated;
grant select on public.tipos_documento to authenticated;
grant select, insert, update on public.solicitudes to authenticated;
grant select, insert, update on public.solicitud_aprobadores to authenticated;
grant select, insert on public.archivos to authenticated;
grant select, insert on public.comentarios to authenticated;
grant select, insert on public.auditoria to authenticated;
grant select, update on public.notificaciones to authenticated;

grant execute on function public.current_profile_role() to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.can_access_solicitud(uuid) to authenticated;

drop trigger if exists trg_generar_codigo_solicitud on public.solicitudes;
create trigger trg_generar_codigo_solicitud
before insert on public.solicitudes
for each row execute function public.generar_codigo_solicitud();

select
  proname,
  prosecdef as security_definer
from pg_proc
where proname = 'generar_codigo_solicitud';
