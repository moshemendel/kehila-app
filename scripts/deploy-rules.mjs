/**
 * Deploys firestore.rules and storage.rules via the Firebase Rules REST API —
 * no firebase-tools needed. Auth: scripts/serviceAccount.json.
 *
 *   node scripts/deploy-rules.mjs            # both
 *   node scripts/deploy-rules.mjs firestore  # one of: firestore | storage
 *   node scripts/deploy-rules.mjs --check    # compile only, release nothing
 *
 * Steps per target: create ruleset (server-side syntax validation happens here)
 * → point that service's release at it.
 *
 * --check stops after the first step. The created ruleset is an unreleased
 * draft, so it changes nothing live — worth running before a deploy, because
 * step 2 is the irreversible half and a rules file that fails to compile fails
 * closed: every client request becomes permission-denied at once.
 *
 * storage.rules was left out of this script for a long time and drifted years
 * behind firestore.rules as a result. Deploying one without the other is how
 * a role model ends up enforced in the database and not in the bucket.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { GoogleAuth } from 'google-auth-library';

const root      = join(dirname(fileURLToPath(import.meta.url)), '..');
const projectId = 'kehila-app-386ab';
const API       = 'https://firebaserules.googleapis.com/v1';

const auth = new GoogleAuth({
  keyFile: join(root, 'scripts', 'serviceAccount.json'),
  scopes: ['https://www.googleapis.com/auth/firebase', 'https://www.googleapis.com/auth/cloud-platform'],
});

async function call(method, path, body) {
  const client  = await auth.getClient();
  const { token } = await client.getAccessToken();
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${JSON.stringify(json.error ?? json)}`);
  return json;
}

// The release id is the service's own, not a name we pick: Firestore has
// exactly one, Storage has one PER BUCKET and the bucket is part of the id.
const TARGETS = {
  firestore: { file: 'firestore.rules', releaseId: 'cloud.firestore' },
  storage:   { file: 'storage.rules',
               releaseId: 'firebase.storage/kehila-app-386ab.firebasestorage.app' },
};

async function deploy(file, releaseId, checkOnly) {
  const content = readFileSync(join(root, file), 'utf8');

  // 1. Create ruleset — the API rejects this with a compile error list if the
  //    rules source is invalid, so this doubles as validation.
  const ruleset = await call('POST', `/projects/${projectId}/rulesets`, {
    source: { files: [{ name: file, content }] },
  });

  if (checkOnly) {
    console.log(`[${file}] compiles — draft ${ruleset.name.split('/').pop()}, not released`);
    return;
  }
  console.log(`[${file}] ruleset created: ${ruleset.name}`);

  // 2. Point the release at the new ruleset (PATCH updates the existing release).
  const releaseName = `projects/${projectId}/releases/${releaseId}`;
  await call('PATCH', `/${releaseName}`, {
    release: { name: releaseName, rulesetName: ruleset.name },
  });
  console.log(`[${file}] release ${releaseId} now live on ${ruleset.name}`);
}

const args      = process.argv.slice(2);
const checkOnly = args.includes('--check');
const named     = args.filter((a) => !a.startsWith('--'));
const chosen    = named.length ? named : Object.keys(TARGETS);

for (const name of chosen) {
  if (!TARGETS[name]) {
    console.error(`unknown target "${name}" — expected one of: ${Object.keys(TARGETS).join(', ')}`);
    process.exit(1);
  }
}
for (const name of chosen) {
  const { file, releaseId } = TARGETS[name];
  await deploy(file, releaseId, checkOnly);
}
console.log(checkOnly ? '✔ Compile check passed — nothing released' : '✔ Deploy complete');
