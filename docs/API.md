# API local de ControlPublicidad

Versión de desarrollo: el servidor se inicia con `npm start` y escucha solo en la computadora local.
Todavía no existe alojamiento en nube ni envío real de códigos por correo/SMS.

## Acceso

1. `POST /api/auth/request` con `{"contact":"admin@example.invalid"}`.
2. En desarrollo, la respuesta devuelve `developmentCode`. El código caduca a los 5 minutos, admite 5 intentos y solo se puede usar una vez.
3. `POST /api/auth/verify` con contacto y código de seis dígitos.
4. La respuesta fija cookie HttpOnly SameSite=Strict y devuelve el token CSRF. Las operaciones que modifican datos requieren `X-CSRF-Token`.
5. `GET /api/session` recupera sesión y CSRF; `POST /api/auth/logout` invalida la sesión.

El servidor valida el Host y el origen de las solicitudes. No habilita CORS.
Las sesiones duran 8 horas. No hay contraseñas ni tokens de sesión en localStorage.
Los códigos nunca se exponen fuera del modo de desarrollo; el arranque de producción sigue deshabilitado hasta configurar su entrega.

## Panel

| Operación | Ruta | Alcance |
| --- | --- | --- |
| Datos del panel | GET /api/bootstrap | Campañas, usuarios y registros autorizados |
| Alta manual de usuario | POST /api/users | Administrador o superior directo; rol/parent fijados en servidor |
| Editar líder sin campaña | PATCH /api/users/:id | Administrador; nombre y estado, sin invitación pendiente |
| Mover colaborador | POST /api/memberships/:id/transfer | Solo administrador; coordinador activo de destino |
| Crear campaña | POST /api/campaigns | Administrador |
| Editar nombre por campaña/estado | PATCH /api/memberships/:id | Superior directo o administrador |
| Crear invitación | POST /api/invitations | Rol inferior y rama propios |
| Aceptar invitación | POST /api/invitations/accept | Contacto verificado de la invitación |
| Renovar enlace | POST /api/invitations/:id/renew | Superior autorizado; invalida el enlace anterior |
| Cancelar invitación | DELETE /api/invitations/:id | Superior autorizado |

Una campaña requiere `name`, `location`, `leaderId` y `types`, con tipos `lona`, `espectacular` o `barda`.
Solo existe un líder por campaña; un líder recién invitado debe aceptar antes de ser asignado.
Las invitaciones requieren nombre y contacto. Para coordinadores/colaboradores: campaña y superior. Para líderes sin campaña: administrador y rol `leader`.
Para un líder/coordinador, el servidor fija el rol inferior y su propia pertenencia como superior, aunque el cliente intente cambiar esos valores.
Las invitaciones caducan a los 7 días. Sus tokens se guardan como hash; el enlace completo solo se devuelve al crear o renovar.
El enlace del servidor local aún no es accesible desde teléfonos de otras personas.

## Altas manuales, bajas y traslados

`POST /api/users`: `name`, `contact`, `role`, `campaignId`, `parentId`. El administrador puede crear un líder sin campaña; líderes y coordinadores solo crean su rol inferior en su propia rama. Contactos duplicados se rechazan; se normalizan correos y celulares E.164. El alta queda activa y auditada, sin invitación ni verificación ficticia de identidad: el usuario verifica su contacto al iniciar sesión.

`PATCH /api/memberships/:id`: nombre visible y estado activo/inactivo. La baja es por campaña, no borra evidencias. No se desactiva el líder de campaña ni un superior con personas activas. Las asignaciones históricas trasladadas no se reactivan ni editan.

`POST /api/memberships/:id/transfer` con `{"parentId":"ID del coordinador de destino"}`. Solo el administrador traslada colaboradores activos/inactivos. El destino debe ser un coordinador activo bajo un líder activo; se rechazan el mismo equipo y pertenencias duplicadas de destino.

