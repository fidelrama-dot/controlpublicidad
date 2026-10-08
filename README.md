# ControlPublicidad

Sistema de evidencias fotográficas y videos con GPS para campañas de lonas, espectaculares y bardas.

## Estado
Versión 0.6: panel conectado a un servidor local de desarrollo, además del prototipo autónomo.
El servidor guarda usuarios, campañas, pertenencias, invitaciones y sesiones en SQLite; aplica permisos por rama en cada operación.
Las invitaciones tienen contacto verificado, caducidad y uso único. El acceso local usa códigos aleatorios de prueba con vencimiento y límite de intentos.
La API recibe archivos por fragmentos reanudables, los cifra en el servidor y solo confirma el registro tras verificar todos sus hashes.
Android: primera beta nativa 0.1.0 con cámara propia, GPS, bóveda cifrada, recuperación y cliente de envío reanudable. Consulta [docs/ANDROID.md](docs/ANDROID.md).
Pendientes: validación en teléfonos físicos, proveedores de correo/SMS, alojamiento HTTPS de la API móvil, cartografía real en el panel, QR y gestión global completa de cuentas.
El panel conectado aún no captura archivos: muestra evidencias recibidas por la API. No es una APK ni un servicio de producción.

## Revisar las pantallas
Vista privada de prueba para Chrome en Android: https://controlpublicidad-pruebas.fidelrama.chatgpt.site.
Inicia sesión con la misma cuenta de ChatGPT propietaria del proyecto y usa después el código demo `123456`.
Consulta [docs/ANDROID.md](docs/ANDROID.md). Este enlace sirve pantallas de demostración; no conecta a la API ni sincroniza datos entre dispositivos.

Abre `index.html` en un navegador. Es un archivo autónomo, sin recursos externos.
Continúa con el contacto de ejemplo y usa el código de demostración `123456`.
El selector superior permite explorar los cuatro roles y comparar dos equipos.
Todas las fotografías y videos son ejemplos; no se abre la cámara ni se consultan coordenadas del teléfono.
Los usuarios, campañas, traslados y borradores de la vista de prueba se conservan en el navegador. Al sellar, la vista privada publicada guarda automáticamente los metadatos ficticios en D1. Un fallo conserva el registro pendiente y permite reintentar con «Actualizar a la nube». Las marcas de baja también se respaldan en D1. El archivo autónomo sin servicio conectado mantiene la cola pendiente y ya no simula confirmaciones.
Los borradores y cambios ficticios se guardan en localStorage sin cifrado. No introducir datos personales ni evidencias reales.
Al abrir el archivo autónomo los permisos son reglas de interfaz de demostración. Al iniciar el servidor se validan también en cada solicitud de la API.
El esquema del mapa no representa cartografía real; sus puntos abren registros de ejemplo.
Para reiniciar la demo, elimina el almacenamiento local del archivo/página en el navegador.

## Desarrollo
Node.js 22.13 o superior. Python 3 solo para la vista estática opcional.
```sh
npm ci
npm run build
npm test
npm start
```
El servidor local escucha en http://127.0.0.1:4173/?server=1.
Usa `admin@example.invalid`, `mariana@example.invalid`, `diego@example.invalid` o `sofia@example.invalid`.
El código aleatorio aparece en la pantalla de desarrollo; no se envían SMS ni correos reales.
El panel conectado no tiene selector para suplantar usuarios: para probar otro rol cierra sesión y entra con su contacto.
Fuentes del panel: `src/domain.mjs`, `src/api.mjs`, `src/app.mjs`, `src/styles.css` y `src/shell.html`.
Servidor: `server/store.mjs`, `server/service.mjs`, `server/files.mjs`, `server/http.mjs` y `server/index.mjs`.
`node build.mjs` genera el archivo autónomo `index.html`; no necesita dependencias instaladas.
Las pruebas de dominio, servidor, cliente y pantallas conectadas usan datos ficticios, archivos temporales, HTTP real y JSDOM.
Verificación: 64 pruebas automatizadas del proyecto y 55 comprobaciones JVM del núcleo Android. Incluyen recuperación tras reinicio y corte de conexión, permisos de API, CSRF, invitaciones y sellado inmutable. Revisión visual en navegador pendiente.

## Conservación en esta versión
SQLite usa transacciones, WAL y sincronización completa. Los archivos recibidos se guardan por fragmentos con AES-256-GCM y escritura atómica.
Los manifiestos quedan sellados desde la primera solicitud. No hay rutas para editar ni eliminar registros.
El número de registro se asigna dentro de una transacción al confirmar todos los archivos; repetir la operación conserva el número.
La base de datos, medios y clave de desarrollo se guardan en `server/.data/`, excluida de Git.
Los metadatos del servidor no están cifrados en SQLite. Este almacenamiento no sustituye el cifrado de archivos y metadatos en el celular.
La clave local de desarrollo vive junto al almacén, con permisos restringidos. La provisión de claves externas queda para el alojamiento.
La aplicación móvil debe conservar su copia local después de cualquier error y hasta recibir confirmación íntegra. El cliente de subida no elimina sus archivos.
La validación de tipo revisa la firma básica del formato; los hashes verifican integridad, sin probar por sí solos autenticidad de la captura.
El arranque fuera del modo local está deshabilitado hasta configurar entrega real de códigos y alojamiento HTTPS.

