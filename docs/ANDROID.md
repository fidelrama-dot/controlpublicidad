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

La cámara, GPS real y almacenamiento cifrado offline todavía requieren la app Android. Esta publicación no es una APK. El servidor con gestión persistente de usuarios y permisos se ejecuta por separado con `npm start`, según README.md.

Validación realizada con pruebas automatizadas de pantallas, HTTP y base de datos. No se ha probado aún en un dispositivo Android físico ni se ha completado revisión visual en un navegador real.

## Qué falta para la primera APK de campo
No existe todavía un proyecto Android ni un archivo APK de ControlPublicidad. La vista navegable y la API local ya existen; el paso siguiente es crear el proyecto Android con estos módulos:

1. Acceso para los usuarios de prueba contra un servidor accesible por HTTPS desde el celular. Sustituir el selector ficticio y configurar entrega de códigos por correo o SMS.
2. Cámara y video desde la app, GPS preciso, permisos del teléfono, metadatos de dispositivo e identificador de instalación. Captura propia para líder, coordinador y colaborador.
3. Bóveda cifrada de archivos y metadatos en el teléfono; escritura duradera desde cada toma. Recuperar borradores y registros sellados al reiniciar o perder batería, con separación por usuario.
4. Cola de subida real que use fragmentos, hashes y confirmación íntegra de la API. Conservar originales ante cualquier fallo, cierre o falta de internet, y reintentar sin duplicar registros.
5. Compilación y firma de una APK de prueba. Validar en un Android físico la instalación, cámara, GPS, límites, funcionamiento sin internet, reinicio y recuperación de cargas interrumpidas antes de usarla en una captura irrepetible.

La API local implementa permisos por rama, sellado, fragmentos reanudables y verificación de archivos. Faltan su alojamiento remoto y acceso real; el almacenamiento D1 de la vista privada es exclusivamente una prueba de metadatos, no ese servicio de archivos.

En la versión 0.6, líder y coordinador tienen Nuevo registro y Mis envíos. Las barras abren Evidencias por fecha/tipo; Limpiar desmarca los tipos; tocar el GPS del archivo abre Google Maps. Estas mejoras continúan usando la captura de ejemplo en la publicación web.
