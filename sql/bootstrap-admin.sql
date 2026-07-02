-- Ejecuta este archivo una sola vez en Supabase SQL Editor para crear el primer administrador.
-- Cambia el correo por el usuario que ya creaste en Supabase Auth.

do $$
declare
  v_email text := 'TU_CORREO_AQUI@empresa.com';
  v_user_id uuid;
  v_departamento_id uuid;
begin
  select id
  into v_user_id
  from auth.users
  where lower(email) = lower(v_email)
  limit 1;

  if v_user_id is null then
    raise exception 'No existe un usuario en Supabase Auth con el correo %', v_email;
  end if;

  insert into public.departamentos (nombre, descripcion)
  values ('Tecnologia', 'Sistemas internos')
  on conflict (nombre) do update
  set descripcion = excluded.descripcion
  returning id into v_departamento_id;

  if v_departamento_id is null then
    select id into v_departamento_id
    from public.departamentos
    where nombre = 'Tecnologia'
    limit 1;
  end if;

  insert into public.profiles (
    id,
    nombre,
    apellido,
    correo,
    rol,
    departamento_id,
    activo
  )
  values (
    v_user_id,
    coalesce(split_part(v_email, '@', 1), 'Admin'),
    '',
    v_email,
    'administrador',
    v_departamento_id,
    true
  )
  on conflict (id) do update
  set
    correo = excluded.correo,
    rol = 'administrador',
    departamento_id = coalesce(public.profiles.departamento_id, excluded.departamento_id),
    activo = true;
end $$;

select
  p.id,
  p.correo,
  p.rol,
  p.activo,
  d.nombre as departamento
from public.profiles p
left join public.departamentos d on d.id = p.departamento_id
where p.rol = 'administrador'
order by p.created_at desc;
