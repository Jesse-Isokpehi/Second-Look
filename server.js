#!/usr/bin/env node
/* Second Look — local server (npm start).
 *
 * Does two jobs:
 *   1. Serves the page (index.html, css/, js/, data/).
 *   2. Keeps the API key on this side. The page sends a claim to /api/check and
 *      this server asks the AI, so the key never reaches the browser.
 *
 * With no ANTHROPIC_API_KEY in .env the page stays in demo mode.
 * No dependencies: only Node's built-in modules.
 */
'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { loadEnv } = require('./scripts/load-env.js');
const { loadPrompt, buildUserMessage } = require('./prompts/verdict-prompt.js');

loadEnv();

// Highest prompts/system-vN.txt, unless PROMPT_VERSION in .env names another.
const prompt = loadPrompt(process.env.PROMPT_VERSION);

const ROOT = __dirname;
const HOST = '127.0.0.1'; // this computer only
const PORT = Number(process.env.PORT) || 8000;
const API_KEY = (process.env.ANTHROPIC_API_KEY || '').trim();
const MODEL = process.env.MODEL || 'claude-sonnet-5-5';
// SECOND_LOOK_API_URL exists so the tests can point the server at a stand-in AI.
const API_URL = process.env.SECOND_LOOK_API_URL || 'https://api.anthropic.com/v1/messages';

const MAX_CLAIM_LENGTH = 300;
const MAX_BODY_BYTES = 4000;
const MAX_TOKENS = 500;
const UPSTREAM_TIMEOUT_MS = 12000; // shorter than the page's own 15 s timeout

// Only these are ever sent to the browser. Everything else (.env, .git, tests…) is a 404.
const PUBLIC_FILES = ['index.html'];
const PUBLIC_FOLDERS = ['css', 'js', 'data'];
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8'
};

function sendJSON(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}

function serveFile(req, res) {
  let urlPath;
  try {
    urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch (e) {
    return sendJSON(res, 400, { error: 'bad-request' });
  }
  const relative = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
  const parts = relative.split('/');
  const allowed = parts.every((part) => part && !part.startsWith('.')) &&
    (PUBLIC_FILES.includes(relative) || (parts.length > 1 && PUBLIC_FOLDERS.includes(parts[0])));
  const type = TYPES[path.extname(relative)];
  if (!allowed || !type) return sendJSON(res, 404, { error: 'not-found' });

  fs.readFile(path.join(ROOT, relative), (error, data) => {
    if (error) return sendJSON(res, 404, { error: 'not-found' });
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache' });
    res.end(data);
  });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('too-large'));
        req.destroy();
      } else {
        chunks.push(chunk);
      }
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

/** One quick second try if the connection itself failed; the page's own timeout leaves no room for more. */
async function askModel(claim) {
  try {
    return await askModelOnce(claim);
  } catch (error) {
    if (!error.cause) throw error; // the service replied, or we timed out: do not repeat
    return askModelOnce(claim);
  }
}

async function askModelOnce(claim) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: prompt.text,
        messages: [{ role: 'user', content: buildUserMessage(claim) }]
      }),
      signal: controller.signal
    });
    if (!response.ok) {
      // Keep the service's own explanation (e.g. "credit balance is too low") for the terminal.
      const detail = (await response.text()).replace(/\s+/g, ' ').slice(0, 300);
      throw new Error('the AI service replied ' + response.status + ' ' + detail);
    }
    const blocks = (await response.json()).content || [];
    return blocks.filter((b) => b.type === 'text').map((b) => b.text).join('');
  } finally {
    clearTimeout(timer);
  }
}

/** A one-line reason for the terminal. Never includes the key. */
function describeFailure(error) {
  if (error.name === 'AbortError') return 'timed out after ' + (UPSTREAM_TIMEOUT_MS / 1000) + ' seconds';
  if (error.cause) {
    // "fetch failed" means this computer could not connect at all; the cause says why.
    const cause = error.cause.code || error.cause.message || String(error.cause);
    return 'could not connect to the AI service (' + cause + '). Check your internet, VPN, firewall or antivirus.';
  }
  return error.message;
}

async function handleCheck(req, res) {
  if (!API_KEY) return sendJSON(res, 503, { error: 'no-key' });

  let claim;
  try {
    claim = JSON.parse(await readBody(req)).claim;
  } catch (e) {
    return sendJSON(res, 400, { error: 'bad-request' });
  }
  if (typeof claim !== 'string' || !claim.trim()) return sendJSON(res, 400, { error: 'bad-request' });
  claim = claim.trim().slice(0, MAX_CLAIM_LENGTH);

  try {
    const text = await askModel(claim);
    // The model's reply is passed on as text; js/verdicts.js validates it in the page.
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(text);
  } catch (error) {
    // Log the reason here; never send upstream details (or the key) to the browser.
    console.error('AI request failed:', describeFailure(error));
    // Tell the page which kind of failure it was, so its message is accurate.
    if (error.name === 'AbortError') return sendJSON(res, 504, { error: 'ai-timeout' });
    sendJSON(res, 502, { error: error.cause ? 'ai-unreachable' : 'ai-error' });
  }
}

const server = http.createServer((req, res) => {
  const route = req.url.split('?')[0];
  if (route === '/api/config' && req.method === 'GET') {
    return sendJSON(res, 200, { live: !!API_KEY, promptVersion: prompt.version });
  }
  if (route === '/api/check' && req.method === 'POST') {
    return handleCheck(req, res).catch(() => sendJSON(res, 500, { error: 'server-error' }));
  }
  if (req.method === 'GET' || req.method === 'HEAD') return serveFile(req, res);
  sendJSON(res, 405, { error: 'method-not-allowed' });
});

server.listen(PORT, HOST, () => {
  console.log('Second Look is running at http://localhost:' + server.address().port);
  console.log(API_KEY
    ? 'Live mode: claims are checked by ' + MODEL + ' (prompt ' + prompt.version + ').'
    : 'Demo mode: no ANTHROPIC_API_KEY found in .env, so answers are simulated.');
  console.log('Press Ctrl+C to stop.');
});
