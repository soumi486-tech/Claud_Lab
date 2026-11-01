#!/usr/bin/env node
// Copies templates/base into a target directory, replacing name tokens.
//   node scaffold.mjs --name "CourtBook" --db neon|postgres|other [--dir .] [--description "..."] [--force] [--allow-missing-url]
// --db is REQUIRED and must come from the user's answer; there is deliberately no default.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const opt = (flag) => {
  const i = args.indexOf(flag);
  return i === -1 ? undefined : args[i + 1];
};

const dbs = {
  neon: {
    label: 'Neon serverless Postgres',
    dep: '"@neondatabase/serverless": "^1.2.0",\n    ',
    env: '# Neon console -> your project -> Connect -> copy the POOLED connection string\nDATABASE_URL=postgresql://USER:PASSWORD@ep-xxxx-pooler.REGION.aws.neon.tech/neondb?sslmode=require',
    setup: '1. Create a Neon project and copy its pooled connection string.\n2. `cp .env.example .env` and set `DATABASE_URL`.',
    note: 'Neon `Pool` (node-postgres-compatible over WebSockets)',
  },
  postgres: {
    label: 'PostgreSQL',
    dep: '"pg": "^8.13.1",\n    ',
    env: '# Any Postgres connection string. Set PGSSL=true if the host requires TLS.\nDATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DBNAME\n# PGSSL=true',
    setup: '1. Have a PostgreSQL database ready (local, Docker, or managed) and its connection string.\n2. `cp .env.example .env` and set `DATABASE_URL` (add `PGSSL=true` if TLS is required).',
    note: 'node-postgres `Pool`',
  },
  other: {
    label: 'the chosen database (driver to be wired in server/db.js)',
    dep: '',
    env: '# TODO(db): connection settings for the chosen database\nDATABASE_URL=',
    setup: '1. TODO(db): document how to provision the database.\n2. `cp .env.example .env` and fill in the connection settings.',
    note: 'a custom adapter (TODO(db): implement; same exports as the Postgres variants)',
  },
};
const name = opt('--name');
const db = opt('--db');
if (!name || !db || !dbs[db]) {
  console.error('Usage: scaffold.mjs --name "App Name" --db neon|postgres|other [--dir .] [--description "..."] [--force] [--allow-missing-url]');
  if (!db || !dbs[db]) console.error('--db is required. Ask the user which database to use; never assume one.');
  process.exit(1);
}
const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'app';
const description = opt('--description') ?? `${name} - a full-stack web app.`;
const force = args.includes('--force');
const target = path.resolve(opt('--dir') ?? '.');

// The user must have supplied the connection URL explicitly for THIS app. It is read from <dir>/.env
// (never passed on the command line, so it can't leak into logs/history). Placeholders don't count.
const envText = fs.existsSync(path.join(target, '.env')) ? fs.readFileSync(path.join(target, '.env'), 'utf8') : '';
const urlLine = envText.split('\n').find((l) => /^\s*DATABASE_URL\s*=/.test(l));
const urlValue = urlLine ? urlLine.split('=').slice(1).join('=').trim().replace(/^["']|["']$/g, '') : ''; // trim() also drops a trailing \r
const isPlaceholder = !urlValue || /USER:PASSWORD|HOST:|ep-xxxx|<.*>/i.test(urlValue);
if (isPlaceholder && !args.includes('--allow-missing-url')) {
  console.error(`No real DATABASE_URL found in ${path.join(target, '.env')}.`);
  console.error('Ask the user for the database connection URL (every new app, no reuse from other projects/notes),');
  console.error('write it to that .env only, then re-run. Use --allow-missing-url ONLY if the user explicitly said');
  console.error('they have no URL yet.');
  process.exit(1);
}

const source = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../templates/base');
// Dotfiles are stored with an underscore prefix so tools don't treat them as live config.
const renames = { _gitignore: '.gitignore', _dockerignore: '.dockerignore', '_env.example': '.env.example' };
const tokens = {
  __APP_NAME__: name,
  __APP_SLUG__: slug,
  __APP_DESCRIPTION__: description,
  __DB_LABEL__: dbs[db].label,
  __DB_DEPENDENCY__: dbs[db].dep,
  __DB_ENV_HINT__: dbs[db].env,
  __DB_SETUP__: dbs[db].setup,
  __DB_DRIVER_NOTE__: dbs[db].note,
};

const created = [];
const skipped = [];

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, entry.name);
    const dest = path.join(to, renames[entry.name] ?? entry.name);
    if (entry.isDirectory()) {
      copyDir(src, dest);
    } else if (fs.existsSync(dest) && !force) {
      skipped.push(path.relative(target, dest));
    } else {
      let text = fs.readFileSync(src, 'utf8');
      for (const [token, value] of Object.entries(tokens)) text = text.split(token).join(value);
      fs.writeFileSync(dest, text);
      created.push(path.relative(target, dest));
    }
  }
}

copyDir(source, target);
// The db adapter is chosen by --db; it lives outside templates/base so no default database is baked in.
const dbSrc = path.join(path.dirname(source), 'db', db, 'db.js');
const dbDest = path.join(target, 'server', 'db.js');
if (fs.existsSync(dbDest) && !force) skipped.push(path.relative(target, dbDest));
else {
  fs.writeFileSync(dbDest, fs.readFileSync(dbSrc, 'utf8'));
  created.push(path.relative(target, dbDest));
}

// Better Auth needs a signing secret. Generate one into <dir>/.env (never printed) unless the user already set one.
const envPath = path.join(target, '.env');
const currentEnv = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
let secretNote = 'BETTER_AUTH_SECRET already present in .env (kept).';
if (!/^\s*BETTER_AUTH_SECRET\s*=\s*\S/m.test(currentEnv)) {
  const sep = currentEnv && !currentEnv.endsWith('\n') ? '\n' : '';
  fs.appendFileSync(envPath, `${sep}BETTER_AUTH_SECRET=${crypto.randomBytes(32).toString('base64')}\n`);
  secretNote = 'Generated BETTER_AUTH_SECRET into .env (value not shown).';
}

console.log(`Scaffolded "${name}" (${slug}, db: ${db}) in ${target}`);
console.log(`Created ${created.length} files:\n  ${created.join('\n  ')}`);
if (skipped.length) console.log(`Skipped ${skipped.length} existing files (use --force to overwrite):\n  ${skipped.join('\n  ')}`);
console.log(`\nAuth: Better Auth (email + password) is included. ${secretNote}`);
console.log('\nNext: npm install, then build the domain (schema.js, seed.js, api.js, client.js, pages).');
