# Revisar ControlPublicidad desde Android

Vista privada: https://controlpublicidad-pruebas.fidelrama.chatgpt.site

1. Abrir el enlace en Chrome desde el celular Android.
2. Si se solicita acceso al sitio, entrar con la misma cuenta de ChatGPT propietaria del proyecto.
3. En la pantalla de ControlPublicidad, continuar con el contacto de ejemplo y usar el código `123456`.
4. En el selector superior elegir Administrador, Líder, Coordinador o Colaborador para comparar los permisos.
5. Abrir Usuarios y equipos: tocar las flechas para desplegar ramas y el nombre de una persona para consultar su ficha.
6. La tabla completa aparece al desplegar la opción situada debajo del árbol.
7. Alta manual permite crear usuarios ficticios. En su ficha, tocar o mantener presionado el nombre permite editarlo, y tocar Activo/Inactivo cambia el estado. El coordinador también puede editar a sus colaboradores directos. Cambiar, con flecha junto al estado, permite al administrador seleccionar otra campaña y el superior correspondiente: coordinador para colaboradores o líder para coordinadores. Al mover un coordinador también se mueve su equipo.

La captura solo muestra los tipos habilitados de la campaña seleccionada; por ejemplo, una campaña configurada únicamente como lona no ofrece barda ni espectacular. Los borradores vacíos se ajustan a la campaña actual sin perder notas.

Los diez usuarios de prueba originales siguen disponibles. La vista es adaptable a celular y computadora.

Usuarios, campañas y borradores de prueba se conservan en el navegador. Los metadatos de registros sellados y marcas de baja se respaldan en la nube privada; un fallo conserva la cola pendiente para «Actualizar a la nube». Las referencias históricas recuperadas no habilitan capturas nuevas. Esta copia no se conecta a la API local ni recibe fotos/videos reales.

El código `123456` sirve solo para recorrer la interfaz. No representa autenticación real ni concede acceso a usuarios reales. Utiliza datos ficticios.

La publicación web continúa siendo una demostración. La cámara, GPS real y almacenamiento cifrado están implementados por separado en la beta nativa Android descrita abajo. El servidor con gestión persistente de usuarios y permisos se ejecuta por separado con `npm start`, según README.md.

Validación realizada con pruebas automatizadas de pantallas, HTTP y base de datos. No se ha probado aún en un dispositivo Android físico ni se ha completado revisión visual en un navegador real.

## Beta nativa Android 0.1.0

Paquete `com.controlpublicidad.app`, versión `0.1.0-beta`, código de versión `1`. Android 8.0/API 26 o superior; destino API 36. Es una aplicación nativa Java independiente de la publicación web, sin WebView ni permisos de galería, IMEI o almacenamiento compartido.

### Lo que permite probar

- Cámara propia Camera2: JPEG y video MP4/H.264 con sonido. Captura propia de líderes, coordinadores y colaboradores.
- Un registro: máximo 10 fotos y 3 videos; en esta beta cada video dura hasta 60 segundos. JPEG hasta 12 MiB y video hasta 50 MiB, según el receptor.
- Tipos limitados a la campaña, con elección única. Los diez usuarios originales están en Cuenta → Elegir usuario de prueba. La asignación local de Sofía es «Casa Cantera · prueba Android», solo lona; es un fixture independiente de los cambios del navegador.
- GPS por toma: coordenadas, precisión y fecha de lectura. Se prefiere ubicación precisa con antigüedad máxima de 30 segundos y precisión hasta 50 m. La captura sin una lectura válida requiere aceptación explícita y muestra GPS no disponible; nunca inventa coordenadas. No es GPS de fondo.
- Nombre del autor, fecha/hora de captura o inicio del video, fabricante/marca/modelo y UUID de instalación. El teléfono no expone IMEI; se usa el identificador de instalación.
- Notas y borrador recuperable. Sellar congela el manifiesto y su hash; sin confirmación del servidor permanece pendiente.
- Mis envíos: gráfica de fotos/videos por día con referencias del eje izquierdo, selección de barra y lista filtrada. Revisión local de fotos/videos y apertura de sus coordenadas en Google Maps.
- Botón de actualización real: sesión por código de correo/celular, cookie y CSRF contra una API HTTPS compatible; manifiesto idéntico, fragmentos faltantes, hashes y confirmación final. No simula envíos.

### Conservación y límites de esta beta

Archivos y JSON se cifran con AES-256-GCM y una clave no exportable de Android Keystore. Se utiliza almacenamiento privado sin copia automática/transferencia de Android. Cada escritura tiene nonce nuevo, AAD ligado al nombre, sincronización del descriptor, sustitución atómica y sincronización del directorio. Un diario por captura permite repetir la confirmación local sin duplicar archivos. El sello y la recepción tienen diarios separados, que permanecen válidos aunque falte el índice del registro.

