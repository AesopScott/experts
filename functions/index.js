const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");
const { YoutubeTranscript } = require("youtube-transcript");
const { OpenAI } = require("openai");
const aesopApi = require("./lib/aesop-api.js");

admin.initializeApp();

const brevoApiKey = defineSecret("BREVO_SMTP_KEY");
const youtubeApiKey = defineSecret("YOUTUBE_API_KEY");
const openaiApiKey = defineSecret("OPENAI_API_KEY");

const DEFAULT_TO = "scott@aesopacademy.org";
const DEFAULT_FROM = "noreply@aesopacademy.org";

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatPlain(submission) {
  const lines = [
    submission.subject || "25experts form submission",
    "",
    `Page: ${submission.url || submission.page || "Unknown"}`,
    "",
  ];

  for (const item of submission.readable || []) {
    lines.push(`${item.label || item.name}: ${item.value}`);
  }

  return lines.join("\n");
}

function formatHtml(submission) {
  const rows = (submission.readable || []).map(item => `
    <tr>
      <th align="left" style="padding:8px;border-bottom:1px solid #ddd;">${escapeHtml(item.label || item.name)}</th>
      <td style="padding:8px;border-bottom:1px solid #ddd;">${escapeHtml(item.value)}</td>
    </tr>
  `).join("");

  return `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#10231d;">
      <h2>${escapeHtml(submission.subject || "25experts form submission")}</h2>
      <p><strong>Page:</strong> ${escapeHtml(submission.url || submission.page || "Unknown")}</p>
      <table cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;max-width:760px;">
        ${rows}
      </table>
    </div>
  `;
}

