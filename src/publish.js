// Publica el siguiente carrusel en cola a Instagram usando la Graph API oficial.
// Requiere las variables de entorno:
//   IG_BUSINESS_ACCOUNT_ID  -> ID de la cuenta de Instagram profesional
//   IG_ACCESS_TOKEN         -> Token de acceso de larga duracion (o de system user)
// Y, para construir las URLs publicas de las imagenes:
//   GITHUB_REPOSITORY       -> "owner/repo" (GitHub Actions lo define solo)
//   GITHUB_REF_NAME         -> rama desde la que se sirven las imagenes (ej. "main")

import { readdir, readFile, unlink, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const GRAPH_VERSION = "v21.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

const PENDING_DIR = path.resolve("queue/pending");
const PUBLISHED_DIR = path.resolve("queue/published");

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Falta la variable de entorno ${name}`);
  }
  return value;
}

function publicImageUrl(relativePath) {
  const repo = requireEnv("GITHUB_REPOSITORY");
  const branch = process.env.GITHUB_REF_NAME || "main";
  const cleanPath = relativePath.replace(/^\.?\//, "");
  return `https://raw.githubusercontent.com/${repo}/${branch}/${cleanPath}`;
}

async function nextQueuedPost() {
  const entries = await readdir(PENDING_DIR);
  const jsonFiles = entries.filter((f) => f.endsWith(".json")).sort();
  if (jsonFiles.length === 0) return null;
  const file = jsonFiles[0];
  const raw = await readFile(path.join(PENDING_DIR, file), "utf-8");
  const post = JSON.parse(raw);
  return { file, post };
}

async function graphPost(endpoint, params) {
  const url = new URL(`${GRAPH_BASE}/${endpoint}`);
  const body = new URLSearchParams(params);
  const res = await fetch(url, { method: "POST", body });
  const data = await res.json();
  if (!res.ok || data.error) {
    throw new Error(`Graph API error en ${endpoint}: ${JSON.stringify(data.error || data)}`);
  }
  return data;
}

async function waitUntilFinished(containerId, accessToken, { timeoutMs = 120000, intervalMs = 4000 } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const url = new URL(`${GRAPH_BASE}/${containerId}`);
    url.searchParams.set("fields", "status_code");
    url.searchParams.set("access_token", accessToken);
    const res = await fetch(url);
    const data = await res.json();
    if (data.status_code === "FINISHED") return;
    if (data.status_code === "ERROR") {
      throw new Error(`El contenedor ${containerId} fallo al procesarse: ${JSON.stringify(data)}`);
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`Tiempo de espera agotado procesando el contenedor ${containerId}`);
}

async function createCarouselItem(imageUrl, igUserId, accessToken) {
  const data = await graphPost(`${igUserId}/media`, {
    image_url: imageUrl,
    is_carousel_item: "true",
    access_token: accessToken,
  });
  return data.id;
}

async function createCarouselContainer(childrenIds, caption, igUserId, accessToken) {
  const data = await graphPost(`${igUserId}/media`, {
    media_type: "CAROUSEL",
    children: childrenIds.join(","),
    caption,
    access_token: accessToken,
  });
  return data.id;
}

async function publishContainer(containerId, igUserId, accessToken) {
  const data = await graphPost(`${igUserId}/media_publish`, {
    creation_id: containerId,
    access_token: accessToken,
  });
  return data.id;
}

async function main() {
  const igUserId = requireEnv("IG_BUSINESS_ACCOUNT_ID");
  const accessToken = requireEnv("IG_ACCESS_TOKEN");

  const next = await nextQueuedPost();
  if (!next) {
    console.log("No hay publicaciones pendientes en queue/pending. No se hace nada.");
    return;
  }

  const { file, post } = next;
  if (!post.caption || !Array.isArray(post.images) || post.images.length < 1) {
    throw new Error(`El archivo ${file} no tiene el formato esperado ({ caption, images[] })`);
  }
  if (post.images.length > 10) {
    throw new Error(`El carrusel de ${file} tiene mas de 10 imagenes; Instagram permite un maximo de 10.`);
  }

  console.log(`Publicando ${file} (${post.images.length} imagenes)...`);

  const childrenIds = [];
  for (const imagePath of post.images) {
    const imageUrl = publicImageUrl(imagePath);
    const containerId = await createCarouselItem(imageUrl, igUserId, accessToken);
    await waitUntilFinished(containerId, accessToken);
    childrenIds.push(containerId);
    console.log(`  Imagen lista: ${imagePath} -> contenedor ${containerId}`);
  }

  const carouselContainerId = await createCarouselContainer(childrenIds, post.caption, igUserId, accessToken);
  await waitUntilFinished(carouselContainerId, accessToken);

  const publishedId = await publishContainer(carouselContainerId, igUserId, accessToken);
  console.log(`Publicado con exito. Instagram media id: ${publishedId}`);

  await mkdir(PUBLISHED_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const publishedRecord = {
    ...post,
    published_at: new Date().toISOString(),
    instagram_media_id: publishedId,
  };
  await writeFile(
    path.join(PUBLISHED_DIR, `${stamp}-${file}`),
    JSON.stringify(publishedRecord, null, 2)
  );
  // Se borra de pending solo despues de guardar el registro publicado, para no perder el rastro si algo falla antes.
  await unlink(path.join(PENDING_DIR, file));
}

main().catch((err) => {
  console.error("Fallo la publicacion:", err.message);
  process.exit(1);
});
