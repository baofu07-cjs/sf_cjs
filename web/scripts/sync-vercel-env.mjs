/**
 * One-off: push .env.local to Vercel Production (--force overwrite).
 * Run: node scripts/sync-vercel-env.mjs
 */
import { readFileSync } from 'fs';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const envPath = join(root, '.env.local');
const prodUrl = 'https://sf-cjs.vercel.app';
const sensitive = new Set(['SUPABASE_SERVICE_ROLE_KEY', 'MQTT_PASSWORD']);

const text = readFileSync(envPath, 'utf8');
for (const line of text.split(/\r?\n/)) {
  const t = line.trim();
  if (!t || t.startsWith('#')) continue;
  const i = t.indexOf('=');
  if (i < 0) continue;
  const name = t.slice(0, i).trim();
  let value = t.slice(i + 1).trim();
  if (!name) continue;
  if (name === 'NEXT_PUBLIC_APP_URL') value = prodUrl;

  const args = ['vercel', 'env', 'add', name, 'production', '--value', value, '--yes', '--force'];
  if (sensitive.has(name)) args.splice(4, 0, '--sensitive');
  const r = spawnSync('npx', args, { cwd: root, stdio: 'inherit', shell: true });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

const siteArgs = ['vercel', 'env', 'add', 'NEXT_PUBLIC_SITE_URL', 'production', '--value', prodUrl, '--yes', '--force'];
const r2 = spawnSync('npx', siteArgs, { cwd: root, stdio: 'inherit', shell: true });
if (r2.status !== 0) process.exit(r2.status ?? 1);
console.log('Done. Run: npx vercel env list production');
