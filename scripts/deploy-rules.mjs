/**
 * Deploys firestore.rules (and optionally storage.rules) via the Firebase
 * Rules REST API — no firebase-tools needed. Auth: scripts/serviceAccount.json.
 *
 *   node scripts/deploy-rules.mjs
 *
 * Steps: create ruleset (server-side syntax validation happens here) →
 * point the cloud.firestore release at it.
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

async function deploy(file, releaseId) {
  const content = readFileSync(join(root, file), 'utf8');

  // 1. Create ruleset — the API rejects this with a compile error list if the
  //    rules source is invalid, so this doubles as validation.
  const ruleset = await call('POST', `/projects/${projectId}/rulesets`, {
    source: { files: [{ name: file, content }] },
  });
  console.log(`[${file}] ruleset created: ${ruleset.name}`);

  // 2. Point the release at the new ruleset (PATCH updates the existing release).
  const releaseName = `projects/${projectId}/releases/${releaseId}`;
  await call('PATCH', `/${releaseName}`, {
    release: { name: releaseName, rulesetName: ruleset.name },
  });
  console.log(`[${file}] release ${releaseId} now live on ${ruleset.name}`);
}

await deploy('firestore.rules', 'cloud.firestore');
console.log('✔ Deploy complete');