## Protocolo de la app móvil
Consulta [docs/API.md](docs/API.md). La app Android implementa el cliente de recepción por fragmentos, cámara y bóveda offline. La API todavía funciona solo en modo de desarrollo local; falta publicarla con entrega real de códigos y HTTPS.

## Jerarquía y alcance
- Administrador: único rol que crea campañas y asigna exactamente un líder por campaña; gestiona todos los usuarios y consulta todas las campañas.
- Líder: crea, modifica y desactiva coordinadores de sus campañas; consulta estadísticas y evidencias de toda su propia rama.
- Coordinador: crea, modifica y desactiva colaboradores asignados directamente a él; consulta su equipo.
- Colaborador: captura evidencias, consulta el estado de sus envíos y sincroniza; no administra usuarios.
- Un líder no modifica coordinadores de otro líder. Un coordinador no modifica colaboradores de otro coordinador.
- El líder supervisa la rama, pero no administra directamente los colaboradores del coordinador.
- Los permisos se validan en servidor para cada operación, no solamente ocultando botones.
- Las bajas son desactivaciones: conservan autoría e historial. Los traslados requieren una operación administrativa auditada.

## Módulo de administración de usuarios (primera versión)
Disponible en el panel web y con interfaz adaptable a celular.
Cada rol ve únicamente los usuarios autorizados por su alcance.

| Rol | Usuarios que puede administrar | Equipo que puede consultar |
| --- | --- | --- |
| Administrador | Todos; asigna el líder de cada campaña | Todos |
| Líder | Sus coordinadores de campaña | Sus coordinadores y colaboradores descendientes |
| Coordinador | Sus colaboradores directos de campaña | Sus colaboradores directos |
| Colaborador | Ninguno | Sin acceso al módulo de usuarios |

Funciones:
- Árbol de personas como vista principal: campañas, líder, coordinadores y colaboradores con ramas plegables. Los filtros mantienen visibles los superiores para conservar la jerarquía.
- Tabla completa oculta inicialmente, desplegable debajo del árbol; búsqueda por nombre, correo o celular y filtros por campaña, rol y estado.
- Ficha emergente con registros propios y totales de registros, fotos, videos y personas activas de su rama en esa campaña.
- Alta manual con nombre, correo/celular y asignación activa; el servidor fija el rol y superior para líderes/coordinadores. El acceso posterior requiere verificar el contacto.
- Ficha sin botón Modificar: tocar o mantener presionado el nombre abre la edición; tocar Activo/Inactivo alterna el estado. El coordinador puede editar sus colaboradores directos, sin elevar roles ni alterar otras ramas.
- Opción Cambiar con flecha junto al estado: el administrador traslada colaboradores a un coordinador o coordinadores con su equipo a un líder de otra campaña. Se elige campaña y superior según el rol. Las asignaciones anteriores pasan a historial y conservan las evidencias; las nuevas reciben futuras capturas. Las invitaciones pendientes y pertenencias duplicadas de destino bloquean el traslado completo.
- Líderes dados de alta sin campaña pueden modificarse y desactivarse; no se puede desactivar el líder asignado a una campaña.
- Alta mediante invitación QR, correo o WhatsApp, con campaña, rol y superior fijados por servidor.
- Estado de invitación pendiente, aceptada, vencida o revocada; compartir nuevamente, renovar o cancelar.
- Ficha con nombre, correo/celular verificados, pertenencias por campaña, superior y estado.
- Edición de datos de perfil autorizados; cambiar correo/celular de acceso requiere verificar el nuevo contacto.
- Activar o desactivar la pertenencia a una campaña conservando evidencias e historial.
- Baja global de una cuenta solo por administrador; un líder/coordinador no desactiva una cuenta en otras campañas.
- Vista jerárquica de equipos y acceso a estadísticas según alcance.
- Auditoría de altas, cambios, invitaciones y bajas con autor, fecha y campaña.
- Asignación o cambio de líder y traslado de usuarios entre ramas solo por administrador.
- El superior no puede elevar roles, asignarse privilegios ni editar usuarios de otra rama.
- No permitir la baja del último administrador activo.
- Desactivar un coordinador con colaboradores activos exige resolver antes su equipo: traslado administrativo o desactivación explícita de sus pertenencias.
- La baja de usuarios no borra archivos del celular. Los registros pendientes de un usuario desactivado deben conservarse y tener un proceso de recuperación administrativa auditada.

