#!/usr/bin/env node
// One-shot OAuth grabber for a Shopify Dev Dashboard app.
// Takes Client ID + Secret from prompts (or env), runs the OAuth dance,
// writes the resulting long-lived access token to tools/.env.
//
// Usage: npm run get-token   (from inside the tools/ directory)

import http from 'node:http';
import { randomBytes, createHmac, timingSafeEqual } from 'node:crypto';
import { writeFile, readFile } from 'node:fs/promises';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { exec } from 'node:child_process';

const SHOP = 'aywb8y-2q.myshopify.com';
const PORT = 53682;
const REDIRECT_URI = `http://localhost:${PORT}/callback`;
const SCOPES = [
  'read_products',
  'write_products',
  'read_product_listings',
  'write_product_listings',
  'read_inventory',
  'write_inventory',
  'read_files',
  'write_files',
].join(',');

const ENV_PATH = new URL('./.env', import.meta.url);

async function loadExistingEnv() {
  try {
    const raw = await readFile(ENV_PATH, 'utf8');
    const out = {};
    for (const line of raw.split('\n')) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) out[m[1]] = m[2];
    }
    return out;
  } catch {
    return {};
  }
}

async function prompt(question, fallback) {
  if (fallback) return fallback;
  const rl = createInterface({ input, output });
  const answer = (await rl.question(`${question} `)).trim();
  rl.close();
  return answer;
}

function openBrowser(url) {
  const cmd = process.platform === 'darwin' ? `open "${url}"`
    : process.platform === 'win32' ? `start "" "${url}"`
    : `xdg-open "${url}"`;
  exec(cmd, () => {});
}

function verifyHmac(query, secret) {
  // Shopify HMAC validation: remove the `hmac` field, sort the rest
  // alphabetically, build `k=v&k=v...` (no URL encoding of values),
  // HMAC-SHA256 with the client secret, compare to the hmac param.
  const provided = query.get('hmac');
  if (!provided) return false;
  const params = [];
  for (const [k, v] of [...query.entries()].sort()) {
    if (k === 'hmac' || k === 'signature') continue;
    params.push(`${k}=${v}`);
  }
  const computed = createHmac('sha256', secret).update(params.join('&')).digest('hex');
  const a = Buffer.from(provided, 'utf8');
  const b = Buffer.from(computed, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

async function main() {
  const existing = await loadExistingEnv();
  const clientId = await prompt('Shopify Client ID:', existing.SHOPIFY_CLIENT_ID);
  const clientSecret = await prompt('Shopify Client Secret (starts with shpss_):', existing.SHOPIFY_CLIENT_SECRET);

  if (!clientId || !clientSecret) {
    console.error('Missing Client ID or Secret.');
    process.exit(1);
  }

  const state = randomBytes(16).toString('hex');
  const installUrl =
    `https://${SHOP}/admin/oauth/authorize?` +
    new URLSearchParams({
      client_id: clientId,
      scope: SCOPES,
      redirect_uri: REDIRECT_URI,
      state,
      'grant_options[]': '',
    }).toString();

  console.log('\nOpening Shopify install URL in your browser...');
  console.log('If it does not open, copy this URL manually:\n');
  console.log(installUrl);
  console.log('\nWaiting for redirect to', REDIRECT_URI, '...\n');

  const codePromise = new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      const url = new URL(req.url, `http://localhost:${PORT}`);
      if (url.pathname !== '/callback') {
        res.writeHead(404).end('Not found');
        return;
      }
      const q = url.searchParams;
      if (q.get('state') !== state) {
        res.writeHead(400).end('State mismatch — possible CSRF. Abort.');
        server.close();
        reject(new Error('state mismatch'));
        return;
      }
      if (!verifyHmac(q, clientSecret)) {
        res.writeHead(400).end('HMAC verification failed.');
        server.close();
        reject(new Error('hmac failed'));
        return;
      }
      const code = q.get('code');
      if (!code) {
        res.writeHead(400).end('No code in callback');
        server.close();
        reject(new Error('no code'));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<h1>Got it.</h1><p>You can close this tab and return to the terminal.</p>');
      server.close();
      resolve(code);
    });
    server.listen(PORT);
    server.on('error', reject);
  });

  openBrowser(installUrl);
  const code = await codePromise;

  console.log('Auth code received. Exchanging for access token...');
  const tokenResp = await fetch(`https://${SHOP}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code }),
  });
  if (!tokenResp.ok) {
    const body = await tokenResp.text();
    throw new Error(`Token exchange failed: ${tokenResp.status} ${body}`);
  }
  const tokenJson = await tokenResp.json();
  const token = tokenJson.access_token;
  if (!token) throw new Error(`No access_token in response: ${JSON.stringify(tokenJson)}`);

  const envContent = [
    `SHOPIFY_SHOP=${SHOP}`,
    `SHOPIFY_CLIENT_ID=${clientId}`,
    `SHOPIFY_CLIENT_SECRET=${clientSecret}`,
    `SHOPIFY_ACCESS_TOKEN=${token}`,
    `SHOPIFY_SCOPES=${tokenJson.scope || SCOPES}`,
  ].join('\n') + '\n';
  await writeFile(ENV_PATH, envContent, { mode: 0o600 });

  console.log('\nDone. Token saved to tools/.env');
  console.log('Granted scopes:', tokenJson.scope || '(unknown)');
  console.log('Token preview:', token.slice(0, 12) + '...');
}

main().catch((err) => {
  console.error('\nFailed:', err.message);
  process.exit(1);
});
