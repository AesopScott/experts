const FIRESTORE_PROJECT_ID = "experts-d7c3d";
const FIREBASE_API_KEY = "AIzaSyAMMMdI12N9scrGrV0CrbIE3Huk04g8vfw";

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const videoId = getVideoId(url);

    if (!videoId) {
      return Response.redirect("https://25experts.com/videos", 302);
    }

    const video = await fetchVideo(videoId).catch(() => null);
    const title = video?.title || "Curated AI Video";
    const channel = video?.channelName ? ` by ${video.channelName}` : "";
    const description = `Watch ${title}${channel}, curated by 25experts for follow-up learning.`;
    const thumbnail = video?.thumbnail || `https://i.ytimg.com/vi/${encodeURIComponent(videoId)}/hqdefault.jpg`;
    const shareUrl = `https://25experts.com/share/${encodeURIComponent(videoId)}`;
    const watchUrl = `https://25experts.com/watch#v=${encodeURIComponent(videoId)}`;

    return new Response(renderHtml({
      title,
      channel,
      description,
      thumbnail,
      shareUrl,
      watchUrl,
    }), {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "public, max-age=300",
      },
    });
  },
};

function getVideoId(url) {
  const pathMatch = url.pathname.match(/^\/share\/([a-zA-Z0-9_-]{6,20})\/?$/);
  const candidate = pathMatch?.[1] || url.searchParams.get("v") || "";
  return /^[a-zA-Z0-9_-]{6,20}$/.test(candidate) ? candidate : "";
}

async function fetchVideo(videoId) {
  const docUrl = new URL(`https://firestore.googleapis.com/v1/projects/${FIRESTORE_PROJECT_ID}/databases/(default)/documents/curatedVideos/${encodeURIComponent(videoId)}`);
  docUrl.searchParams.set("key", FIREBASE_API_KEY);

  const response = await fetch(docUrl, {
    headers: { "Accept": "application/json" },
    cf: { cacheTtl: 900, cacheEverything: true },
  });
  if (!response.ok) return null;

  const fields = (await response.json()).fields || {};
  return {
    title: readFirestoreString(fields.title),
    channelName: readFirestoreString(fields.channelName),
    thumbnail: readFirestoreString(fields.thumbnail),
  };
}

function readFirestoreString(field) {
  return field?.stringValue || "";
}

function renderHtml({ title, channel, description, thumbnail, shareUrl, watchUrl }) {
  const pageTitle = `${title} | 25experts`;
  const imageAlt = `${title}${channel}`;
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(pageTitle)}</title>
  <meta name="description" content="${escapeAttr(description)}">
  <link rel="canonical" href="${escapeAttr(shareUrl)}">
  <meta property="og:type" content="video.other">
  <meta property="og:site_name" content="25experts by Mojo AI Studio">
  <meta property="og:title" content="${escapeAttr(title)}">
  <meta property="og:description" content="${escapeAttr(description)}">
  <meta property="og:url" content="${escapeAttr(shareUrl)}">
  <meta property="og:image" content="${escapeAttr(thumbnail)}">
  <meta property="og:image:secure_url" content="${escapeAttr(thumbnail)}">
  <meta property="og:image:type" content="image/jpeg">
  <meta property="og:image:width" content="480">
  <meta property="og:image:height" content="360">
  <meta property="og:image:alt" content="${escapeAttr(imageAlt)}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeAttr(title)}">
  <meta name="twitter:description" content="${escapeAttr(description)}">
  <meta name="twitter:image" content="${escapeAttr(thumbnail)}">
  <meta name="twitter:image:alt" content="${escapeAttr(imageAlt)}">
  <meta http-equiv="refresh" content="0; url=${escapeAttr(watchUrl)}">
</head>
<body>
  <p><a href="${escapeAttr(watchUrl)}">Continue to video</a></p>
  <script>location.replace(${JSON.stringify(watchUrl)});</script>
</body>
</html>`;
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