exports.sendFormSubmissionEmail = onDocumentCreated({
  document: "form_submissions/{submissionId}",
  secrets: [brevoApiKey],
}, async event => {
  const snapshot = event.data;
  if (!snapshot) return;

  const submission = snapshot.data();
  // Always use hardcoded addresses — never trust client-supplied `to`/`from`
  // fields, which would turn this function into an arbitrary email relay.
  const to = DEFAULT_TO;
  const from = DEFAULT_FROM;

  try {
    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        accept: "application/json",
        "api-key": brevoApiKey.value(),
        "content-type": "application/json",
      },
      body: JSON.stringify({
        sender: { email: from, name: "25experts" },
        to: [{ email: to }],
        replyTo: submission.fields?.email ? { email: submission.fields.email } : undefined,
        subject: submission.subject || "25experts form submission",
        textContent: formatPlain(submission),
        htmlContent: formatHtml(submission),
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Brevo API error ${response.status}: ${errorText}`);
    }

    const result = await response.json();

    await snapshot.ref.update({
      status: "sent",
      sentAt: admin.firestore.FieldValue.serverTimestamp(),
      messageId: result.messageId || result.messageIds?.[0] || null,
    });
  } catch (error) {
    await snapshot.ref.update({
      status: "error",
      error: error.message,
      erroredAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    throw error;
  }
});

// ─── YouTube curation ─────────────────────────────────────────────────────────

function getDiscoveryQueries() {
  const year = new Date().getFullYear();
  return [
    `artificial intelligence tutorial ${year}`,
    "AI agents workflow automation",
    `machine learning explained ${year}`,
    "AI productivity tools workflow",
    "large language models practical",
  ];
}

// Commits Firestore write operations in chunks to stay under the 500-write batch limit.
async function commitInBatches(db, operations) {
  const BATCH_LIMIT = 400;
  for (let i = 0; i < operations.length; i += BATCH_LIMIT) {
    const batch = db.batch();
    for (const op of operations.slice(i, i + BATCH_LIMIT)) {
      if (op.type === "set") batch.set(op.ref, op.data, op.options || {});
      else if (op.type === "update") batch.update(op.ref, op.data);
      else if (op.type === "delete") batch.delete(op.ref);
    }
    await batch.commit();
  }
}

// Fetch plain-text transcript for a videoId. Returns null if unavailable.
// Falls back to video title + description if captions aren't available.
// Caps at 100 000 chars to stay well under Firestore's 1 MB document limit.
async function fetchTranscript(videoId, apiKey = "") {
  try {
    const segments = await YoutubeTranscript.fetchTranscript(videoId, { lang: "en" });
    if (segments && segments.length > 0) {
      const text = segments.map(s => s.text).join(" ").replace(/\s+/g, " ").trim();
      return text.slice(0, 100000) || null;
    }
  } catch {
    // Transcript unavailable — try fallback
  }

  // Fallback: use YouTube API to fetch title + description (only if API key available)
  if (!apiKey) return null;

  try {
    const url = `https://www.googleapis.com/youtube/v3/videos?id=${videoId}&part=snippet&key=${apiKey}`;
    const res = await fetch(url);
    if (!res.ok) return null;

    const data = await res.json();
    const video = data.items?.[0]?.snippet;
    if (!video) return null;

    const fallback = `${video.title}. ${video.description}`.replace(/\s+/g, " ").trim();
    return fallback.slice(0, 100000) || null;
  } catch {
    return null;
  }
}

// Only ingest videos published on or after this date.
const INGEST_CUTOFF = new Date("2026-01-01T00:00:00Z");

exports.harvestVideos = onSchedule({
  schedule: "0 */8 * * *",
  secrets: [youtubeApiKey],
  timeoutSeconds: 540,
  memory: "512MiB",
}, async () => {
  const db = admin.firestore();
  const channelsSnap = await db.collection("followedChannels").get();
  if (channelsSnap.empty) return;

  const apiKey = youtubeApiKey.value();
  const operations = [];

  for (const channelDoc of channelsSnap.docs) {
    const { channelId, channelName } = channelDoc.data();
    const uploadsPlaylistId = channelId.replace(/^UC/, "UU");

    const url = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=${uploadsPlaylistId}&maxResults=10&key=${apiKey}`;
    let data;
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      data = await res.json();
    } catch {
      continue;
    }

    for (const item of (data.items || [])) {
      const s = item.snippet;
      const videoId = s.resourceId?.videoId;
      if (!videoId) continue;

      // Skip videos published before 2026.
      if (s.publishedAt && new Date(s.publishedAt) < INGEST_CUTOFF) continue;

      // Check if transcript already exists to avoid redundant fetches
      const existingDoc = await db.collection("curatedVideos").doc(videoId).get();
      const hasTranscript = existingDoc.exists && existingDoc.data().transcript !== undefined;
      const transcript = hasTranscript ? existingDoc.data().transcript : await fetchTranscript(videoId, apiKey);

      operations.push({
        type: "set",
        ref: db.collection("curatedVideos").doc(videoId),
        data: {
          videoId,
          title: s.title || "",
          link: `https://www.youtube.com/watch?v=${videoId}`,
          thumbnail: s.thumbnails?.high?.url || s.thumbnails?.default?.url || "",
          channelName: channelName || s.channelTitle || "",
          channelId,
          publishedAt: s.publishedAt || "",
          transcript,
          addedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        options: { merge: true },
      });
    }

    operations.push({
      type: "update",
      ref: channelDoc.ref,
      data: { lastHarvested: admin.firestore.FieldValue.serverTimestamp() },
    });
  }

  await commitInBatches(db, operations);
});

const DOMAIN_KEYWORDS = {
  "ai-automation": [
    "automation","workflow","agent","agents","prompt","prompting","llm","gpt","copilot",
    "n8n","zapier","make.com","automate","no-code","nocode","api","developer","build",
    "tutorial","tools","productivity","efficiency","claude","openai","chatgpt",
  ],
  "finance-investing": [
    "finance","investing","investment","stock","trading","portfolio","financial","money",
    "wealth","crypto","bitcoin","market","returns","fund","hedge","analyst","economics",
    "budget","tax","fintech","banking","accounting","revenue","profit",
  ],
  "marketing-growth": [
    "marketing","sales","growth","leads","social media","content","brand","seo",
    "advertising","copywriting","email","funnel","conversion","ecommerce","shopify",
    "influencer","youtube growth","tiktok","instagram","b2b","demand generation",
  ],
  "leadership-management": [
    "leadership","management","business","strategy","team","executive","ceo","founder",
    "entrepreneur","startup","operations","hr","culture","decision","governance",
    "corporate","organization","talent","hiring","coaching",
  ],
  "design-creative-gaming": [
    "design","creative","art","game","gaming","visual","video editing","music",
    "generative","midjourney","stable diffusion","dall-e","graphic","illustration",
    "animation","3d","unity","unreal","prototype","ux","ui","branding",
  ],
};

