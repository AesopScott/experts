import { execSync } from "node:child_process";
import { setTimeout as wait } from "node:timers/promises";
import { YoutubeTranscript } from "../functions/node_modules/youtube-transcript/dist/esm/index.js";

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || "experts-d7c3d";
const DATABASE = "(default)";
const API_ROOT = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/${DATABASE}/documents`;
const COLLECTION = "curatedVideos";
const TRANSCRIPT_COLLECTION = "videoTranscripts";
const TRANSCRIPT_LIMIT = Number(process.env.TRANSCRIPT_BACKFILL_LIMIT || "0");
const CONCURRENCY = Math.max(1, Number(process.env.TRANSCRIPT_BACKFILL_CONCURRENCY || "3"));
const MAX_AGE_DAYS = Math.max(1, Number(process.env.TRANSCRIPT_BACKFILL_MAX_AGE_DAYS || "30"));
const DRY_RUN = process.argv.includes("--dry-run");
const cutoffMs = Date.now() - (MAX_AGE_DAYS * 24 * 60 * 60 * 1000);

function token() {
  return execSync("gcloud auth print-access-token", { encoding: "utf8" }).trim();
}

let accessToken = token();
let tokenUses = 0;

function authHeaders(extra = {}) {
  tokenUses++;
  if (tokenUses > 80) {
    accessToken = token();
    tokenUses = 0;
  }
  return {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

async function firestoreFetch(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: authHeaders(options.headers || {}),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${options.method || "GET"} ${url} failed ${res.status}: ${body.slice(0, 600)}`);
  }
  return res.status === 204 ? null : res.json();
}

function fromValue(value) {
  if (!value) return undefined;
  if ("stringValue" in value) return value.stringValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return Number(value.doubleValue);
  if ("booleanValue" in value) return value.booleanValue;
  if ("timestampValue" in value) return value.timestampValue;
  if ("nullValue" in value) return null;
  if ("arrayValue" in value) return (value.arrayValue.values || []).map(fromValue);
  if ("mapValue" in value) return Object.fromEntries(
    Object.entries(value.mapValue.fields || {}).map(([k, v]) => [k, fromValue(v)])
  );
  return undefined;
}

function toValue(value) {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "number" && Number.isInteger(value)) return { integerValue: String(value) };
  if (typeof value === "number") return { doubleValue: value };
  if (typeof value === "boolean") return { booleanValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(toValue) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([k, v]) => [k, toValue(v)])) } };
}

function docData(doc) {
  return Object.fromEntries(
    Object.entries(doc.fields || {}).map(([key, value]) => [key, fromValue(value)])
  );
}

function hasText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function buildTranscriptSummary(transcript, title = "") {
  const normalized = String(transcript || "")
    .replace(/\[[^\]]+\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

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

async function fetchTranscript(videoId) {
  try {
    const segments = await Promise.race([
      YoutubeTranscript.fetchTranscript(videoId, { lang: "en" }),
      wait(10000).then(() => { throw new Error("Timeout after 10000ms"); }),
    ]);
    const text = segments?.map(s => s.text).join(" ").replace(/\s+/g, " ").trim();
    if (text) return text.slice(0, 100000);
  } catch {}

  try {
    const segments = await Promise.race([
      YoutubeTranscript.fetchTranscript(videoId),
      wait(10000).then(() => { throw new Error("Timeout after 10000ms"); }),
    ]);
    const text = segments?.map(s => s.text).join(" ").replace(/\s+/g, " ").trim();
    if (text) return text.slice(0, 100000);
  } catch {}

  return null;
}

async function listCuratedVideos() {
  const docs = [];
  let pageToken = "";
  do {
    const url = new URL(`${API_ROOT}/${COLLECTION}`);
    url.searchParams.set("pageSize", "300");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const data = await firestoreFetch(url);
    docs.push(...(data.documents || []));
    pageToken = data.nextPageToken || "";
  } while (pageToken);
  return docs;
}

function needsProcessing(data) {
  if (data.transcriptProcessedAt || data.transcriptStatus || data.transcriptRecordPath) return false;
  return !hasText(data.transcript);
}

function publishedTime(data) {
  const value = data.publishedAt || data.addedAt || "";
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : 0;
}

function isRecent(data) {
  const time = publishedTime(data);
  return time > 0 && time >= cutoffMs;
}

async function patchCuratedVideo(videoId, fields) {
  const url = new URL(`${API_ROOT}/${COLLECTION}/${videoId}`);
  for (const key of Object.keys(fields)) url.searchParams.append("updateMask.fieldPaths", key);
  url.searchParams.set("currentDocument.exists", "true");
  return firestoreFetch(url, {
    method: "PATCH",
    body: JSON.stringify({ fields: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, toValue(v)])) }),
  });
}

