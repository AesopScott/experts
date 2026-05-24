import { initializeApp, cert } from '../functions/node_modules/firebase-admin/lib/app/index.js';
import { getFirestore } from '../functions/node_modules/firebase-admin/lib/firestore/index.js';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const sa = require('../experts-d7c3d-firebase-adminsdk-fbsvc-82ace7cc5c.json');
const db = getFirestore(initializeApp({ credential: cert(sa) }));

const followed = await db.collection("followedChannels").get();
console.log("=== Followed Channels ===");
followed.docs.forEach(d => console.log(` ${d.data().channelName} | ${d.data().channelId}`));

const videos = await db.collection("curatedVideos").get();
const byChannel = {};
videos.docs.forEach(d => {
  const ch = d.data().channelName || d.data().channelId || "unknown";
  byChannel[ch] = (byChannel[ch] || 0) + 1;
});
console.log("\n=== curatedVideos by channel ===");
Object.entries(byChannel).sort().forEach(([ch, n]) => console.log(` ${ch}: ${n} video(s)`));
process.exit(0);
