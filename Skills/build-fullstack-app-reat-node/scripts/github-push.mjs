#!/usr/bin/env node
// Commits the app and pushes it to a GitHub repo the USER created (empty). Uses plain git + the credentials the
// user's machine already has (Git Credential Manager); never reads or prints tokens.
//   node github-push.mjs --repo https://github.com/OWNER/NAME[.git] [--dir .] [--message "..."]
// Exit codes: 0 pushed, 1 usage/safety problem, 2 push rejected (auth) - see the printed guidance.
import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';

const args = process.argv.slice(2);
const opt = (f) => (args.includes(f) ? args[args.indexOf(f) + 1] : undefined);
const repo = opt('--repo');
const dir = path.resolve(opt('--dir') ?? '.');
const message = opt('--message') ?? 'Initial commit: app ready for deployment';

const m = repo?.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/);
if (!m) {
  console.error('Usage: github-push.mjs --repo https://github.com/OWNER/NAME [--dir .] [--message "..."]');
  process.exit(1);
}
const [, owner, name] = m;
const git = (...a) => execFileSync('git', a, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const plain = `https://github.com/${owner}/${name}.git`;

try { git('rev-parse', '--git-dir'); } catch { git('init', '-q', '-b', 'main'); console.log('git init (branch main)'); }
git('add', '-A');

// Safety: secrets must never be committed.
const tracked = git('ls-files').split('\n');
const bad = tracked.filter((f) => /(^|\/)\.env$/.test(f) || f.startsWith('node_modules/'));
if (bad.length) {
  console.error(`Refusing to push: these are tracked: ${bad.join(', ')}. Fix .gitignore and "git rm --cached" them.`);
  process.exit(1);
}

if (git('status', '--porcelain')) {
  const cfg = (k) => { try { return git('config', k); } catch { return ''; } };
  const id = [];
  if (!cfg('user.name')) id.push('-c', `user.name=${owner}`);
  if (!cfg('user.email')) id.push('-c', `user.email=${owner}@users.noreply.github.com`);
  git(...id, 'commit', '-q', '-m', `${message}\n\nCo-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`);
  console.log('committed:', git('log', '--oneline', '-1'));
} else console.log('nothing to commit');

// "OWNER@" in the URL makes Git Credential Manager pick the stored login for THAT account. Without it, it may
// reuse another GitHub account (e.g. a work login) and the push fails with 403.
const urlWithOwner = `https://${owner}@github.com/${owner}/${name}.git`;
try { git('remote', 'remove', 'origin'); } catch { /* none yet */ }
git('remote', 'add', 'origin', urlWithOwner);

const push = spawnSync('git', ['push', '-u', 'origin', 'HEAD:main'], {
  cwd: dir, encoding: 'utf8', env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }, timeout: 120_000,
});
git('remote', 'set-url', 'origin', plain); // keep the stored remote clean
if (push.status === 0) {
  console.log(`pushed to ${plain} (branch main)`);
  process.exit(0);
}
const out = `${push.stdout}${push.stderr}`;
console.error(out.split('\n').filter((l) => !/^warning:/.test(l)).join('\n').trim());
console.error(`
Push failed. Likely causes (do NOT dig through stored credentials; ask the user):
 - 403 "denied to <other-account>": a different GitHub login is cached. Ask the user to run, with the ! prefix:
     cmdkey /delete:git:https://github.com   (then re-run this script; a browser sign-in as ${owner} opens)
   or give a fine-grained token (Contents: read/write on this repo) and revoke it afterwards.
 - 404: the repo does not exist or the name is wrong. The user must create it (empty, no README).
 - non-fast-forward: the repo is not empty. Ask before force-pushing.`);
process.exit(2);
