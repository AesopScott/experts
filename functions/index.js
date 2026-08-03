const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");
const { YoutubeTranscript } = require("youtube-transcript");

admin.initializeApp();

const brevoApiKey = defineSecret("BREVO_SMTP_KEY");
const youtubeApiKey = defineSecret("YOUTUBE_API_KEY");

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
    lines.push(`${item.label || item.name}: ${String(item.value ?? "")}`);
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
    // General AI education
    `artificial intelligence tutorial ${year}`,
    `AI explained ${year}`,
    "artificial intelligence for beginners",
    "AI news and updates",
    "future of artificial intelligence",

    // ChatGPT & LLMs
    "ChatGPT tutorial tips tricks",
    "ChatGPT productivity workflow",
    "GPT-4 how to use",
    "Claude AI tutorial",
    "large language models explained",
    "large language models practical",

    // Prompt engineering
    "prompt engineering guide",
    "prompt engineering tips",

    // AI agents & automation
    "AI agents workflow automation",
    "AI automation workflow",
    "autonomous AI agents",
    "n8n AI automation tutorial",
    "Make Zapier AI workflow",

    // AI tools & productivity
    "AI tools productivity",
    "best AI tools review",
    "AI tools for business",
    "AI software review",

    // Machine learning & data science
    `machine learning explained ${year}`,
    "deep learning tutorial",
    "data science machine learning",
    "neural networks explained",

    // Generative AI
    "generative AI tutorial",
    "Midjourney tutorial tips",
    "Stable Diffusion tutorial",
    "AI image generation guide",
    "AI video generation tools",

    // AI coding
    "AI coding assistant tutorial",
    "GitHub Copilot tips",
    "Cursor AI coding",

    // AI for business verticals
    "AI for marketing strategy",
    "AI business tools",
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

// Wrap a promise with a timeout. Rejects if the promise doesn't settle within ms.
function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms))
  ]);
}