function suggestDomain(channelName, description) {
  const text = (channelName + " " + description).toLowerCase();
  const scores = Object.fromEntries(Object.keys(DOMAIN_KEYWORDS).map(k => [k, 0]));
  Object.entries(DOMAIN_KEYWORDS).forEach(([domain, keywords]) => {
    keywords.forEach(kw => { if (text.includes(kw)) scores[domain]++; });
  });
  const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  return best[1] > 0 ? best[0] : null;
}

async function runDiscovery(db, apiKey) {
  const [followedSnap, candidateSnap] = await Promise.all([
    db.collection("followedChannels").get(),
    db.collection("candidateChannels").get(),
  ]);

  const existingIds = new Set([
    ...followedSnap.docs.map(d => d.data().channelId),
    ...candidateSnap.docs.map(d => d.data().channelId),
  ]);

  const candidates = [];

  for (const q of getDiscoveryQueries()) {
    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&q=${encodeURIComponent(q)}&maxResults=5&key=${apiKey}`;
    let data;
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      data = await res.json();
    } catch {
      continue;
    }

    for (const item of (data.items || [])) {
      const channelId = item.id?.channelId;
      if (!channelId || existingIds.has(channelId)) continue;
      existingIds.add(channelId);
      const channelName = item.snippet?.channelTitle || "";
      const description = item.snippet?.description || "";
      candidates.push({
        channelId,
        channelName,
        description,
        thumbnailUrl: item.snippet?.thumbnails?.default?.url || "",
        suggestedDomain: suggestDomain(channelName, description),
        discoveredAt: admin.firestore.FieldValue.serverTimestamp(),
        status: "pending",
      });
    }
  }

  if (candidates.length === 0) return 0;

  const operations = candidates.map(c => ({
    type: "set",
    ref: db.collection("candidateChannels").doc(c.channelId),
    data: c,
  }));
  await commitInBatches(db, operations);
  return candidates.length;
}

exports.discoverChannels = onSchedule({
  schedule: "0 0 * * *",
  secrets: [youtubeApiKey],
  timeoutSeconds: 300,
  memory: "256MiB",
}, async () => {
  const db = admin.firestore();
  await runDiscovery(db, youtubeApiKey.value());
});

exports.runDiscoveryNow = onCall({
  secrets: [youtubeApiKey],
  timeoutSeconds: 300,
  memory: "256MiB",
}, async request => {
  await requireAdmin(request);
  const db = admin.firestore();
  const count = await runDiscovery(db, youtubeApiKey.value());
  return { found: count };
});

async function requireAdmin(request) {
  if (!request.auth) throw new HttpsError("unauthenticated", "Must be signed in");
  const userDoc = await admin.firestore().doc(`users/${request.auth.uid}`).get();
  if (!userDoc.exists || userDoc.data().role !== "admin") {
    throw new HttpsError("permission-denied", "Admin access required");
  }
}

exports.lookupChannel = onCall({
  secrets: [youtubeApiKey],
}, async request => {
  await requireAdmin(request);

  const { channelUrl } = request.data || {};
  if (!channelUrl) throw new HttpsError("invalid-argument", "channelUrl is required");

  const apiKey = youtubeApiKey.value();
  const handleMatch = channelUrl.match(/youtube\.com\/@([^/?&#]+)/);
  const idMatch = channelUrl.match(/youtube\.com\/channel\/(UC[^/?&#]+)/);

  let apiUrl;
  if (idMatch) {
    apiUrl = `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&id=${idMatch[1]}&key=${apiKey}`;
  } else if (handleMatch) {
    apiUrl = `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&forHandle=${handleMatch[1]}&key=${apiKey}`;
  } else {
    throw new HttpsError("invalid-argument", "Use youtube.com/@handle or youtube.com/channel/UC… format");
  }

  const res = await fetch(apiUrl);
  if (!res.ok) throw new HttpsError("internal", `YouTube API error ${res.status}`);
  const data = await res.json();

  const channel = data.items?.[0];
  if (!channel) throw new HttpsError("not-found", "Channel not found");

  return {
    channelId: channel.id,
    channelName: channel.snippet?.title || "",
    description: channel.snippet?.description || "",
    subscriberCount: channel.statistics?.subscriberCount || "0",
    thumbnailUrl: channel.snippet?.thumbnails?.default?.url || "",
  };
});

exports.fetchVideoMetadata = onCall({
  secrets: [youtubeApiKey],
}, async request => {
  await requireAdmin(request);

  const { videoUrl } = request.data || {};
  if (!videoUrl) throw new HttpsError("invalid-argument", "videoUrl is required");

  const idMatch = videoUrl.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&?/#]+)/);
  if (!idMatch) throw new HttpsError("invalid-argument", "Could not parse YouTube video URL");
  const videoId = idMatch[1];

  const apiKey = youtubeApiKey.value();
  const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoId}&key=${apiKey}`;

  const res = await fetch(url);
  if (!res.ok) throw new HttpsError("internal", `YouTube API error ${res.status}`);
  const data = await res.json();

  const video = data.items?.[0];
  if (!video) throw new HttpsError("not-found", "Video not found");
  const s = video.snippet;

  const transcript = await fetchTranscript(videoId, apiKey);

  return {
    videoId,
    title: s.title || "",
    channelName: s.channelTitle || "",
    channelId: s.channelId || "",
    publishedAt: s.publishedAt || new Date().toISOString(),
    thumbnail: s.thumbnails?.high?.url || s.thumbnails?.default?.url || "",
    link: `https://www.youtube.com/watch?v=${videoId}`,
    transcript,
  };
});

