# SEIS // RETRO 🎞️

**Diario fotográfico semanal para 6 amigos**, con estética minimalista inspirada en **Retro**, compatible al 100% con **GitHub Pages** y almacenamiento gratuito mediante **Discord Webhook**.

---

## ✨ Características Principales

1. **Acceso por Código PIN de 4 dígitos**:
   - Cada uno de los 6 amigos tiene su propio código de 4 dígitos (por defecto en la demo: `1111`, `2222`, `3333`, `4444`, `5555`, `6666`).
   - En el modo de prueba puedes entrar con 1 clic o cambiar de amigo desde la esquina superior derecha para ver cómo cambia el permiso de subida.

2. **La Ruleta del Lunes (`🎡 Ruleta del Lunes`)**:
   - Cada semana (empezando lunes) se gira la ruleta interactiva con los 6 amigos.
   - **Solo a quien le toca** se le desbloquea el carrete para subir **máximo 5 fotos durante el día** (`01/05` a `05/05`). Los demás entran en modo espectador y pueden reaccionar y comentar.

3. **4 Modos de Ver las Fotos**:
   - **▤ Retro (Carrete Semanal)**: Vista editorial dividida por semanas con los 5 espacios del turno.
   - **⊞ Mosaico**: Galería de alta densidad tipo revista.
   - **▣ Polaroid**: Hoja de contacto analógica con marcos de película `KODAK 400` y tipografía serif.
   - **▭ Cine**: Modo presentación a pantalla completa con tira de miniaturas y comentarios integrados.

4. **Filtros por Semana y por Autor**:
   - Explora cada semana por separado o haz clic en cualquiera de los 6 amigos para ver su perfil, cámara, biografía, turnos ganados y todas sus fotos.

5. **Almacenamiento Gratuito con Discord Webhook**:
   - Desde **Discord / Config** puedes pegar la URL del Webhook de un canal privado de tu servidor de Discord.
   - Al subir una foto, se comprime automáticamente en el navegador y se envía vía `multipart/form-data` (`?wait=true`) al canal de Discord, obteniendo la URL alojada en el CDN de Discord sin pagar servidores ni bases de datos.

---

## 🚀 Cómo publicarlo en GitHub Pages

1. Sube los archivos `index.html`, `styles.css`, `config.js` y `app.js` a un repositorio de GitHub.
2. Ve a **Settings → Pages** en tu repositorio y selecciona la rama `main` (carpeta `/root`).
3. ¡Listo! Tu web estará disponible en `https://tu-usuario.github.io/tu-repo/`.
