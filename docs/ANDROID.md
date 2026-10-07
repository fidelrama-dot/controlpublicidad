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

Los cambios de este sitio de prueba se guardan en el navegador de cada dispositivo; no se comparten con el servidor local ni con otros celulares. Si cambias de navegador, borras sus datos o reinstalas, puedes perder los cambios de demostración.

El código `123456` sirve solo para recorrer la interfaz. No representa autenticación real ni concede acceso a usuarios reales. Utiliza datos ficticios.

La cámara, GPS real y almacenamiento cifrado offline todavía requieren la app Android. Esta publicación no es una APK. El servidor con gestión persistente de usuarios y permisos se ejecuta por separado con `npm start`, según README.md.

Validación realizada con pruebas automatizadas de pantallas, HTTP y base de datos. No se ha probado aún en un dispositivo Android físico ni se ha completado revisión visual en un navegador real.