// ── Video to Courses Sync ──────────────────────────────────────────────────────

async function sendSyncErrorEmail(videoId, error) {
  const to = DEFAULT_TO;
  const from = DEFAULT_FROM;
  const subject = `Sync Error: Video ${videoId}`;
  const message = `Failed to sync video ${videoId} to courses:\n\n${error.message}`;

  try {
    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        accept: "application/json",
        "api-key": brevoApiKey.value(),
        "content-type": "application/json",
      },
      body: JSON.stringify({
        sender: { email: from, name: "25experts" },
        to: [{ email: to }],
        subject,
        textContent: message,
      }),
    });

    if (!response.ok) {
      console.error(`Failed to send error email: ${response.status}`);
    }
  } catch (err) {
    console.error("Error sending sync error email:", err.message);
  }
}

async function extractConceptsFromTranscript(transcript, openaiClient, videoTitle = "") {
  if (!transcript || transcript.trim().length === 0) {
    return [];
  }

  const systemPrompt = `You are an expert instructional designer analyzing video content.
Extract 5-10 key learning concepts from the video title and transcript. These should be:
- Specific, actionable topics (not generic like "introduction" or "conclusion")
- Topics that Aesop Academy courses might cover
- Sorted by importance/frequency in the content

Return as a JSON array of strings, e.g. ["machine learning", "ai fundamentals"]`;

  let content = "";
  if (videoTitle) content += `Title: ${videoTitle}\n\n`;
  content += `Transcript (first 4000 chars):\n\n${transcript.slice(0, 4000)}`;

  const userPrompt = `${content}\n\nExtract key learning concepts as a JSON array.`;

  try {
    const response = await openaiClient.chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 500,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });

    const content = response.choices[0]?.message?.content || "";
    const match = content.match(/\[[\s\S]*\]/);
    if (!match) return [];

    const concepts = JSON.parse(match[0]);
    return Array.isArray(concepts)
      ? concepts.filter(c => typeof c === "string" && c.length > 0)
      : [];
  } catch (error) {
    console.error("OpenAI concept extraction failed:", error.message);
    throw new Error(`Concept extraction failed: ${error.message}`);
  }
}

