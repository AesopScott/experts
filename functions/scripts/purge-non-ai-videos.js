/**
 * One-time cleanup script: deletes curatedVideos that don't pass the AI
 * relevance filter. Run with:
 *   node scripts/purge-non-ai-videos.js
 *
 * Credentials: uses application default credentials (GOOGLE_APPLICATION_CREDENTIALS
 * or gcloud auth application-default login).
 */

const admin = require("firebase-admin");

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  projectId: "experts-d7c3d",
});

const db = admin.firestore();

// ── AI relevance filter (kept in sync with functions/index.js) ─────────────────
const AI_WHOLE_WORDS = ["ai", "llm", "gpt", "rag", "llms", "gpts"];

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

// ── Main ───────────────────────────────────────────────────────────────────────
async function purge() {
  console.log("Fetching all curatedVideos…");
  const snap = await db.collection("curatedVideos").get();
  console.log(`Total videos: ${snap.size}`);

  const toDelete = snap.docs.filter(d => {
    const { title, description } = d.data();
    return !isAiRelevant(title, description);
  });

  console.log(`Videos to delete (not AI-relevant): ${toDelete.length}`);
  if (toDelete.length === 0) {
    console.log("Nothing to clean up.");
    process.exit(0);
  }

  // Preview first 10
  console.log("\nSample of videos being removed:");
  toDelete.slice(0, 10).forEach(d => console.log(`  • ${d.data().title}`));
  if (toDelete.length > 10) console.log(`  … and ${toDelete.length - 10} more`);

  // Delete in batches of 400 (Firestore batch limit is 500)
  const BATCH_SIZE = 400;
  for (let i = 0; i < toDelete.length; i += BATCH_SIZE) {
    const batch = db.batch();
    toDelete.slice(i, i + BATCH_SIZE).forEach(d => batch.delete(d.ref));
    await batch.commit();
    console.log(`\nDeleted batch ${Math.floor(i / BATCH_SIZE) + 1} (${Math.min(i + BATCH_SIZE, toDelete.length)}/${toDelete.length})`);
  }

  console.log(`\nDone. Removed ${toDelete.length} non-AI videos.`);
  process.exit(0);
}

purge().catch(err => {
  console.error("Error:", err.message);
  process.exit(1);
});
