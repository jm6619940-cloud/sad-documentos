# Seguridad SAD

## Antes de publicar cambios

- Ejecutar `node --check` sobre los modulos JavaScript.
- Revisar que `git ls-files sql` no devuelva archivos.
- Ejecutar en Supabase SQL Editor los parches locales requeridos dentro de `sql/`, especialmente `sql/security-hardening.sql`.
- Correr Database Advisors en Supabase Dashboard y corregir hallazgos criticos.

## Pruebas RLS minimas

Probar con tres cuentas reales: administrador, aprobador y solicitante.

- Solicitante: solo debe ver sus solicitudes, comentarios, archivos y notificaciones propias.
- Solicitante: no debe poder leer `auditoria`.
- Solicitante: no debe poder cambiar su propio `rol`.
- Aprobador: solo debe poder decidir solicitudes asignadas.
- Aprobador: no debe poder editar catalogos, usuarios ni auditoria.
- Administrador: debe poder ver auditoria y administrar perfiles/catalogos.
- Archivos: un usuario no autorizado no debe poder crear signed URLs ni leer objetos fuera de sus solicitudes.

## Operacion

- No publicar `service_role` ni secretos privados en frontend.
- Rotar claves si alguna vez se publican accidentalmente.
- Mantener dependencias CDN con version exacta e `integrity`.
- Mantener el bucket `documentos` privado.
