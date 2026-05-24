/**
 * remove-channel.mjs
 * Removes a channel (by name fragment) from followedChannels and candidateChannels,
 * and deletes all its videos from curatedVideos.
 *
 * Usage: node scripts/remove-channel.mjs <name-fragment>
 * Example: node scripts/remove-channel.mjs 3blue1brown
 */

import { initializeApp, cert } from '../functions/node_modules/firebase-admin/lib/app/index.js';
import { getFirestore } from '../functions/node_modules/firebase-admin/lib/firestore/index.js';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const sa = require('../experts-d7c3d-firebase-adminsdk-fbsvc-82ace7cc5c.json');

const app = initializeApp({ credential: cert(sa) });
const db = getFirestore(app);

const fragment = (process.argv[2] || "").toLowerCase();
if (!fragment) {
  console.error("Usage: node scripts/remove-channel.mjs <name-fragment>");
  process.exit(1);
}

async function deleteInBatches(refs) {
  const CHUNK = 400;
  for (let i = 0; i < refs.length; i += CHUNK) {
    const batch = db.batch();
    refs.slice(i, i + CHUNK).forEach(ref => batch.delete(ref));
    await batch.commit();
  }
}

async function run() {
  const channelIds = new Set();

  // --- followedChannels ---
  const followedSnap = await db.collection("followedChannels").get();
  const followedMatches = followedSnap.docs.filter(d =>
    (d.data().channelName || "").toLowerCase().includes(fragment)
  );
  if (followedMatches.length === 0) {
    console.log("No matching channel found in followedChannels.");
  } else {
    for (const d of followedMatches) {
      console.log(`Removing from followedChannels: ${d.data().channelName} (${d.id})`);
      channelIds.add(d.data().channelId || d.id);
    }
    await deleteInBatches(followedMatches.map(d => d.ref));
  }

  // --- candidateChannels ---
  const candidateSnap = await db.collection("candidateChannels").get();
  const candidateMatches = candidateSnap.docs.filter(d =>
    (d.data().channelName || "").toLowerCase().includes(fragment)
  );
  if (candidateMatches.length > 0) {
    for (const d of candidateMatches) {
      console.log(`Removing from candidateChannels: ${d.data().channelName} (${d.id})`);
      channelIds.add(d.data().channelId || d.id);
    }
    await deleteInBatches(candidateMatches.map(d => d.ref));
  }

  // --- curatedVideos (by channelId and channelName) ---
  // Also search by channelName to catch videos from channels no longer in followedChannels.
  const videoNameSnap = await db.collection("curatedVideos")
    .where("channelName", ">=", fragment)
    .get();
  const nameMatches = videoNameSnap.docs.filter(d =>
    (d.data().channelName || "").toLowerCase().includes(fragment)
  );
  if (nameMatches.length > 0) {
    for (const d of nameMatches) channelIds.add(d.data().channelId);
  }

  if (channelIds.size === 0 && nameMatches.length === 0) {
    console.log("No channel IDs found — skipping curatedVideos cleanup.");
    process.exit(0);
  }

  let videoCount = 0;
  for (const channelId of channelIds) {
    const videoSnap = await db.collection("curatedVideos")
      .where("channelId", "==", channelId)
      .get();
    if (videoSnap.empty) {
      console.log(`No videos found for channelId ${channelId}.`);
      continue;
    }
    console.log(`Deleting ${videoSnap.size} video(s) for channelId ${channelId}…`);
    await deleteInBatches(videoSnap.docs.map(d => d.ref));
    videoCount += videoSnap.size;
  }

  console.log(`Done. Removed ${followedMatches.length} followed, ${candidateMatches.length} candidate, ${videoCount} video doc(s).`);
  process.exit(0);
}

run().catch(err => { console.error(err); process.exit(1); });
