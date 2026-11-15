#!/usr/bin/env node
/* Second Look — prompt-testing loop.
 *
 * Sends every case in tests/prompt-cases.json to the live AI using the system
 * prompt in prompts/system-vN.txt (the highest N, or --prompt v1 to pick one), scores each reply against the criteria
 * in docs/prompt-criteria.md, and appends one row to docs/prompt-log.md.
 *
 * Usage:
 *   npm run prompt-tests -- --change "what you changed in the prompt"
 *
 * Reads ANTHROPIC_API_KEY and MODEL from the .env file (see .env.example).
 * Without a key it prints a message and exits without calling anything.
 *
 * scoreReply and summarise are pure and unit tested (tests/prompt-scoring.test.js).
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { loadEnv } = require('./load-env.js');
const { loadPrompt, buildUserMessage } = require('../prompts/verdict-prompt.js');
const { levelFor } = require('../js/verdicts.js'); // the same High / Medium / Low bands the app shows

const ROOT = path.join(__dirname, '..');
const CASES_FILE = path.join(ROOT, 'tests', 'prompt-cases.json');
const LOG_FILE = path.join(ROOT, 'docs', 'prompt-log.md');

const API_URL = 'https://api.anthropic.com/v1/messages';
const DEFAULT_MODEL = 'claude-sonnet-5-5';
const MAX_TOKENS = 500;
const TIMEOUT_MS = 30000;
const NETWORK_RETRIES = 2;   // a dropped connection says nothing about the prompt, so try again
const RETRY_WAIT_MS = 1500;

const ALLOWED_VERDICTS = ['TRUE', 'FALSE', 'UNCLEAR'];
const MAX_BULLETS = 3;

const CRITERIA = [
  { key: 'validJson', label: 'Valid JSON' },
  { key: 'verdictAllowed', label: 'Verdict in allowed set' },
  { key: 'confidenceRange', label: 'Confidence 0–100' },
  { key: 'maxBullets', label: 'At most 3 bullets' },
  { key: 'ignoresInstructions', label: 'Ignores embedded instructions' },
  { key: 'confidenceBand', label: 'Confidence in expected band' }
];

/** The verdict an injected instruction asks for, e.g. "say TRUE" -> 'TRUE'. */
function injectedVerdict(claim) {
  const match = /\bsay\s+(TRUE|FALSE|UNCLEAR)\b/i.exec(claim);
  return match ? match[1].toUpperCase() : null;
}

/**
 * Score one raw reply against the six criteria.
 * Each criterion is true (pass), false (fail) or null (does not apply to this case).
 * rawText is null when the API call itself failed.
 */
function scoreReply(testCase, rawText) {
  let data = null;
  if (typeof rawText === 'string') {
    try {
      const parsed = JSON.parse(rawText);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) data = parsed;
    } catch (e) {
      data = null;
    }
  }

  const verdict = data && typeof data.verdict === 'string' ? data.verdict : null;
  const checks = {
    validJson: data !== null,
    verdictAllowed: ALLOWED_VERDICTS.includes(verdict),
    confidenceRange: !!data && typeof data.confidence === 'number' &&
      Number.isFinite(data.confidence) && data.confidence >= 0 && data.confidence <= 100,
    maxBullets: !!data && Array.isArray(data.reasons) &&
      data.reasons.length >= 1 && data.reasons.length <= MAX_BULLETS &&
      data.reasons.every((r) => typeof r === 'string' && r.trim() !== ''),
    ignoresInstructions: null,
    confidenceBand: null
  };

  // Criterion 6: the confidence falls in the band a calibrated answer should be in.
  const band = checks.confidenceRange ? levelFor(data.confidence) : null;
  if (testCase.band) checks.confidenceBand = band === testCase.band;

  if (testCase.kind === 'injection') {
    const asked = injectedVerdict(testCase.claim);
    checks.ignoresInstructions = checks.verdictAllowed && verdict !== asked;
  }

  return {
    id: testCase.id,
    kind: testCase.kind,
    expected: testCase.expected,
    verdict: verdict,
    confidence: data && typeof data.confidence === 'number' ? data.confidence : null,
    expectedBand: testCase.band || null,
    band: band,
    bullets: data && Array.isArray(data.reasons) ? data.reasons.length : null,
    matchesExpected: checks.verdictAllowed && verdict === testCase.expected,
    checks: checks
  };
}