async function matchCoursesToConcepts(concepts, courseCatalog) {
  if (!concepts || concepts.length === 0 || !courseCatalog?.courses) {
    return [];
  }

  const conceptsLower = concepts.map(c => c.toLowerCase());
  const matched = [];

  for (const course of courseCatalog.courses) {
    let score = 0;
    const keywords = (course.keywords || []).map(k => k.toLowerCase());
    const courseText = `${course.name} ${course.description}`.toLowerCase();

    conceptsLower.forEach(concept => {
      if (keywords.some(kw => kw.includes(concept) || concept.includes(kw))) {
        score += 0.5;
      }
      if (courseText.includes(concept)) {
        score += 0.3;
      }
    });

    const normalizedScore = Math.min(1, score);
    if (normalizedScore > 0) {
      matched.push({
        id: course.id,
        name: course.name,
        desc: course.description,
        url: course.url,
        live: course.live,
        relevanceScore: parseFloat(normalizedScore.toFixed(2)),
      });
    }
  }

  return matched.sort((a, b) => b.relevanceScore - a.relevanceScore);
}


async function syncVideoWithRetry(videoId, catalog, openaiClient, db, maxRetries = 2) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const videoDoc = await db.collection("curatedVideos").doc(videoId).get();
      if (!videoDoc.exists) return { success: false, reason: "video_not_found" };

      const { transcript, title = "" } = videoDoc.data();
      if (!transcript) return { success: false, reason: "no_transcript" };

      const concepts = await extractConceptsFromTranscript(transcript, openaiClient, title);
      const courses = await matchCoursesToConcepts(concepts, catalog);

      await db.collection("videoCourseMappings").doc(videoId).set({
        videoId,
        courses,
        hasCourses: courses.length > 0,
        syncedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      return { success: true, matched: courses.length };
    } catch (error) {
      const isLastAttempt = attempt === maxRetries;
      console.error(`Sync attempt ${attempt + 1}/${maxRetries + 1} for ${videoId}:`, error.message);

      if (isLastAttempt) {
        // Final attempt failed, save error and return
        try {
          await db.collection("videoCourseMappings").doc(videoId).set({
            videoId,
            courses: [],
            hasCourses: false,
            syncedAt: admin.firestore.FieldValue.serverTimestamp(),
            error: error.message,
            attempts: maxRetries + 1,
          });
        } catch (writeErr) {
          console.error("Failed to write error record:", writeErr.message);
        }
        return { success: false, reason: "max_retries_exceeded", error: error.message };
      }

      // Retry after brief delay
      await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt)));
    }
  }
}

exports.syncVideoToCourses = onCall({
  secrets: [brevoApiKey, openaiApiKey],
  timeoutSeconds: 540,
  memory: "512MiB",
}, async request => {
  await requireAdmin(request);

  const db = admin.firestore();
  const { videoId: singleVideoId } = request.data || {};

  if (singleVideoId && typeof singleVideoId !== "string") {
    throw new HttpsError("invalid-argument", "videoId must be a string");
  }

  const openaiClient = new OpenAI({ apiKey: openaiApiKey.value() });
  let processed = 0;
  let matched = 0;
  const errors = [];

  try {
    // Determine which videos to sync
    let videoIds;
    if (singleVideoId) {
      videoIds = [singleVideoId];
    } else {
      const snap = await db
        .collection("videoCourseMappings")
        .where("hasCourses", "==", false)
        .limit(10)
        .get();
      videoIds = snap.docs.map(d => d.id);
    }

    if (videoIds.length === 0) {
      return { success: true, videosProcessed: 0, coursesMatched: 0 };
    }

    // Get course catalog once (cached for 24 hours, with retry)
    let catalog;
    try {
      catalog = await aesopApi.getCourseCatalog(db);
    } catch (error) {
      console.error("Catalog fetch failed:", error.message);
      throw new HttpsError("unavailable", "Course catalog unavailable, please try again");
    }

    // Process each video with retry
    for (const vid of videoIds) {
      const result = await syncVideoWithRetry(vid, catalog, openaiClient, db);

      if (result.success) {
        processed++;
        matched += result.matched;
      } else {
        processed++;
        errors.push({ videoId: vid, reason: result.reason, error: result.error });

        if (result.error) {
          await sendSyncErrorEmail(vid, new Error(result.error));
        }
      }
    }

    const response = {
      success: true,
      videosProcessed: processed,
      coursesMatched: matched,
    };

    if (errors.length > 0) {
      response.errors = errors;
      response.errorsCount = errors.length;
    }

    return response;
  } catch (error) {
    console.error("syncVideoToCourses failed:", error.message);
    await sendSyncErrorEmail("batch", error);
    throw new HttpsError("internal", `Sync failed: ${error.message}`);
  }
});

