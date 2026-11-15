/* Second Look — reads settings from a .env file into process.env.
 *
 * Used by server.js and scripts/run-prompt-tests.js so the API key can live in
 * one git-ignored file instead of being typed into the terminal.
 * A value already set in the terminal wins over the file.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

/** Turn the text of a .env file into { NAME: 'value' }. */
function parseEnv(text) {
  const values = {};
  for (const rawLine of String(text).split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const equals = line.indexOf('=');
    if (equals < 1) continue;
    const name = line.slice(0, equals).trim();
    let value = line.slice(equals + 1).trim();
    // Forgive quotes around the value, since many guides add them.
    if (value.length >= 2 && /^(".*"|'.*')$/.test(value)) value = value.slice(1, -1);
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) values[name] = value;
  }
  return values;
}

/** Load <project>/.env if it exists. Returns true if a file was read. */
function loadEnv(file) {
  const envFile = file || path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envFile)) return false;
  const values = parseEnv(fs.readFileSync(envFile, 'utf8'));
  for (const name of Object.keys(values)) {
    if (process.env[name] === undefined) process.env[name] = values[name];
  }
  return true;
}

module.exports = { parseEnv, loadEnv };