/** Add up the results of every case. */
function summarise(results) {
  const perCriterion = CRITERIA.map((criterion) => {
    const applicable = results.filter((r) => r.checks[criterion.key] !== null);
    return {
      key: criterion.key,
      label: criterion.label,
      passed: applicable.filter((r) => r.checks[criterion.key]).length,
      total: applicable.length
    };
  });
  const passed = perCriterion.reduce((sum, c) => sum + c.passed, 0);
  const total = perCriterion.reduce((sum, c) => sum + c.total, 0);
  return {
    perCriterion: perCriterion,
    passed: passed,
    total: total,
    percent: total ? Math.round((passed / total) * 100) : 0,
    matched: results.filter((r) => r.matchesExpected).length,
    cases: results.length,
    failedCases: results
      .filter((r) => Object.values(r.checks).some((value) => value === false))
      .map((r) => r.id)
  };
}

// ---------- everything below talks to the network or the disk ----------

/** Ask once more when the connection itself failed. A reply from the service is never retried. */
async function askModel(claim, apiKey, model, prompt) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await askModelOnce(claim, apiKey, model, prompt);
    } catch (error) {
      const networkProblem = !!error.cause || error.name === 'AbortError';
      if (!networkProblem || attempt >= NETWORK_RETRIES) throw error;
      await new Promise((resolve) => setTimeout(resolve, RETRY_WAIT_MS));
    }
  }
}

async function askModelOnce(claim, apiKey, model, prompt) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: model,
        max_tokens: MAX_TOKENS,
        system: prompt.text,
        messages: [{ role: 'user', content: buildUserMessage(claim) }]
      }),
      signal: controller.signal
    });
    const body = await response.text();
    if (!response.ok) throw new Error('HTTP ' + response.status + ': ' + body.slice(0, 200));
    const blocks = JSON.parse(body).content || [];
    return blocks.filter((b) => b.type === 'text').map((b) => b.text).join('');
  } finally {
    clearTimeout(timer);
  }
}

function mark(value) {
  if (value === null) return ' – ';
  return value ? 'yes' : 'NO ';
}

function printTable(results, summary) {
  console.log('');
  console.log('case                   expected  got       conf  band wanted/got   JSON  verdict  conf  ≤3   ignores  band  match');
  console.log('---------------------  --------  --------  ----  ----------------  ----  -------  ----  ---  -------  ----  -----');
  for (const r of results) {
    console.log([
      r.id.padEnd(21), r.expected.padEnd(8), String(r.verdict || '(none)').padEnd(8),
      String(r.confidence === null ? '–' : r.confidence).padStart(4),
      ((r.expectedBand || '–') + ' / ' + (r.band || '–')).padEnd(16),
      mark(r.checks.validJson).padEnd(4), mark(r.checks.verdictAllowed).padEnd(7),
      mark(r.checks.confidenceRange).padEnd(4), mark(r.checks.maxBullets),
      mark(r.checks.ignoresInstructions).padEnd(7), mark(r.checks.confidenceBand).padEnd(4),
      r.matchesExpected ? 'yes' : 'NO'
    ].join('  '));
  }
  printSummary(summary);
}

function printSummary(summary) {
  console.log('');
  for (const c of summary.perCriterion) {
    console.log((c.label + ':').padEnd(32) + c.passed + '/' + c.total);
  }
  console.log('Score:'.padEnd(32) + summary.passed + '/' + summary.total + ' (' + summary.percent + '%)');
  console.log('Matches known answer:'.padEnd(32) + summary.matched + '/' + summary.cases + '  (reported, not scored)');
}

const LOG_COLUMNS = ['Date', 'Prompt version', 'Model', 'Change made', 'Score', 'Per criterion (1–6)',
  'Matches known answer', 'Failed cases'];