// ── Channel Management ────────────────────────────────────────────────────────

exports.deleteChannelVideos = onCall({
}, async request => {
  await requireAdmin(request);

  const { channelId } = request.data || {};
  if (!channelId) throw new HttpsError("invalid-argument", "channelId is required");

  const db = admin.firestore();
  const videosSnap = await db
    .collection("curatedVideos")
    .where("channelId", "==", channelId)
    .get();

  const batch = db.batch();
  let count = 0;
  for (const doc of videosSnap.docs) {
    batch.delete(doc.ref);
    count++;
  }

  if (count > 0) await batch.commit();
  return { deleted: count };
});

exports.deleteCreatorVideos = onCall({
}, async request => {
  await requireAdmin(request);

  const { channelName } = request.data || {};
  if (!channelName) throw new HttpsError("invalid-argument", "channelName is required");

  const db = admin.firestore();
  const videosSnap = await db
    .collection("curatedVideos")
    .where("channelName", "==", channelName)
    .get();

  const operations = [];
  for (const doc of videosSnap.docs) {
    operations.push({ type: "delete", ref: doc.ref });
  }

  await commitInBatches(db, operations.map(op => ({
    type: op.type,
    ref: op.ref,
  })));

  return { deleted: operations.length };
});

exports.scanAllChannels = onCall({
  secrets: [youtubeApiKey],
  timeoutSeconds: 540,
  memory: "512MiB",
}, async request => {
  await requireAdmin(request);

  const db = admin.firestore();
  const apiKey = youtubeApiKey.value();
  const channelsSnap = await db.collection("followedChannels").get();

  if (channelsSnap.empty) {
    return { scanned: 0, videosAdded: 0 };
  }

  const operations = [];
  let videosAdded = 0;

  for (const channelDoc of channelsSnap.docs) {
    const { channelId, channelName } = channelDoc.data();
    const uploadsPlaylistId = channelId.replace(/^UC/, "UU");

    const url = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=${uploadsPlaylistId}&maxResults=10&key=${apiKey}`;
    let data;
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      data = await res.json();
    } catch {
      continue;
    }

    for (const item of (data.items || [])) {
      const s = item.snippet;
      const videoId = s.resourceId?.videoId;
      if (!videoId) continue;

      if (s.publishedAt && new Date(s.publishedAt) < INGEST_CUTOFF) continue;

      const existingDoc = await db.collection("curatedVideos").doc(videoId).get();
      const hasTranscript = existingDoc.exists && existingDoc.data().transcript !== undefined;
      const transcript = hasTranscript ? existingDoc.data().transcript : await fetchTranscript(videoId, apiKey);

      operations.push({
        type: "set",
        ref: db.collection("curatedVideos").doc(videoId),
        data: {
          videoId,
          title: s.title || "",
          link: `https://www.youtube.com/watch?v=${videoId}`,
          thumbnail: s.thumbnails?.high?.url || s.thumbnails?.default?.url || "",
          channelName: channelName || s.channelTitle || "",
          channelId,
          publishedAt: s.publishedAt || "",
          transcript,
          addedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        options: { merge: true },
      });
      videosAdded++;
    }

    operations.push({
      type: "update",
      ref: channelDoc.ref,
      data: { lastHarvested: admin.firestore.FieldValue.serverTimestamp() },
    });
  }

  if (operations.length > 0) {
    await commitInBatches(db, operations);
  }

  return { scanned: channelsSnap.size, videosAdded };
});
