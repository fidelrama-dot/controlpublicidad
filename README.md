# ControlPublicidad

Sistema de evidencias fotográficas y videos con GPS para campañas de lonas, espectaculares y bardas.

## Estado
Base de requisitos y reglas de dominio; todavía no es una aplicación instalable.
Pendientes: cliente móvil, servidor, autenticación, almacenamiento cifrado, sincronización, panel web y mapa.

## Jerarquía y alcance
- Administrador: único rol que crea campañas y asigna exactamente un líder por campaña; gestiona todos los usuarios y consulta todas las campañas.
- Líder: crea, modifica y desactiva coordinadores de sus campañas; consulta estadísticas y evidencias de toda su propia rama.
- Coordinador: crea, modifica y desactiva colaboradores asignados directamente a él; consulta su equipo.
- Colaborador: captura evidencias, consulta el estado de sus envíos y sincroniza; no administra usuarios.
- Un líder no modifica coordinadores de otro líder. Un coordinador no modifica colaboradores de otro coordinador.
- El líder supervisa la rama, pero no administra directamente los colaboradores del coordinador.
- Los permisos se validan en servidor para cada operación, no solamente ocultando botones.
- Las bajas son desactivaciones: conservan autoría e historial. Los traslados requieren una operación administrativa auditada.

## Campañas
Nombre, líder, ubicación (descripción y coordenadas/área), tipos habilitados: lonas, espectaculares, bardas.
Un tipo implica campaña simple; dos o tres implican mixta.
Cada registro tiene exactamente un tipo permitido por la campaña.
La selección de ubicación no limita automáticamente dónde se puede capturar.

## Acceso e invitaciones
Autenticación por código de verificación al correo o celular; la primera verificación requiere internet.
QR y enlace de invitación con token aleatorio, caducidad y uso único.
El servidor fija campaña, rol y superior; el destinatario no puede cambiarlos.
Compartir mediante las aplicaciones de correo o WhatsApp del teléfono y hoja de compartir del sistema.
Compartir una invitación no concede acceso hasta que se acepte y verifique la identidad.
El registro de usuario es global; la pertenencia y jerarquía se modelan por campaña.

## Captura
Captura dentro de la app, sin importación desde galería.
Hasta 10 fotos y 3 videos por registro; al menos una evidencia.
Autor identificado desde la sesión, nombre del colaborador al capturar, campaña, coordinador y líder como historial.
GPS por evidencia: latitud, longitud, precisión en metros, fecha de la lectura y disponibilidad.
Fecha/hora por foto; para video, inicio de grabación. Conservar UTC, zona/desfase y fecha de recepción en servidor por separado.
Marca, modelo, nombre del equipo cuando esté disponible y UUID de instalación.
IMEI/serie no son requisito: Android restringe su acceso; el UUID no identifica permanentemente el hardware y puede cambiar al reinstalar.
Campo Notas. No inventar GPS si no está disponible; conservar la evidencia con advertencia para revisión.
No presentar coordenadas como una ubicación exacta garantizada.

## Identificación y nombres
UUID de registro generado antes de capturar para impedir duplicados sin internet.
Número visible de registro único dentro de la campaña: asignación atómica en servidor durante sincronización.
Nombre final: Nombre de campaña - número de registro - consecutivo.ext.
Consecutivo único para fotos y videos del mismo registro (1 a 13); extensión conserva el formato real.
Offline: archivos internos identificados por UUID; al sincronizar se publica el nombre final.
Conservar el nombre de campaña original para que un cambio posterior no altere la evidencia.

## Conservación offline y sincronización (crítico)
Guardar cada evidencia inmediatamente, sin esperar a finalizar el registro.
Archivos y metadatos cifrados, claves protegidas mediante el almacén seguro del sistema.
Escritura atómica, diario recuperable y verificación al reabrir tras cierre o batería agotada.
No informar Guardado hasta confirmar persistencia local.
No cerrar sesión ni borrar caché de evidencias pendientes.
Estados: borrador, sellado pendiente, sincronizando, sincronizado, error reintentable.
Al sellar, el colaborador no puede modificar ni borrar el registro, incluso si aún no se ha enviado.
Subida reanudable, reintentos y clave de idempotencia por registro y evidencia.
Hash SHA-256 del contenido; confirmación del servidor solo después de verificar todos los archivos y metadatos.
Un hash detecta cambios del archivo; no demuestra por sí solo que la captura sea auténtica.
Mantener copia local hasta confirmación íntegra; no borrarla automáticamente en la primera versión.
Botón Actualizar a la nube, conteo de pendientes, progreso y errores por registro.
La recuperación cubre cierres y reinicios; no puede garantizarse ante destrucción del teléfono, desinstalación o borrado de datos antes de sincronizar.
Comprobar espacio antes de capturar; si falta, avisar conservando lo ya registrado.

## Panel y mapa
Administrador: todas sus campañas. Líder: campañas y descendientes propios. Coordinador: su equipo.
Estadísticas de registros, fotos, videos, tipo, fechas y colaborador.
El servidor no puede contabilizar evidencias que siguen exclusivamente offline.
Mapa de evidencias con ventana emergente para foto/video, autor, fecha, tipo, notas y precisión.
Filtros combinables de campaña, fecha local y uno o varios tipos habilitados.
Las correcciones de administradores se conservan como anotaciones auditadas; no sobrescriben archivos originales.

## Arquitectura propuesta
App móvil con almacenamiento privado cifrado y captura nativa; panel web para administración.
API autenticada, base relacional y almacenamiento privado de medios con acceso autorizado.
La plataforma móvil inicial y los proveedores de autenticación/nube quedan por confirmar.
Tablas previstas: usuarios, dispositivos, campañas, pertenencias, invitaciones, registros, evidencias, tareas y auditoría.
Las tareas se mencionan en los permisos; su flujo y campos quedan por definir.

## Validación antes de uso real
- Dos coordinadores: uno no puede consultar/editar/asignar a la rama del otro.
- Dos líderes: aislamiento entre campañas y ramas.
- Único líder por campaña y tipo único por registro.
- Rechazo de la evidencia 11 y video 4.
- Captura en modo avión, cierre forzado, reinicio y recuperación íntegra.
- Corte de red a mitad de subida; reintento sin duplicados ni pérdida.
- Rechazo de modificación/borrado tras sellado.
- Invitación caducada/reutilizada o con rol manipulado rechazada.
- GPS sin permiso o impreciso: evidencia conservada y señalada.
- Confirmación remota de todos los archivos antes de marcar sincronizado.

## Pruebas de la base
python3 -m unittest discover -s tests -v