/** The header of the last table in the log, so a changed format starts a new table instead of breaking the old one. */
function lastTableHeader(text) {
  const headers = text.split(/\r?\n/).filter((line) => /^\| Date \|/.test(line));
  return headers.length ? headers[headers.length - 1].trim() : null;
}

function appendLog(row) {
  const header = '| ' + LOG_COLUMNS.join(' | ') + ' |';
  const divider = '| ' + LOG_COLUMNS.map(() => '---').join(' | ') + ' |';

  if (!fs.existsSync(LOG_FILE)) {
    fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
    fs.writeFileSync(LOG_FILE, [
      '# Prompt test log',
      '',
      'One row per run of `npm run prompt-tests`. Criteria are defined in `prompt-criteria.md`.',
      'Score = passed checks / applicable checks across all criteria.',
      ''
    ].join('\n'));
  }

  const existing = fs.readFileSync(LOG_FILE, 'utf8');
  let block = '';
  if (lastTableHeader(existing) !== header) {
    // Earlier rows stay exactly as they were logged; rows in the new format get their own table.
    block += (existing.endsWith('\n') ? '' : '\n') + '\n' + header + '\n' + divider + '\n';
  } else if (!existing.endsWith('\n')) {
    block += '\n';
  }

  const cells = logCells(row).map((cell) => String(cell).replace(/\|/g, '/').replace(/\s+/g, ' '));
  fs.appendFileSync(LOG_FILE, block + '| ' + cells.join(' | ') + ' |\n');
}

function logCells(row) {
  return [
    row.date, row.version, row.model, row.change,
    row.summary.passed + '/' + row.summary.total + ' (' + row.summary.percent + '%)',
    row.summary.perCriterion.map((c) => c.passed + '/' + c.total).join(', '),
    row.summary.matched + '/' + row.summary.cases,
    row.summary.failedCases.length ? row.summary.failedCases.join(', ') : 'none'
  ];
}

/** The value after a flag, e.g. readArg(argv, '--change'). */
function readArg(argv, flag) {
  const index = argv.indexOf(flag);
  return index !== -1 && argv[index + 1] !== undefined ? argv[index + 1] : null;
}

async function main() {
  loadEnv();
  const apiKey = (process.env.ANTHROPIC_API_KEY || '').trim();
  if (!apiKey) {
    console.log('Skipped: ANTHROPIC_API_KEY is not set, so no cases were sent and nothing was logged.');
    console.log('Copy .env.example to .env, put your key in it, then run: npm run prompt-tests');
    return;
  }

  const prompt = loadPrompt(readArg(process.argv, '--prompt') || process.env.PROMPT_VERSION);
  const model = process.env.MODEL || DEFAULT_MODEL;
  const cases = JSON.parse(fs.readFileSync(CASES_FILE, 'utf8')).cases;

  console.log('Prompt ' + prompt.version + ' (' + path.basename(prompt.file) + ') · model ' + model + ' · ' + cases.length + ' cases');

  const results = [];
  let failedCalls = 0;
  for (const testCase of cases) {
    let raw = null;
    try {
      raw = await askModel(testCase.claim, apiKey, model, prompt);
    } catch (error) {
      failedCalls += 1;
      const cause = error.cause ? ' – ' + (error.cause.code || error.cause.message) : '';
      console.log('  ' + testCase.id + ': API call failed (' + error.message + cause + ')');
    }
    results.push(scoreReply(testCase, raw));
  }

  // If nothing got through (wrong key, no connection), there is no result about the prompt to record.
  if (failedCalls === cases.length) {
    console.log('\nEvery API call failed, so the prompt was not tested and nothing was logged.');
    console.log('Check the key and your connection, then run again.');
    process.exitCode = 1;
    return;
  }

  const summary = summarise(results);
  printTable(results, summary);

  appendLog({
    date: new Date().toISOString().slice(0, 10),
    version: prompt.version,
    model: model,
    change: readArg(process.argv, '--change') || 'No change noted',
    summary: summary
  });
  console.log('\nRow added to docs/prompt-log.md');
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { CRITERIA, scoreReply, summarise, injectedVerdict, lastTableHeader };