Criterios de aceptación:
- La restricción por rama se aplica a listado, búsqueda, ficha, modificación e invitaciones en servidor.
- Alterar el identificador de usuario o campaña en una solicitud no concede acceso a otro equipo.
- Un líder puede consultar colaboradores descendientes, pero solo su coordinador o el administrador pueden administrarlos.
- Una baja en una campaña no afecta pertenencias activas en otras campañas.
- La desactivación bloquea nuevas operaciones autorizadas en servidor sin borrar evidencias existentes.

## Campañas
Nombre, líder, ubicación (descripción y coordenadas/área), tipos habilitados: lonas, espectaculares, bardas.
Un tipo implica campaña simple; dos o tres implican mixta.
Cada registro tiene exactamente un tipo permitido por la campaña.
La selección de ubicación no limita automáticamente dónde se puede capturar.
La pantalla de captura lista solo campañas activas asignadas y sus tipos habilitados. Un borrador vacío se ajusta a la asignación actual después de un traslado, conservando las notas; un borrador con evidencias no se reasigna ni se borra automáticamente.

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
La plataforma móvil inicial será Android. Los proveedores de autenticación/nube quedan por confirmar.
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

## Pruebas
`npm test`: prototipo y panel conectado, permisos en servidor, persistencia, verificación de acceso, invitaciones de un solo uso, envíos reanudables, cifrado de fragmentos, integridad y bloqueo de cambios.

## Panel y nube de prueba (0.5)
El logo y la ruta superior enlazan al inicio y a la página actual. Resumen y Mis envíos comparten una gráfica diaria con escala numérica, conteo independiente de fotografías/videos y consulta por cursor, teclado o toque. Evidencias inicia con todos los tipos permitidos seleccionados; desmarcarlos todos muestra cero registros.

Los avatares distinguen líder (azul), coordinador (verde) y colaborador (amarillo). La diagonal roja identifica inactividad. Eliminar requiere confirmación y deja la asignación en `deleted`, sin borrar evidencias ni su autor. El histórico tiene un filtro «Dados de baja». Un superior con personas actuales debe resolverlas primero; la campaña conserva su líder. La autorización por rama se valida también en la API local.

`cloud/worker.mjs` implementa la persistencia de metadatos ficticios y marcas de baja en D1 para la vista privada de Sites. La identidad de ChatGPT proporcionada por Sites separa el almacenamiento del propietario. Los roles seleccionables continúan siendo personajes de demostración, sin autenticación de cuentas reales. La nube devuelve una confirmación por UUID; reintentar conserva contenido y numeración, y rechaza modificaciones del mismo registro. El panel recupera copias confirmadas sin borrar datos locales ni sustituir asignaciones existentes. Referencias históricas faltantes se recuperan sin habilitar captura.

`cloud/db/schema.ts` y `cloud/drizzle/` contienen el esquema y las migraciones generadas. En el checkout de Sites se copian a `db/schema.ts` y `drizzle/`; el despliegue aplica las migraciones antes de publicar el Worker. No se crean tablas desde las solicitudes. `cloud/build.mjs` empaqueta el panel en un Worker ESM; se ejecuta después de `build.mjs` en el checkout de Sites.

Esta persistencia NO recibe fotos o videos reales: las vistas de captura siguen usando ilustraciones y metadatos de ejemplo. Los borradores y la cola local del prototipo no están cifrados. La cámara/GPS reales, bóveda offline cifrada y entrega de OTP en Android continúan pendientes. No usar esta prueba para la única captura de un trabajo real.

## Captura por rol y navegación de evidencias (0.6)
Líderes y coordinadores disponen de Nuevo registro y Mis envíos en sus propias campañas, con las mismas restricciones de tipo, 10 fotografías, 3 videos y sellado que los colaboradores. El autor se fija a partir del usuario y su propia pertenencia activa; no se permite crear ni subir registros de un subordinado. Mis envíos muestra únicamente evidencias propias, mientras Resumen conserva las estadísticas de la rama autorizada. Las reglas se aplican en dominio, nube de prueba y API local.

Al seleccionar una barra diaria se abren Evidencias con la fecha de México y el tipo de archivo de esa barra. Las barras de Mis envíos conservan el filtro de autor propio. El selector «Fotos y videos / Fotografías / Videos» hace visible ese filtro. Limpiar vacía fechas, campaña y filtro de archivo, desmarca lona/espectacular/barda y muestra cero registros hasta seleccionar tipos de nuevo. La entrada inicial continúa con todos los tipos marcados.

El campo GPS del detalle de una foto o video, desde Evidencias o Mapa, abre Google Maps en otra pestaña mediante una URL universal. Se usa el GPS del archivo seleccionado cuando existe; coordenadas ausentes o fuera de rango no generan enlace. El formato sigue la documentación de Google: https://developers.google.com/maps/documentation/urls/get-started.