async function setTranscriptRecord(videoId, fields) {
  return firestoreFetch(`${API_ROOT}/${TRANSCRIPT_COLLECTION}/${videoId}`, {
    method: "PATCH",
    body: JSON.stringify({ fields: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, toValue(v)])) }),
  });
}

async function processVideo(item) {
  const { videoId, data } = item;
  const transcript = await fetchTranscript(videoId);
  const now = new Date().toISOString();

  if (!transcript) {
    if (!DRY_RUN) {
      await patchCuratedVideo(videoId, {
        transcript: null,
        transcriptStatus: "unavailable",
        transcriptProcessedAt: now,
        transcriptSummaryStatus: "unavailable",
      });
    }
    return { status: "unavailable", videoId };
  }

  const summary = buildTranscriptSummary(transcript, data.title);
  const recordPath = `${TRANSCRIPT_COLLECTION}/${videoId}`;
  const transcriptRecord = {
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
  const curatedPatch = {
    transcript,
    transcriptStatus: "available",
    transcriptProcessedAt: now,
    transcriptSummary: summary,
    transcriptSummaryStatus: "available",
    transcriptRecordPath: recordPath,
    transcriptSummaryUpdatedAt: now,
  };

  if (!DRY_RUN) {
    await setTranscriptRecord(videoId, transcriptRecord);
    await patchCuratedVideo(videoId, curatedPatch);
  }

  return { status: "available", videoId, chars: transcript.length };
}

async function runPool(items) {
  const results = { available: 0, unavailable: 0, failed: 0 };
  let next = 0;

  async function worker(id) {
    while (next < items.length) {
      const item = items[next++];
      try {
        const result = await processVideo(item);
        results[result.status]++;
        const done = results.available + results.unavailable + results.failed;
        if (done % 10 === 0 || done === items.length) {
          console.log(`[${done}/${items.length}] available=${results.available} unavailable=${results.unavailable} failed=${results.failed}`);
        }
      } catch (err) {
        results.failed++;
        console.warn(`[worker ${id}] ${item.videoId} failed: ${err.message}`);
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, (_, i) => worker(i + 1)));
  return results;
}

const docs = await listCuratedVideos();
const candidates = docs
  .map(doc => ({ videoId: doc.name.split("/").pop(), data: docData(doc) }))
  .filter(({ data }) => isRecent(data))
  .filter(({ data }) => needsProcessing(data))
  .sort((a, b) => publishedTime(b.data) - publishedTime(a.data));
const selected = TRANSCRIPT_LIMIT > 0 ? candidates.slice(0, TRANSCRIPT_LIMIT) : candidates;

console.log(`curatedVideos=${docs.length}`);
console.log(`maxAgeDays=${MAX_AGE_DAYS}`);
console.log(`needsTranscriptProcessing=${candidates.length}`);
console.log(`selected=${selected.length}`);
console.log(`concurrency=${CONCURRENCY}`);
console.log(`dryRun=${DRY_RUN}`);

if (selected.length === 0) process.exit(0);

const results = await runPool(selected);
console.log(`done available=${results.available} unavailable=${results.unavailable} failed=${results.failed}`);
