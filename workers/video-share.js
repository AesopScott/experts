const FIRESTORE_PROJECT_ID = "experts-d7c3d";
const FIREBASE_API_KEY = "AIzaSyAMMMdI12N9scrGrV0CrbIE3Huk04g8vfw";
const UNKNOWN = "unknown";
const SOCIAL_CRAWLERS = [
  ["facebook", /facebookexternalhit|facebot/i],
  ["x-twitter", /twitterbot|xbot/i],
  ["linkedin", /linkedinbot/i],
  ["slack", /slackbot|slack-imgproxy/i],
  ["discord", /discordbot/i],
  ["telegram", /telegrambot/i],
  ["whatsapp", /whatsapp/i],
  ["pinterest", /pinterestbot/i],
  ["reddit", /redditbot/i],
  ["google", /googlebot|google-inspectiontool/i],
];

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const videoId = getVideoId(url);

    if (!videoId) {
      return Response.redirect("https://25experts.com/videos", 302);
    }

    recordShareEvent(env, request, url, videoId);

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

function recordShareEvent(env, request, url, videoId) {
  if (!env?.SHARE_ANALYTICS?.writeDataPoint) return;

  try {
    const userAgent = request.headers.get("user-agent") || "";
    const referrer = request.headers.get("referer") || request.headers.get("referrer") || "";
    const crawler = detectCrawler(userAgent);
    const referrerHost = getReferrerHost(referrer);
    const source = normalizeDimension(url.searchParams.get("utm_source") || inferSource(referrerHost, crawler.platform));
    const medium = normalizeDimension(url.searchParams.get("utm_medium") || (crawler.isCrawler ? "social-preview" : "share-click"));
    const campaign = normalizeDimension(url.searchParams.get("utm_campaign") || "none");
    const country = normalizeDimension(request.cf?.country || UNKNOWN);
    const colo = normalizeDimension(request.cf?.colo || UNKNOWN);
    const device = detectDevice(userAgent);
    const eventType = crawler.isCrawler ? "preview_scrape" : "human_click";

    env.SHARE_ANALYTICS.writeDataPoint({
      blobs: [
        eventType,
        videoId,
        source,
        medium,
        campaign,
        normalizeDimension(referrerHost || "direct"),
        crawler.platform,
        country,
        colo,
        device,
        normalizePath(url.pathname),
      ],
      doubles: [
        1,
        crawler.isCrawler ? 1 : 0,
        crawler.isCrawler ? 0 : 1,
      ],
      indexes: [videoId],
    });
  } catch {
    // Analytics must never block a social preview or click-through.
  }
}

function detectCrawler(userAgent) {
  for (const [platform, pattern] of SOCIAL_CRAWLERS) {
    if (pattern.test(userAgent)) {
      return { isCrawler: true, platform };
    }
  }

  if (/bot|crawler|spider|preview|embedly|quora link preview|vkshare|skypeuripreview/i.test(userAgent)) {
    return { isCrawler: true, platform: "other-crawler" };
  }

  return { isCrawler: false, platform: "human" };
}

function inferSource(referrerHost, crawlerPlatform) {
  if (crawlerPlatform && crawlerPlatform !== "human" && crawlerPlatform !== "other-crawler") return crawlerPlatform;
  if (!referrerHost) return "direct";
  if (referrerHost.includes("linkedin.")) return "linkedin";
  if (referrerHost.includes("facebook.") || referrerHost.includes("fb.")) return "facebook";
  if (referrerHost.includes("twitter.") || referrerHost.includes("x.com") || referrerHost.includes("t.co")) return "x-twitter";
  if (referrerHost.includes("reddit.")) return "reddit";
  if (referrerHost.includes("youtube.")) return "youtube";
  return referrerHost;
}

function getReferrerHost(referrer) {
  try {
    return referrer ? new URL(referrer).hostname.replace(/^www\./, "").toLowerCase() : "";
  } catch {
    return "";
  }
}

function detectDevice(userAgent) {
  if (/tablet|ipad/i.test(userAgent)) return "tablet";
  if (/mobile|iphone|android/i.test(userAgent)) return "mobile";
  if (!userAgent) return UNKNOWN;
  return "desktop";
}

function normalizeDimension(value) {
  return String(value || UNKNOWN)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .slice(0, 120) || UNKNOWN;
}

function normalizePath(value) {
  const path = String(value || "").trim();
  return path.startsWith("/") ? path.slice(0, 120) : UNKNOWN;
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