La operación es atómica y crea otra pertenencia, conservando el estado activo/inactivo. La anterior pasa a `transferred`, sin cambiar campaña, superior ni registros originales. La rama de origen mantiene acceso a sus evidencias históricas; el destino recibe únicamente nuevas capturas. El autor puede terminar una subida ya sellada antes del traslado. Nuevos manifiestos no se aceptan en una asignación trasladada. Los borradores aún exclusivos del teléfono deben finalizarse y enviarse antes de mover a la persona; su recuperación offline requiere la futura app Android.

SQLite migra automáticamente la restricción original para permitir pertenencias históricas y una única pertenencia actual por campaña/usuario, manteniendo las claves foráneas.

## Envío de evidencias

El cliente genera un UUID de registro antes de capturar y un UUID por archivo. Después del sellado no cambia el manifiesto.

```json
{
  "id": "UUID del registro",
  "membershipId": "pertenencia del colaborador",
  "type": "lona",
  "notes": "Observaciones",
  "device": {
    "installationId": "UUID de instalación",
    "name": "Nombre cuando esté disponible",
    "brand": "Marca",
    "model": "Modelo"
  },
  "media": [
    {
      "id": "UUID del archivo",
      "kind": "photo",
      "mime": "image/jpeg",
      "bytes": 120000,
      "sha256": "hash SHA-256 hexadecimal de 64 caracteres",
      "capturedAt": "2026-10-07T06:00:00-06:00",
      "gps": {
        "lat": 19.705,
        "lng": -101.198,
        "accuracy": 6,
        "capturedAt": "2026-10-07T05:59:59-06:00"
      }
    }
  ]
}
```

El ejemplo describe los campos; sustituir los marcadores UUID/hash por valores válidos.
GPS puede ser `null`; no se inventan coordenadas. Las fechas incluyen zona, se normalizan a UTC y se conserva el desfase original de cada captura.
El autor se obtiene de la sesión y la pertenencia; no se confía en un nombre de colaborador enviado por el cliente.
Se conservan como historial el nombre de campaña y el nombre del autor al sellar.
Cada registro requiere al menos una evidencia y permite máximo 10 fotos y 3 videos. Tipos: JPEG/PNG, MP4/WebM.
Límites iniciales del receptor: 12 MiB por foto y 50 MiB por video. La futura app deberá comprobarlos antes de grabar/enviar.

1. `POST /api/records` crea el manifiesto sellado. Repetir con el mismo UUID y contenido devuelve el estado; cambiar contenido responde 409.
2. `GET /api/records/:id` devuelve número, estado y fragmentos ya recibidos por archivo.
3. `PUT /api/records/:id/media/:mediaId/chunks/:index` recibe bytes, con Content-Type application/octet-stream. El tamaño de fragmento es 256 KiB; el último contiene el resto.
4. Repetir el mismo fragmento con el mismo hash no duplica datos. Otro contenido en la misma posición responde 409.
5. `POST /api/records/:id/finalize` verifica presencia, tamaños, hashes y firma básica del formato. Solo entonces asigna el número y devuelve `synced`.
6. `GET /api/records/:id/media/:mediaId` entrega el archivo autorizado con nombre `Nombre de campaña - número - consecutivo.ext`.

Se confirma el registro completo, sin editar originales. Los supervisores solo consultan sus ramas.
Ante corte de red se recupera el estado y se envían únicamente fragmentos faltantes. `ApiClient.uploadRecord` implementa este flujo.
El cliente no borra las copias locales. Un hash y la firma del formato no acreditan por sí solos que una foto sea auténtica.
La recepción verifica el contenido una vez descifrado; archivos y fragmentos alterados no se confirman.

## Errores

401: acceso o código inválido. 403/404: recurso fuera de alcance. 409: conflicto, contenido alterado o registro incompleto. 413: cuerpo demasiado grande. 429: demasiados intentos.
Los errores de almacenamiento conservan el registro pendiente; la app debe conservar también su copia cifrada.
La recuperación administrativa de pendientes tras desactivar un usuario y los traslados entre ramas siguen pendientes.
