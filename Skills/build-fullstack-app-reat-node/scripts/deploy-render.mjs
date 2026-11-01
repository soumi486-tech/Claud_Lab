#!/usr/bin/env node
// Creates (or reuses) a Render web service for the app, sets its env vars, waits for the deploy and checks health.
// Everything goes through the Render REST API (https://api.render.com/v1); no dashboard clicks needed.
//   node deploy-render.mjs --repo https://github.com/OWNER/NAME --name skybook --key-file PATH [--dir .]
//        [--plan free] [--region oregon] [--branch main] [--owner tea-xxxx] [--no-wait]
// The Render API key comes from --key-file (a file whose content is the key, or a line "Authorization: Bearer KEY")
// or the RENDER_API_KEY env var. It is never printed. Secrets in .env (DATABASE_URL, PGSSL) are sent to Render over
// HTTPS and never printed. BETTER_AUTH_SECRET is freshly generated for production (never the local one).
// Idempotent: if a service with --name and the same repo exists it is reused (env vars are not overwritten except
// BETTER_AUTH_URL, which is corrected to the real URL).
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const opt = (f, d) => (args.includes(f) ? args[args.indexOf(f) + 1] : d);
const repo = opt('--repo')?.replace(/\.git$/, '').replace(/\/$/, '');
const name = opt('--name');
const dir = path.resolve(opt('--dir', '.'));
const plan = opt('--plan', 'free');
const region = opt('--region', 'oregon');
const branch = opt('--branch', 'main');
const wait = !args.includes('--no-wait');
if (!repo || !name) {
  console.error('Usage: deploy-render.mjs --repo https://github.com/OWNER/NAME --name slug --key-file PATH [--dir .]');
  process.exit(1);
}

let key = process.env.RENDER_API_KEY;
const keyFile = opt('--key-file');
if (keyFile) key = fs.readFileSync(keyFile, 'utf8').match(/(rnd_[A-Za-z0-9]+)/)?.[1] ?? key;
if (!key) { console.error('No Render API key: pass --key-file or set RENDER_API_KEY.'); process.exit(1); }

const API = 'https://api.render.com/v1';
async function api(method, p, body) {
  const res = await fetch(API + p, {
    method,
    headers: { Authorization: `Bearer ${key}`, Accept: 'application/json', 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  if (!res.ok) throw new Error(`${method} ${p} -> ${res.status} ${typeof data === 'string' ? data.slice(0, 300) : JSON.stringify(data).slice(0, 300)}`);
  return data;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// .env of the app (never printed).
const envText = fs.existsSync(path.join(dir, '.env')) ? fs.readFileSync(path.join(dir, '.env'), 'utf8') : '';
const fromEnv = (k) => envText.match(new RegExp(`^\\s*${k}\\s*=\\s*(.+?)\\s*$`, 'm'))?.[1]?.replace(/^["']|["']$/g, '');

// 1. Workspace.
const owners = await api('GET', '/owners?limit=20');
const ownerId = opt('--owner') ?? owners[0]?.owner.id;
if (!ownerId) throw new Error('No Render workspace found for this API key');
if (!opt('--owner') && owners.length > 1) console.log(`note: ${owners.length} workspaces; using ${owners[0].owner.name}. Pass --owner to choose.`);

// 2. Find or create the service.
const existing = (await api('GET', `/services?name=${encodeURIComponent(name)}&limit=20`))
  .map((s) => s.service).find((s) => s.name === name && s.repo?.replace(/\.git$/, '') === repo);
let service;
if (existing) {
  service = existing;
  console.log(`reusing existing service ${service.id}`);
} else {
  const databaseUrl = fromEnv('DATABASE_URL');
  if (!databaseUrl || /USER:PASSWORD|ep-xxxx/.test(databaseUrl)) throw new Error('No real DATABASE_URL in <dir>/.env');
  const envVars = [
    { key: 'NODE_VERSION', value: '22' }, // Render's default Node moves over time; pin to match package.json engines
    { key: 'DATABASE_URL', value: databaseUrl },
    { key: 'BETTER_AUTH_SECRET', value: crypto.randomBytes(32).toString('base64') },
    { key: 'BETTER_AUTH_URL', value: `https://${name}.onrender.com` }, // corrected below if Render adds a suffix
  ];
  if (fromEnv('PGSSL')) envVars.push({ key: 'PGSSL', value: fromEnv('PGSSL') });
  const created = await api('POST', '/services', {
    type: 'web_service', name, ownerId, repo, branch, autoDeploy: 'yes', envVars,
    serviceDetails: {
      runtime: 'node', plan, region, healthCheckPath: '/api/health',
      envSpecificDetails: { buildCommand: 'npm ci --include=dev && npm run build', startCommand: 'npm start' },
    },
  });
  service = created.service;
  console.log(`created service ${service.id}`);
}
const url = service.serviceDetails?.url;
if (!url) throw new Error('Render did not return a service URL');
console.log(`url: ${url}`);

// 3. Render appends a suffix when the name is taken (skybook -> skybook-9tkc): fix BETTER_AUTH_URL to the real URL.
const vars = await api('GET', `/services/${service.id}/env-vars?limit=100`);
const current = vars.map((v) => v.envVar).find((v) => v.key === 'BETTER_AUTH_URL');
if (current?.value !== url) {
  await api('PUT', `/services/${service.id}/env-vars/BETTER_AUTH_URL`, { value: url });
  // A PUT to env-vars does NOT reliably start a deploy (FoodDash: running instance kept the guessed URL and
  // sign-up failed with INVALID_ORIGIN). Start one explicitly so the new value is actually live.
  await api('POST', `/services/${service.id}/deploys`, {});
  console.log('BETTER_AUTH_URL corrected; redeploy triggered');
  await sleep(8000);
}

// 4. Wait for the latest deploy to finish.
const TERMINAL = ['live', 'build_failed', 'update_failed', 'canceled', 'deactivated', 'pre_deploy_failed'];
if (wait) {
  let status = '';
  for (let i = 0; i < 90; i++) { // up to ~15 minutes
    const deploys = await api('GET', `/services/${service.id}/deploys?limit=1`);
    status = deploys[0]?.deploy.status ?? 'unknown';
    if (i % 3 === 0) console.log(`deploy: ${status}`);
    if (TERMINAL.includes(status)) break;
    await sleep(10_000);
  }
  if (status !== 'live') {
    console.error(`Deploy ended as "${status}". Logs: https://dashboard.render.com/web/${service.id}/logs`);
    process.exit(3);
  }

  // 5. Health check (a free instance may need a while to wake).
  let ok = false;
  for (let i = 0; i < 12 && !ok; i++) {
    try {
      const r = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(30_000) });
      ok = r.ok && (await r.json()).ok === true;
    } catch { /* still starting */ }
    if (!ok) await sleep(10_000);
  }
  console.log(ok ? `health: OK  ${url}/api/health` : 'health: FAILED (service live but /api/health not answering)');
  if (!ok) process.exit(4);
}
console.log(JSON.stringify({ serviceId: service.id, url, dashboard: `https://dashboard.render.com/web/${service.id}` }));
