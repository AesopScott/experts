const FIRESTORE_PROJECT_ID = "experts-d7c3d";
const FIREBASE_API_KEY = "AIzaSyAMMMdI12N9scrGrV0CrbIE3Huk04g8vfw";
const DEFAULT_OG_IMAGE = "https://25experts.com/assets/og-25experts.png";

const SHARE_PATHS = new Set([
  "/share",
  "/watch",
  "/watch.html",
  "/videos",
  "/videos.html",
]);

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const videoId = normalizeVideoId(url.searchParams.get("v"));

    if (videoId && SHARE_PATHS.has(url.pathname)) {
      const assetPath = url.pathname.startsWith("/videos") ? "/videos.html" : "/watch.html";
      return renderVideoSharePage(request, env, url, assetPath, videoId);
    }

    return env.ASSETS.fetch(request);
  },
};

async function renderVideoSharePage(request, env, url, assetPath, videoId) {
  const assetUrl = new URL(request.url);
  assetUrl.pathname = assetPath;
  assetUrl.search = "";
  const assetResponse = await env.ASSETS.fetch(new Request(assetUrl, request));

  if (!assetResponse.ok) return assetResponse;

  const [html, video] = await Promise.all([
    assetResponse.text(),
    fetchVideo(videoId),
  ]);

  const shareVideo = video || {};

  const publicPath = url.pathname === "/share" ? "/share" : assetPath;
  const shareUrl = `${url.origin}${publicPath}?v=${encodeURIComponent(videoId)}`;
  const title = shareVideo.title || "Curated AI Video";
  const channel = shareVideo.channelName ? ` by ${shareVideo.channelName}` : "";
  const description = `Watch ${title}${channel}, curated by 25experts for follow-up learning.`;
  const thumbnail = shareVideo.thumbnail || `https://i.ytimg.com/vi/${encodeURIComponent(videoId)}/hqdefault.jpg`;

  const ogTags = [
    ["property", "og:type", "video.other"],
    ["property", "og:site_name", "25experts by Mojo AI Studio"],
    ["property", "og:title", title],
    ["property", "og:description", description],
    ["property", "og:url", shareUrl],
    ["property", "og:image", thumbnail],
    ["property", "og:image:secure_url", thumbnail],
    ["property", "og:image:type", "image/jpeg"],
    ["property", "og:image:width", "480"],
    ["property", "og:image:height", "360"],
    ["property", "og:image:alt", `${title}${channel}`],
    ["name", "twitter:card", "summary_large_image"],
    ["name", "twitter:title", title],
    ["name", "twitter:description", description],
    ["name", "twitter:image", thumbnail],
    ["name", "twitter:image:alt", `${title}${channel}`],
  ].map(metaTag).join("\n  ");

  const patched = html
    .replace(/<title>.*?<\/title>/is, `<title>${escapeHtml(title)} | 25experts</title>`)
    .replace(/<link rel="canonical" href="[^"]*">/i, `<link rel="canonical" href="${escapeAttr(shareUrl)}">`)
    .replace(/<meta name="description" content="[^"]*">/i, `<meta name="description" content="${escapeAttr(description)}">`)
    .replace(/<meta property="og:type"[\s\S]*?(?=\s*(?:<script type="application\/ld\+json"|<style>))/i, `${ogTags}\n  `);

  return new Response(patched, withHtmlHeaders(assetResponse.headers));
}

async function fetchVideo(videoId) {
  const docUrl = new URL(`https://firestore.googleapis.com/v1/projects/${FIRESTORE_PROJECT_ID}/databases/(default)/documents/curatedVideos/${encodeURIComponent(videoId)}`);
  docUrl.searchParams.set("key", FIREBASE_API_KEY);

  const response = await fetch(docUrl, {
    headers: { "Accept": "application/json" },
    cf: { cacheTtl: 900, cacheEverything: true },
  });
  if (!response.ok) return null;

  const doc = await response.json();
  const fields = doc.fields || {};
  return {
    title: readFirestoreString(fields.title),
    channelName: readFirestoreString(fields.channelName),
    thumbnail: readFirestoreString(fields.thumbnail),
  };
}

function readFirestoreString(field) {
  return field?.stringValue || "";
}

function normalizeVideoId(value) {
  const videoId = String(value || "").trim();
  return /^[a-zA-Z0-9_-]{6,20}$/.test(videoId) ? videoId : "";
}

function metaTag([kind, key, value]) {
  return `<meta ${kind}="${escapeAttr(key)}" content="${escapeAttr(value)}">`;
}

function withHtmlHeaders(headers) {
  const next = new Headers(headers);
  next.set("content-type", "text/html; charset=utf-8");
  next.set("cache-control", "public, max-age=300");
  return { status: 200, headers: next };
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/"/g, "&quot;");
}