// Fetch plain-text transcript for a videoId. Returns null if unavailable.
// Tries: user captions (en), auto-generated captions, then falls back to title+description.
// Caps at 100 000 chars to stay well under Firestore's 1 MB document limit.
async function fetchTranscript(videoId, apiKey = "") {
  // Try user-created English captions first
  try {
    const segments = await withTimeout(
      YoutubeTranscript.fetchTranscript(videoId, { lang: "en" }),
      8000
    );
    if (segments && segments.length > 0) {
      const text = segments.map(s => s.text).join(" ").replace(/\s+/g, " ").trim();
      return text.slice(0, 100000) || null;
    }
  } catch (err) {
    console.warn(`User captions fetch failed for ${videoId}: ${err.message}`);
  }

  // Try auto-generated captions (no lang specified gets all available)
  try {
    console.log(`Trying auto-generated captions for ${videoId}...`);
    const segments = await withTimeout(
      YoutubeTranscript.fetchTranscript(videoId),
      8000
    );
    if (segments && segments.length > 0) {
      const text = segments.map(s => s.text).join(" ").replace(/\s+/g, " ").trim();
      console.log(`Got auto-generated captions for ${videoId}, ${text.length} chars`);
      return text.slice(0, 100000) || null;
    }
  } catch (err) {
    console.warn(`Auto-generated captions fetch failed for ${videoId}: ${err.message}`);
  }

  // Fallback: use YouTube API to fetch title + description (only if API key available)
  if (apiKey) {
    try {
      console.log(`Using title+description fallback for ${videoId}...`);
      const url = `https://www.googleapis.com/youtube/v3/videos?id=${videoId}&part=snippet&key=${apiKey}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        const video = data.items?.[0]?.snippet;
        if (video?.title || video?.description) {
          const fallback = `${video.title || ""}. ${video.description || ""}`.replace(/\s+/g, " ").trim();
          if (fallback.length > 0) {
            console.log(`Using title+description for ${videoId}, ${fallback.length} chars`);
            return fallback.slice(0, 100000);
          }
        }
      }
    } catch (err) {
      console.warn(`YouTube API fallback failed for ${videoId}: ${err.message}`);
    }
  }

  // No transcript found
  console.warn(`No transcript available for ${videoId}`);
  return null;
}

const TRANSCRIPT_COLLECTION = "videoTranscripts";
const ENRICHMENT_TRANSCRIPT_FETCH_LIMIT = 50;

function hasText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function cleanTranscriptTextForSummary(value) {
  return String(value || "")
    .replace(/\[[^\]]+\]/g, " ")
    .replace(/full\s+post\s*:?.*?(?=(?:\s+[A-Z][a-z]+(?:\s+[a-z]+)*\s*:)|$)/gi, " ")
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/\b[\w.-]+\.(?:com|net|org|io|ai|co|newsletter)\S*/gi, " ")
    .replace(/\b(?:utm_[a-z_]+|showWelcomeOnShare|r)=[^\s]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildTranscriptSummary(transcript, title = "") {
  const normalized = cleanTranscriptTextForSummary(transcript);

  if (!normalized) return "";

  const sentences = normalized
    .match(/[^.!?]+[.!?]+|[^.!?]+$/g)
    ?.map(s => s.trim())
    .filter(s => s.length >= 35) || [];
  const source = sentences.length > 0 ? sentences : [normalized];
  let summary = source.slice(0, 5).join(" ");

  if (summary.length > 1200) {
    summary = summary.slice(0, 1197).replace(/\s+\S*$/, "") + "...";
  }

  if (!summary && title) return title;
  return summary;
}

function transcriptRecordPath(videoId) {
  return `${TRANSCRIPT_COLLECTION}/${videoId}`;
}

function buildTranscriptRecord({ videoId, data, transcript, summary }) {
  const now = admin.firestore.FieldValue.serverTimestamp();
  return {
    videoId,
    title: data.title || "",
    link: data.link || `https://www.youtube.com/watch?v=${videoId}`,
    channelName: data.channelName || "",
    channelId: data.channelId || "",
    publishedAt: data.publishedAt || "",
    transcript,
    summary,
    summaryMethod: "extractive-v1",
    updatedAt: now,
  };
}

async function enrichCuratedVideos(db, apiKey, options = {}) {
  const transcriptFetchLimit = options.transcriptFetchLimit ?? ENRICHMENT_TRANSCRIPT_FETCH_LIMIT;
  const snap = await db.collection("curatedVideos").get();
  const missingMetadata = snap.docs.filter(d => {
    const data = d.data();
    return data.durationSeconds == null || !data.publishedAt;
  });
  const metadata = await fetchYouTubeVideoMetadata(
    missingMetadata.map(d => d.data().videoId || d.id),
    apiKey
  );

  let transcriptFetches = 0;
  let updated = 0;
  let topicUpdates = 0;
  let durationUpdates = 0;
  let publishedAtUpdates = 0;
  let transcriptUpdates = 0;
  let transcriptRecords = 0;
  const operations = [];

  for (const d of snap.docs) {
    const data = d.data();
    const videoId = data.videoId || d.id;
    const updateData = {};

    if (!Array.isArray(data.topics) || data.topics.length === 0) {
      updateData.topics = tagTopics(data.title, data.description || data.transcript || "");
      topicUpdates++;
    }

    if (data.durationSeconds == null) {
      const secs = metadata.get(videoId)?.durationSeconds;
      if (secs != null) {
        updateData.durationSeconds = secs;
        durationUpdates++;
      }
    }

    if (!data.publishedAt) {
      const publishedAt = metadata.get(videoId)?.publishedAt;
      if (publishedAt) {
        updateData.publishedAt = publishedAt;
        publishedAtUpdates++;
      }
    }

    let transcript = hasText(data.transcript) ? data.transcript.trim() : null;
    const transcriptAlreadyProcessed = Boolean(
      data.transcriptProcessedAt ||
      data.transcriptStatus ||
      data.transcriptRecordPath
    );

    if (!transcript && !transcriptAlreadyProcessed && transcriptFetches < transcriptFetchLimit) {
      transcriptFetches++;
      transcript = await fetchTranscript(videoId, apiKey);
      updateData.transcript = transcript;
      updateData.transcriptStatus = transcript ? "available" : "unavailable";
      updateData.transcriptProcessedAt = admin.firestore.FieldValue.serverTimestamp();
      transcriptUpdates++;
    } else if (transcript && !data.transcriptStatus) {
      updateData.transcriptStatus = "available";
      updateData.transcriptProcessedAt = admin.firestore.FieldValue.serverTimestamp();
      transcriptUpdates++;
    }

    if (transcript && (!hasText(data.transcriptSummary) || !data.transcriptRecordPath)) {
      const summary = hasText(data.transcriptSummary)
        ? data.transcriptSummary.trim()
        : buildTranscriptSummary(transcript, data.title);
      const recordPath = transcriptRecordPath(videoId);
      operations.push({
        type: "set",
        ref: db.collection(TRANSCRIPT_COLLECTION).doc(videoId),
        data: buildTranscriptRecord({ videoId, data: { ...data, ...updateData }, transcript, summary }),
        options: { merge: true },
      });
      Object.assign(updateData, {
        transcriptSummary: summary,
        transcriptSummaryStatus: "available",
        transcriptRecordPath: recordPath,
        transcriptSummaryUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      transcriptRecords++;
    } else if (!transcript && updateData.transcriptStatus === "unavailable") {
      updateData.transcriptSummaryStatus = "unavailable";
    }

    if (Object.keys(updateData).length > 0) {
      operations.push({ type: "update", ref: d.ref, data: updateData });
      updated++;
    }
  }

  if (operations.length > 0) await commitInBatches(db, operations);

  return {
    scanned: snap.size,
    updated,
    topicUpdates,
    durationUpdates,
    publishedAtUpdates,
    transcriptUpdates,
    transcriptRecords,
    transcriptFetches,
  };
}

// Only ingest videos published on or after this date.
const INGEST_CUTOFF = new Date("2026-01-01T00:00:00Z");

// ── Topic tagging ──────────────────────────────────────────────────────────────
// keywords: plain substring match (case-insensitive on lowercased text)
// wordBound: whole-word regex match (e.g. "rag" won't hit "garage")
const TOPIC_TAGS = [
  { id: "claude",             keywords: ["claude"] },
  { id: "chatgpt",            keywords: ["chatgpt", "gpt-4o", "gpt-4", "gpt4", "openai"] },
  { id: "gemini",             keywords: ["gemini"] },
  { id: "open-models",        keywords: ["llama", "mistral", "deepseek", "qwen"] },
  { id: "agents",             keywords: ["ai agent", "ai agents", "agentic", "autonomous agent"] },
  { id: "orchestration",      keywords: ["orchestration", "langchain", "crewai", "autogen", "multi-agent"] },
  { id: "rag",                keywords: ["retrieval augmented", "vector database", "vector store"], wordBound: ["rag"] },
  { id: "prompt-engineering", keywords: ["prompt engineering", "system prompt", "prompt engineer"] },
  { id: "automation",         keywords: ["n8n", "zapier", "make.com", "workflow automation"] },
  { id: "ai-coding",          keywords: ["cursor ai", "github copilot", "ai coding", "code generation"] },
  { id: "image-generation",   keywords: ["midjourney", "stable diffusion", "dall-e", "dalle", "image generation", "flux"] },
  { id: "video-ai",           keywords: ["video generation", "ai video", "sora", "kling"] },
  { id: "fine-tuning",        keywords: ["fine-tun", "fine tuning", "finetuning"], wordBound: ["lora"] },
  { id: "local-ai",           keywords: ["local ai", "local llm", "run locally", "ollama", "on-device ai"] },
];

function tagTopics(title, description) {
  const text = ((title || "") + " " + (description || "")).toLowerCase();
  const matched = [];
  for (const { id, keywords = [], wordBound = [] } of TOPIC_TAGS) {
    const hit = keywords.some(kw => text.includes(kw)) ||
                wordBound.some(kw => new RegExp(`\\b${kw}\\b`).test(text));
    if (hit) matched.push(id);
  }
  return matched;
}

/** Parses ISO 8601 duration (e.g. "PT4M30S") → total seconds, or null. */
function parseIso8601Duration(str) {
  if (!str) return null;
  const m = str.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return null;
  return (parseInt(m[1] || 0, 10) * 3600)
       + (parseInt(m[2] || 0, 10) * 60)
       +  parseInt(m[3] || 0, 10);
}

/** Batch-fetches YouTube video durations (50 per API call). Returns Map<videoId, seconds>. */
async function fetchDurations(videoIds, apiKey) {
  const metadata = await fetchYouTubeVideoMetadata(videoIds, apiKey);
  return new Map([...metadata].map(([id, data]) => [id, data.durationSeconds]));
}

/** Batch-fetches YouTube metadata used by curatedVideos. Returns Map<videoId, data>. */
async function fetchYouTubeVideoMetadata(videoIds, apiKey) {
  const result = new Map();
  for (let i = 0; i < videoIds.length; i += 50) {
    const batch = videoIds.slice(i, i + 50);
    const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails&id=${batch.join(",")}&key=${apiKey}`;
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const data = await res.json();
      for (const item of (data.items || [])) {
        const secs = parseIso8601Duration(item.contentDetails?.duration);
        result.set(item.id, {
          durationSeconds: secs,
          publishedAt: item.snippet?.publishedAt || "",
        });
      }
    } catch { continue; }
  }
  return result;
}

/**
 * Shared harvest pipeline used by both the scheduled job and the manual scan.
 * Phase 1 — collect eligible new candidates across all channels.
 * Phase 2 — batch-fetch durations (1 quota unit per 50 videos).
 * Phase 3 — fetch transcripts, tag topics, write to Firestore.
 * Returns the number of video docs written.
 */
async function harvestForChannels(channelsSnap, db, apiKey) {
  const candidates = []; // { videoId, s, channelName, channelId }
  const channelUpdates = channelsSnap.docs.map(d => ({
    type: "update",
    ref: d.ref,
    data: { lastHarvested: admin.firestore.FieldValue.serverTimestamp() },
  }));

  for (const channelDoc of channelsSnap.docs) {
    const { channelId, channelName } = channelDoc.data();
    const uploadsPlaylistId = channelId.replace(/^UC/, "UU");
    const url = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=${uploadsPlaylistId}&maxResults=10&key=${apiKey}`;
    let data;
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      data = await res.json();
    } catch { continue; }

    for (const item of (data.items || [])) {
      const s = item.snippet;
      const videoId = s.resourceId?.videoId;
      if (!videoId) continue;
      if (s.publishedAt && new Date(s.publishedAt) < INGEST_CUTOFF) continue;
      if (!isAiRelevant(s.title, s.description)) continue;
      candidates.push({ videoId, s, channelName, channelId });
    }
  }

  if (candidates.length === 0) {
    await commitInBatches(db, channelUpdates);
    return 0;
  }

  // Batch-fetch durations for all candidates in one round of API calls
  const durations = await fetchDurations(candidates.map(c => c.videoId), apiKey);

  const operations = [];
  for (const { videoId, s, channelName, channelId } of candidates) {
    const existingDoc = await db.collection("curatedVideos").doc(videoId).get();
    const hasTranscript = existingDoc.exists && existingDoc.data().transcript;
    const transcript = hasTranscript
      ? existingDoc.data().transcript
      : await fetchTranscript(videoId, apiKey);

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
        topics: tagTopics(s.title, s.description),
        durationSeconds: durations.get(videoId) ?? null,
        addedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      options: { merge: true },
    });
  }

  await commitInBatches(db, [...operations, ...channelUpdates]);
  return operations.length;
}

