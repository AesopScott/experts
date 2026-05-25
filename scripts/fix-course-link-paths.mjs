/**
 * fix-course-link-paths.mjs
 * One-time migration: repair V1 Aesop course links that were stored without the
 * `/modules/` directory.
 *
 * The catalog API (catalog.php) was emitting V1 course URLs as
 *   https://aesopacademy.org/ai-academy/electives-hub.html?course={id}
 * instead of the correct
 *   https://aesopacademy.org/ai-academy/modules/electives-hub.html?course={id}
 *
 * catalog.php is now fixed, so future syncs are clean — but links already stored
 * in Firestore (videoCourseMappings + the cached catalog) still point at the
 * broken path. This script rewrites those existing links in place.
 *
 * Usage:
 *   node scripts/fix-course-link-paths.mjs            # dry run (reports, writes nothing)
 *   node scripts/fix-course-link-paths.mjs --apply    # apply the fixes
 */

import { initializeApp, cert } from '../functions/node_modules/firebase-admin/lib/app/index.js';
import { getFirestore } from '../functions/node_modules/firebase-admin/lib/firestore/index.js';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const sa = require('../experts-d7c3d-firebase-adminsdk-fbsvc-82ace7cc5c.json');

const app = initializeApp({ credential: cert(sa) });
const db = getFirestore(app);

const APPLY = process.argv.includes('--apply');

/**
 * Insert the missing `/modules/` directory into a V1 elective course URL.
 * Idempotent: a URL that already contains `/ai-academy/modules/` is left untouched,
 * and non-Aesop / non-elective URLs (e.g. `/courses/{id}/`) are not modified.
 */
function fixCourseUrl(url) {
  if (typeof url !== 'string') return url;
  return url.replace(
    /(https?:\/\/[^/]*aesopacademy\.org\/ai-academy\/)(electives-hub\.html)/g,
    '$1modules/$2'
  );
}

function fixCourses(courses) {
  if (!Array.isArray(courses)) return { courses, changed: 0 };
  let changed = 0;
  const next = courses.map(course => {
    const fixedUrl = fixCourseUrl(course?.url);
    if (fixedUrl !== course?.url) {
      changed += 1;
      return { ...course, url: fixedUrl };
    }
    return course;
  });
  return { courses: next, changed };
}

async function fixVideoCourseMappings() {
  const snap = await db.collection('videoCourseMappings').get();
  let docsChanged = 0;
  let linksChanged = 0;
  const writes = [];

  for (const docSnap of snap.docs) {
    const { courses, changed } = fixCourses(docSnap.data().courses);
    if (changed === 0) continue;

    docsChanged += 1;
    linksChanged += changed;
    console.log(`  ${docSnap.id}: ${changed} link(s) repaired`);
    if (APPLY) writes.push({ ref: docSnap.ref, courses });
  }

  if (APPLY && writes.length) {
    const CHUNK = 400;
    for (let i = 0; i < writes.length; i += CHUNK) {
      const batch = db.batch();
      writes.slice(i, i + CHUNK).forEach(({ ref, courses }) =>
        batch.update(ref, { courses })
      );
      await batch.commit();
    }
  }

  console.log(`videoCourseMappings: ${docsChanged} doc(s), ${linksChanged} link(s) ${APPLY ? 'repaired' : 'would be repaired'}.`);
}

async function fixCatalogCache() {
  const ref = db.collection('_cache').doc('aesop-catalog-cache');
  const snap = await ref.get();
  if (!snap.exists) {
    console.log('catalog cache: no cached catalog present — skipping.');
    return;
  }

  const data = snap.data();
  const { courses, changed } = fixCourses(data?.catalog?.courses);
  if (changed === 0) {
    console.log('catalog cache: no broken links found.');
    return;
  }

  console.log(`catalog cache: ${changed} link(s) ${APPLY ? 'repaired' : 'would be repaired'}.`);
  if (APPLY) {
    await ref.update({ 'catalog.courses': courses });
  }
}

async function run() {
  console.log(APPLY ? 'Applying fixes…\n' : 'DRY RUN (no writes). Re-run with --apply to write.\n');
  await fixVideoCourseMappings();
  await fixCatalogCache();
  console.log('\nDone.');
  process.exit(0);
}

run().catch(err => { console.error(err); process.exit(1); });
