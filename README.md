# Querida IA — Publicador automático de Instagram

Sistema que publica automáticamente carruseles en Instagram 4 días a la semana
(lunes, martes, jueves y viernes a las 08:00 UTC), usando la API oficial de
Meta (Instagram Graph API). Corre en GitHub Actions, no depende de que ningún
computador esté encendido.

## Cómo funciona

1. Tú (o yo, exportando desde Canva) agregas imágenes a `images/` y un archivo
   `.json` a `queue/pending/` con el pie de foto y la lista de imágenes del
   carrusel.
2. Cuatro veces por semana, un workflow de GitHub Actions toma el archivo más
   antiguo de `queue/pending/`, publica ese carrusel en Instagram y mueve el
   registro a `queue/published/`.
3. Si `queue/pending/` está vacío, esa ejecución simplemente no hace nada (no
   falla).

El repositorio debe ser **público** para que Instagram pueda descargar las
imágenes desde `raw.githubusercontent.com` (la Graph API exige una URL
pública, no acepta subir el archivo directamente). Esto significa que una
publicación en cola es técnicamente visible en el repo un poco antes de
publicarse — si eso te incomoda, dímelo y cambiamos a un servicio de imágenes
externo (por ejemplo Cloudinary) en vez del propio repo.

## Formato de cada archivo de cola

`queue/pending/0001-ejemplo.json`:

```json
{
  "caption": "Texto del pie de foto...\n\n#hashtag1 #hashtag2",
  "images": [
    "images/post-002-slide-1.jpg",
    "images/post-002-slide-2.jpg"
  ]
}
```

- Nombra los archivos con un prefijo numérico (`0001-`, `0002-`...) para
  controlar el orden de publicación.
- Un carrusel admite entre 1 y 10 imágenes.
- Hay un ejemplo listo en `queue/pending/EXAMPLE.json.sample` (cámbiale la
  extensión a `.json` para probarlo).

## Lo que necesitas hacer tú (una sola vez)

Yo no puedo crear la app de Meta ni autorizarla — ese paso de inicio de sesión
y consentimiento solo lo puedes hacer tú, desde tu propia cuenta.

### 1. Confirmar que tu Instagram es una cuenta profesional

Ya me confirmaste que "Querida IA" está vinculada a una página de Facebook.
Anota el nombre exacto de esa página, la necesitarás en el paso 3.

### 2. Crear una app en Meta for Developers

1. Entra a https://developers.facebook.com/apps y crea una app de tipo
   **"Business"**.
2. Dentro de la app, añade el producto **"Instagram"** (Instagram API con
   Instagram Login, o Instagram Graph API según lo que te ofrezca el panel).
3. En *Configuración básica*, anota el **App ID** y el **App Secret** (no me
   los compartas a mí, son solo para ti).

### 3. Crear un usuario del sistema (System User) con token que no caduca

Esto evita tener que renovar el token cada 60 días:

1. Ve a https://business.facebook.com/settings → **Usuarios del sistema**.
2. Crea un usuario del sistema nuevo, rol **Administrador**.
3. Asígnale acceso a tu página de Facebook y a tu app.
4. Genera un **token de acceso** para ese usuario del sistema, con los
   permisos: `instagram_basic`, `instagram_content_publish`,
   `pages_show_list`, `pages_read_engagement`.
5. Copia ese token — es el único que verás, guárdalo en un lugar seguro
   (gestor de contraseñas). Será tu `IG_ACCESS_TOKEN`.

   Si prefieres el camino simple sin usuario del sistema, puedes generar un
   token de usuario normal desde el **Explorador de la API Graph**
   (https://developers.facebook.com/tools/explorer) y luego convertirlo a uno
   de larga duración (60 días) — pero tendrás que repetir esto cada dos meses.

### 4. Obtener el ID de tu cuenta de Instagram profesional

En el Explorador de la API Graph (con tu token), ejecuta:

```
GET /me/accounts
```

para obtener el **Page ID** de tu página de Facebook, y luego:

```
GET /{page-id}?fields=instagram_business_account
```

para obtener el **Instagram Business Account ID**. Ese número es tu
`IG_BUSINESS_ACCOUNT_ID`.

## Configurar el repositorio en GitHub

1. Crea un repositorio nuevo **público** en GitHub (por ejemplo
   `querida-ia-publisher`).
2. Súbelo desde esta carpeta (te paso los comandos abajo).
3. En GitHub, ve a **Settings → Secrets and variables → Actions** y crea estos
   *secrets*:
   - `IG_BUSINESS_ACCOUNT_ID`
   - `IG_ACCESS_TOKEN`
   - `FB_PAGE_ID` (opcional — solo si quieres que también publique en la
     página de Facebook; es el mismo Page ID que sacaste con `GET
     /me/accounts`, no es secreto pero se guarda igual por prolijidad)
4. El workflow en `.github/workflows/publish.yml` ya queda activo solo: se
   ejecuta automáticamente lunes, martes, jueves y viernes a las 08:00 UTC.
   También puedes lanzarlo manualmente desde la pestaña **Actions → Publicar
   en Instagram → Run workflow**, útil para probar.

## Agregar contenido cada semana

Cuando terminemos un carrusel en Canva, yo:

1. Exporto las imágenes finales.
2. Las guardo en `images/`.
3. Creo el archivo `.json` correspondiente en `queue/pending/` con el pie de
   foto que ya redactamos.
4. Hago commit y push.

La próxima ejecución programada lo publicará automáticamente.
