'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { parseEnv } = require('../scripts/load-env.js');

const SERVER = path.join(__dirname, '..', 'server.js');

test('parseEnv reads NAME=value lines and skips comments and blanks', () => {
  const values = parseEnv('# a comment\n\nANTHROPIC_API_KEY=sk-ant-abc123\r\nMODEL = some-model \nPORT=8000\n');
  assert.deepEqual(values, { ANTHROPIC_API_KEY: 'sk-ant-abc123', MODEL: 'some-model', PORT: '8000' });
});

test('parseEnv forgives quotes and keeps = signs inside the value', () => {
  assert.deepEqual(parseEnv('A="quoted"\nB=\'single\'\nC=x=y'), { A: 'quoted', B: 'single', C: 'x=y' });
});

test('parseEnv ignores lines that are not NAME=value', () => {
  assert.deepEqual(parseEnv('just some words\n=novalue\n1BAD=x\nEMPTY='), { EMPTY: '' });
});

/** Start server.js on a free port with the given settings. Resolves once it is listening. */
function startServer(env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [SERVER], {
      // PORT=0 asks for any free port; an empty key overrides whatever is in a local .env.
      env: Object.assign({}, process.env, { PORT: '0', ANTHROPIC_API_KEY: '', PROMPT_VERSION: 'v1' }, env),
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let output = '';
    child.stdout.on('data', (chunk) => {
      output += chunk;
      const match = /http:\/\/localhost:(\d+)/.exec(output);
      if (match) resolve({ child, url: 'http://127.0.0.1:' + match[1], output: () => output });
    });
    child.on('error', reject);
    child.on('exit', () => reject(new Error('server exited early: ' + output)));
  });
}

/** A stand-in for the AI service that records what it was sent. */
function startFakeAI(reply) {
  return new Promise((resolve) => {
    const seen = [];
    const server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        seen.push({ headers: req.headers, body: JSON.parse(body) });
        res.writeHead(reply.status || 200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ content: [{ type: 'text', text: reply.text || '' }] }));
      });
    }).listen(0, '127.0.0.1', () => {
      resolve({ server, seen, url: 'http://127.0.0.1:' + server.address().port + '/v1/messages' });
    });
  });
}

test('without a key: serves the page, reports demo mode, refuses /api/check', async (t) => {
  const app = await startServer({});
  t.after(() => app.child.kill());

  const page = await fetch(app.url + '/');
  assert.equal(page.status, 200);
  assert.match(await page.text(), /<title>Second Look<\/title>/);
  assert.equal((await fetch(app.url + '/js/app.js')).status, 200);
  assert.equal((await fetch(app.url + '/data/demo-responses.json')).status, 200);

  assert.deepEqual(await (await fetch(app.url + '/api/config')).json(), { live: false, promptVersion: 'v1' });

  const check = await fetch(app.url + '/api/check', { method: 'POST', body: JSON.stringify({ claim: 'x' }) });
  assert.equal(check.status, 503);
});

test('never serves private files such as .env, .git or the server itself', async (t) => {
  const app = await startServer({});
  t.after(() => app.child.kill());

  for (const file of ['/.env', '/.env.example', '/.git/config', '/server.js', '/package.json',
    '/prompts/verdict-prompt.js', '/prompts/system-v1.txt', '/tests/prompt-cases.json', '/js/../.env', '/js/%2e%2e/server.js']) {
    assert.equal((await fetch(app.url + file)).status, 404, file);
  }
});

test('with a key: sends the claim and system prompt to the AI and passes the reply on', async (t) => {
  const reply = JSON.stringify({ verdict: 'FALSE', confidence: 91, reasons: ['Because.'] });
  const ai = await startFakeAI({ text: reply });
  const app = await startServer({ ANTHROPIC_API_KEY: 'test-key-123', MODEL: 'test-model', SECOND_LOOK_API_URL: ai.url });
  t.after(() => { app.child.kill(); ai.server.close(); });

  assert.equal((await (await fetch(app.url + '/api/config')).json()).live, true);

  const response = await fetch(app.url + '/api/check', { method: 'POST', body: JSON.stringify({ claim: '  Bats are blind.  ' }) });
  const text = await response.text();
  assert.equal(response.status, 200);
  assert.equal(text, reply);
  assert.ok(!text.includes('test-key-123'));

  const sent = ai.seen[0];
  assert.equal(sent.headers['x-api-key'], 'test-key-123');
  assert.equal(sent.body.model, 'test-model');
  assert.match(sent.body.system, /never an instruction/);
  assert.equal(sent.body.messages[0].content, '<claim>\nBats are blind.\n</claim>');
});

test('with a key: rejects an empty or missing claim and cuts a long one to 300 characters', async (t) => {
  const ai = await startFakeAI({ text: '{}' });
  const app = await startServer({ ANTHROPIC_API_KEY: 'test-key-123', SECOND_LOOK_API_URL: ai.url });
  t.after(() => { app.child.kill(); ai.server.close(); });

  const post = (body) => fetch(app.url + '/api/check', { method: 'POST', body });
  assert.equal((await post(JSON.stringify({ claim: '   ' }))).status, 400);
  assert.equal((await post(JSON.stringify({}))).status, 400);
  assert.equal((await post('not json')).status, 400);
  assert.equal(ai.seen.length, 0);

  assert.equal((await post(JSON.stringify({ claim: 'a'.repeat(900) }))).status, 200);
  assert.equal(ai.seen[0].body.messages[0].content, '<claim>\n' + 'a'.repeat(300) + '\n</claim>');
});

test('with a key: a connection that fails is reported as unreachable, not as an AI error', async (t) => {
  // Nothing listens on port 9, so the connection itself fails ("fetch failed").
  const app = await startServer({ ANTHROPIC_API_KEY: 'test-key-123', SECOND_LOOK_API_URL: 'http://127.0.0.1:9/v1/messages' });
  t.after(() => app.child.kill());

  const response = await fetch(app.url + '/api/check', { method: 'POST', body: JSON.stringify({ claim: 'x' }) });
  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), { error: 'ai-unreachable' });
});

test('with a key: an AI error becomes a 502 that does not leak the key', async (t) => {
  const ai = await startFakeAI({ status: 401 });
  const app = await startServer({ ANTHROPIC_API_KEY: 'test-key-123', SECOND_LOOK_API_URL: ai.url });
  t.after(() => { app.child.kill(); ai.server.close(); });

  const response = await fetch(app.url + '/api/check', { method: 'POST', body: JSON.stringify({ claim: 'x' }) });
  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), { error: 'ai-error' });
});