// ── AI relevance filter ────────────────────────────────────────────────────────
// Short tokens checked as whole words (case-insensitive) to avoid false matches
// e.g. "ai" won't match "email" or "braid".
const AI_WHOLE_WORDS = ["ai", "llm", "gpt", "rag", "llms", "gpts"];

// Longer, unambiguous substrings checked with simple includes().
const AI_SUBSTRINGS = [
  "artificial intelligence", "machine learning", "deep learning",
  "neural network", "large language model",
  "chatgpt", "gpt-4", "gpt4", "gpt-4o", "openai", "anthropic",
  "midjourney", "stable diffusion", "dall-e", "dalle",
  "prompt engineering", "prompt engineer", "prompting",
  "ai agent", "ai tool", "ai model", "generative ai", "gen ai",
  "claude ai", "google gemini", "github copilot", "microsoft copilot",
  "cursor ai", "n8n", "langchain", "hugging face",
  "fine-tun", "fine tuning", "finetuning",
  "retrieval augmented", "vector database", "embedding model",
  "diffusion model", "text to image", "image generation",
  "ai automation", "ai workflow", "ai coding", "ai assistant",
];

/**
 * Returns true if the video title or description contains AI-related signals.
 * Filters out non-AI content posted by channels that occasionally go off-topic.
 */
