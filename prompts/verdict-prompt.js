/* Second Look — loads the system prompt sent to the AI in live mode.
 *
 * The prompt text itself lives in a plain text file, one file per version:
 *   prompts/system-v1.txt, prompts/system-v2.txt, ...
 *
 * To try a new prompt: copy the latest file to the next number and edit the copy.
 * The highest version is used automatically by the server and by the prompt
 * tests (scripts/run-prompt-tests.js), and its version is written to
 * docs/prompt-log.md. To use an older one, set PROMPT_VERSION=v1 in .env or
 * pass --prompt v1 to the prompt tests.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const PROMPT_DIR = __dirname;
const FILE_PATTERN = /^system-v(\d+)\.txt$/;

/** Every prompt version on disk, lowest first, e.g. ['v1', 'v2']. */
function listVersions(dir) {
  return fs.readdirSync(dir || PROMPT_DIR)
    .map((name) => FILE_PATTERN.exec(name))
    .filter(Boolean)
    .map((match) => Number(match[1]))
    .sort((a, b) => a - b)
    .map((number) => 'v' + number);
}

/**
 * Load one prompt version. With no version, loads the highest one.
 * Returns { version, text, file }.
 */
function loadPrompt(version, dir) {
  const folder = dir || PROMPT_DIR;
  const versions = listVersions(folder);
  if (!versions.length) throw new Error('No prompt files found in ' + folder + ' (expected system-v1.txt).');

  const wanted = version ? String(version).trim().toLowerCase() : versions[versions.length - 1];
  if (!versions.includes(wanted)) {
    throw new Error('Prompt version "' + wanted + '" not found. Available: ' + versions.join(', ') + '.');
  }

  const file = path.join(folder, 'system-' + wanted + '.txt');
  // Line endings are normalised so the same file gives the same prompt on Windows and elsewhere.
  const text = fs.readFileSync(file, 'utf8').replace(/^﻿/, '').replace(/\r\n/g, '\n').trim();
  if (!text) throw new Error(file + ' is empty.');
  return { version: wanted, text: text, file: file };
}

/** Wrap the pasted text so the model can tell it apart from its instructions. */
function buildUserMessage(claim) {
  return '<claim>\n' + String(claim) + '\n</claim>';
}

module.exports = { listVersions, loadPrompt, buildUserMessage };
