import { initializeApp, cert } from '../functions/node_modules/firebase-admin/lib/app/index.js';
import { getAuth } from '../functions/node_modules/firebase-admin/lib/auth/index.js';
import { getFirestore } from '../functions/node_modules/firebase-admin/lib/firestore/index.js';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const serviceAccount = require('../experts-d7c3d-firebase-adminsdk-fbsvc-82ace7cc5c.json');

const app = initializeApp({ credential: cert(serviceAccount) });
const auth = getAuth(app);
const db = getFirestore(app);

const EMAIL = 'RavenShroud@gmail.com';

async function run() {
  // 1. Look up Firebase Auth user by email
  let userRecord;
  try {
    userRecord = await auth.getUserByEmail(EMAIL);
    console.log(`Found Firebase Auth user: uid=${userRecord.uid} email=${userRecord.email}`);
  } catch (err) {
    if (err.code === 'auth/user-not-found') {
      console.log(`No Firebase Auth user found for ${EMAIL} — creating one...`);
      userRecord = await auth.createUser({ email: EMAIL, displayName: 'Scott' });
      console.log(`Created Firebase Auth user: uid=${userRecord.uid}`);
    } else {
      throw err;
    }
  }

  const uid = userRecord.uid;

  // 2. Upsert the Firestore users doc with role: admin
  const userRef = db.collection('users').doc(uid);
  const snap = await userRef.get();

  if (snap.exists) {
    await userRef.update({ role: 'admin' });
    console.log(`Updated existing Firestore users/${uid} → role: "admin"`);
  } else {
    await userRef.set({
      uid,
      displayName: userRecord.displayName || 'Scott',
      email: EMAIL,
      role: 'admin',
      accountType: 'free',
      followedExperts: [],
      createdAt: new Date().toISOString(),
    });
    console.log(`Created Firestore users/${uid} with role: "admin"`);
  }

  console.log('Done. You can now sign in and access admin.html.');
  process.exit(0);
}

run().catch(err => { console.error(err); process.exit(1); });