function isAiRelevant(title, description) {
  const text = ((title || "") + " " + (description || "")).toLowerCase();
  for (const word of AI_WHOLE_WORDS) {
    if (new RegExp(`\\b${word}\\b`).test(text)) return true;
  }
  for (const sub of AI_SUBSTRINGS) {
    if (text.includes(sub)) return true;
  }
  return false;
}

exports.harvestVideos = onSchedule({
  schedule: "0 */8 * * *",
  secrets: [youtubeApiKey],
  timeoutSeconds: 540,
  memory: "512MiB",
}, async () => {
  const db = admin.firestore();
  const apiKey = youtubeApiKey.value();
  const channelsSnap = await db.collection("followedChannels").get();
  if (!channelsSnap.empty) {
    await harvestForChannels(channelsSnap, db, apiKey);
  }
  await enrichCuratedVideos(db, apiKey);
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

const MIN_SUBSCRIBER_COUNT = 25_000;

async function runDiscovery(db, apiKey) {
  const [followedSnap, candidateSnap] = await Promise.all([
    db.collection("followedChannels").get(),
    db.collection("candidateChannels").get(),
  ]);

  const existingIds = new Set([
    ...followedSnap.docs.map(d => d.data().channelId),
    ...candidateSnap.docs.map(d => d.data().channelId),
  ]);

  // Phase 1: collect raw search results across all queries (maxResults=50 per query)
  const rawMap = new Map(); // channelId → snippet data

  for (const q of getDiscoveryQueries()) {
    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&q=${encodeURIComponent(q)}&maxResults=50&key=${apiKey}`;
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
      if (!channelId || existingIds.has(channelId) || rawMap.has(channelId)) continue;
      rawMap.set(channelId, {
        channelId,
        channelName: item.snippet?.channelTitle || "",
        description: item.snippet?.description || "",
        thumbnailUrl: item.snippet?.thumbnails?.default?.url || "",
      });
    }
  }

  if (rawMap.size === 0) return 0;

  // Phase 2: fetch subscriber counts in batches of 50 and filter to >= 25,000
  const channelIds = [...rawMap.keys()];
  const qualified = [];

  for (let i = 0; i < channelIds.length; i += 50) {
    const batch = channelIds.slice(i, i + 50);
    const url = `https://www.googleapis.com/youtube/v3/channels?part=statistics&id=${batch.join(",")}&key=${apiKey}`;
    let data;
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      data = await res.json();
    } catch {
      continue;
    }

    for (const item of (data.items || [])) {
      const subs = parseInt(item.statistics?.subscriberCount || "0", 10);
      if (subs < MIN_SUBSCRIBER_COUNT) continue;
      const raw = rawMap.get(item.id);
      if (!raw) continue;
      qualified.push({
        ...raw,
        subscriberCount: subs,
        suggestedDomain: suggestDomain(raw.channelName, raw.description),
        discoveredAt: admin.firestore.FieldValue.serverTimestamp(),
        status: "pending",
      });
    }
  }

  if (qualified.length === 0) return 0;

  const operations = qualified.map(c => ({
    type: "set",
    ref: db.collection("candidateChannels").doc(c.channelId),
    data: c,
  }));
  await commitInBatches(db, operations);
  return qualified.length;
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

  // Use commitInBatches to stay under Firestore's 500-write batch limit.
  const operations = videosSnap.docs.map(doc => ({ type: "delete", ref: doc.ref }));
  await commitInBatches(db, operations);
  return { deleted: operations.length };
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
  if (channelsSnap.empty) return { scanned: 0, videosAdded: 0 };
  const videosAdded = await harvestForChannels(channelsSnap, db, apiKey);
  const enrichment = await enrichCuratedVideos(db, apiKey);
  return { scanned: channelsSnap.size, videosAdded, videosEnriched: enrichment.updated };
});

// TEMPORARY — remove after one-time purge is complete
exports.purgeNonAiVideos = onCall({
  timeoutSeconds: 540,
  memory: "512MiB",
}, async request => {
  await requireAdmin(request);
  const db = admin.firestore();

  const snap = await db.collection("curatedVideos").get();
  const toDelete = snap.docs.filter(d => {
    const { title, description } = d.data();
    return !isAiRelevant(title, description);
  });

  const BATCH_LIMIT = 400;
  for (let i = 0; i < toDelete.length; i += BATCH_LIMIT) {
    const batch = db.batch();
    toDelete.slice(i, i + BATCH_LIMIT).forEach(d => batch.delete(d.ref));
    await batch.commit();
  }

  return { scanned: snap.size, deleted: toDelete.length };
});