Las fotos se cifran desde los bytes del lector de la cámara, sin archivo de galería. MediaRecorder necesita un archivo temporal privado durante el video; al detenerlo se cifra y solo entonces se retira ese temporal. Si la grabación se interrumpe, se intenta recuperar al volver a la app. Una grabación sin encabezado final reproducible se conserva cifrada aparte y se identifica como interrumpida, sin incluirla como evidencia confirmada; no se inventa recuperación de un video que Android no terminó.

Las vistas previas se descifran únicamente en memoria. Las copias locales de los registros y originales se conservan después del envío. Los registros sellados no tienen botones ni métodos de edición/eliminación.

El modo local es exclusivamente de pruebas: no autentica personas, sus perfiles son seleccionables y sus registros no se trasladan a cuentas reales. La conexión al servidor crea un espacio separado por origen y usuario. No se mezclan datos con localStorage del navegador ni se borran los usuarios web.

La API de archivos aún no tiene alojamiento remoto ni proveedores de correo/SMS configurados. El sitio privado de pantallas no recibe fotos ni videos reales. Para habilitar envíos deben publicarse `server/` con HTTPS, entrega de códigos, almacenamiento y claves de servidor adecuados. No se incluye en el APK ninguna credencial de Sites ni bypass del acceso del propietario.

Las asignaciones remotas se guardan para uso sin internet; «Actualizar asignaciones» obtiene la última autorización. El servidor sigue siendo la autoridad: rechaza registros de asignaciones inactivas/trasladadas o tipos revocados; conserva pendientes en el teléfono. La resolución de borradores tras traslados administrativos queda por implementar. El número y nombre definitivo `Campaña - registro - consecutivo.ext` se asignan al confirmar; antes se utiliza un identificador temporal.

No se debe desinstalar ni borrar datos con registros pendientes: también se perdería la clave de esa instalación. Antes de usarla para evidencia irrepetible, deben completarse las pruebas físicas siguientes.

### Compilar y verificar

Requisitos: Python 3, Java 21 o superior y acceso a los archivos oficiales del SDK. Sin Gradle/AndroidX; utiliza aapt2, ECJ, D8, zipalign y apksigner oficiales. Los scripts verifican los checksums publicados de los archivos descargados.

```sh
python3 scripts/setup-android-tools.py
python3 scripts/test-android.py
python3 scripts/build-android.py
```

`CP_ANDROID_TOOLS`: herramientas (por defecto `/tmp/controlpublicidad-android-tools`).
`CP_ANDROID_OUTPUT`: carpeta de APK (por defecto un directorio hermano `controlpublicidad-deliverables`).
`CP_ANDROID_SIGNING_DIR`: firma privada (por defecto un directorio hermano `controlpublicidad-private`). Contiene una clave propia de ControlPublicidad y su contraseña; conservar fuera de Git para firmar actualizaciones con la misma identidad. Nunca reemplazar la firma al actualizar una instalación con pendientes.

La firma se verifica mediante APK Signature Scheme v2/v3; alineación por zipalign. `python3 scripts/test-android.py` ejecuta comprobaciones de cifrado/autenticación, nonce, AAD, escrituras interrumpidas, recuperación, aislamiento de perfiles, tipos/jerarquía, límites, manifiesto inmutable, recibos duraderos y reanudación tras corte de red. Son pruebas JVM: no equivalen a probar el hardware o Android Keystore en un teléfono.

### Prueba en el teléfono

1. Descargar e instalar `ControlPublicidad_Android_0.1.0_beta.apk`. Si Android lo solicita, permitir la instalación desde el navegador o gestor de archivos usado.
2. Abrir la app. El perfil inicial es Sofía; elegir Casa Cantera e iniciar un registro. Solo se debe ofrecer Lona.
3. Conceder Cámara y Ubicación precisa; para video, también Micrófono. Activar la ubicación del teléfono y esperar una lectura al aire libre.
4. Tomar fotos y video, revisar su reproducción y tocar GPS para abrir el mapa.
5. Activar modo avión, capturar otra evidencia, agregar notas y volver a abrir la app. Comprobar que el borrador conserva todo.
6. Sellar. El registro debe quedar pendiente y sin edición; en modo local no hay envío real. Reiniciar el teléfono y revisar nuevamente.
7. Probar cierre durante una captura y durante un video: comprobar recuperación o aviso de archivo interrumpido conservado. Una interrupción antes de que el sensor/recorder entregue bytes completos no garantiza una evidencia reproducible.
8. Cambiar a Diego o Mariana y confirmar sus campañas/captura y que Mis envíos muestra únicamente su perfil. Volver a Sofía y comprobar conservación.
9. Cuando esté alojada la API, verificar acceso por correo/SMS, asignaciones, envío en red móvil, pérdida de conexión a mitad de carga, reintento y número único confirmado. Comprobar que el original permanece en el teléfono.

Compilación y firma verificadas; 64 pruebas del proyecto y 55 comprobaciones del núcleo Android aprobadas. Validación en teléfonos Android físicos pendiente; debe incluir Android 14/16, cámara/GPS de cada fabricante, permisos denegados, almacenamiento lleno, batería/cierre y conectividad intermitente.
