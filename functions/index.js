const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");

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
  const to = submission.to || DEFAULT_TO;
  const from = submission.from || DEFAULT_FROM;

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
    }
    await batch.commit();
  }
}

exports.harvestVideos = onSchedule({
  schedule: "0 */8 * * *",
  secrets: [youtubeApiKey],
  timeoutSeconds: 300,
  memory: "256MiB",
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

exports.discoverChannels = onSchedule({
  schedule: "0 0 * * *",
  secrets: [youtubeApiKey],
  timeoutSeconds: 300,
  memory: "256MiB",
}, async () => {
  const db = admin.firestore();
  const apiKey = youtubeApiKey.value();

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
      candidates.push({
        channelId,
        channelName: item.snippet?.channelTitle || "",
        description: item.snippet?.description || "",
        thumbnailUrl: item.snippet?.thumbnails?.default?.url || "",
        discoveredAt: admin.firestore.FieldValue.serverTimestamp(),
        status: "pending",
      });
    }
  }

  if (candidates.length === 0) return;

  const operations = candidates.map(c => ({
    type: "set",
    ref: db.collection("candidateChannels").doc(c.channelId),
    data: c,
  }));
  await commitInBatches(db, operations);
});

exports.lookupChannel = onCall({
  secrets: [youtubeApiKey],
}, async request => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Must be signed in");

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
  if (!request.auth) throw new HttpsError("unauthenticated", "Must be signed in");

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

  return {
    videoId,
    title: s.title || "",
    channelName: s.channelTitle || "",
    channelId: s.channelId || "",
    publishedAt: s.publishedAt || new Date().toISOString(),
    thumbnail: s.thumbnails?.high?.url || s.thumbnails?.default?.url || "",
    link: `https://www.youtube.com/watch?v=${videoId}`,
  };
});
