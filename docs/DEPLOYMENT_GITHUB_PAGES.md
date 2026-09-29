# Publicación gratuita en GitHub Pages

La aplicación se publica como PWA estática bajo la cuenta autorizada `MrJesusOjedaGarcia` en el repositorio público `RepartidorGruposPadel`. El workflow de GitHub Actions compila, ejecuta typecheck/pruebas y publica `dist` cada vez que se actualiza `main`.

## Configuración incluida

- `.github/workflows/deploy.yml`: build y despliegue automático con GitHub Pages.
- `vite.config.ts`: calcula el `base` para que assets, iconos, manifiesto y service worker funcionen en `/<repositorio>/`.
- En local el `base` sigue siendo `/`, por lo que `npm run dev` y `npm run build` mantienen el comportamiento habitual.

## Primera publicación

1. Crear un repositorio **público** llamado `RepartidorGruposPadel` en la cuenta `MrJesusOjedaGarcia`.
2. Subir la rama `main` de este proyecto.
3. En GitHub, abrir **Settings → Pages** y seleccionar **GitHub Actions** como fuente si todavía no está activado.
4. Esperar a que termine el workflow **Deploy PWA to GitHub Pages**.
5. Abrir `https://mrjesusojedagarcia.github.io/RepartidorGruposPadel/`.

Los despliegues posteriores son automáticos al subir cambios a `main`. Para instalarla, abrir el enlace en Safari o Chrome y usar **Añadir a pantalla de inicio / Instalar aplicación**.

## Acceso de GitHub

Autorizar el CLI con el inicio de sesión web de GitHub; no usar una contraseña en comandos. Antes de crear el repo o subir contenido, verificar que `gh api user --jq .login` devuelve exactamente `MrJesusOjedaGarcia`.
