-- Ejecuta este archivo en Supabase SQL Editor para que la auditoria
-- solo pueda ser leida por usuarios con rol administrador.

drop policy if exists "auditoria_read_admin" on public.auditoria;

create policy "auditoria_read_admin"
on public.auditoria
for select
using (public.is_admin());

grant select, insert on public.auditoria to authenticated;
