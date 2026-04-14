#!/usr/bin/env node

import { Command } from 'commander';
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';
import { markdownTable } from 'markdown-table';
import fs from 'node:fs/promises';
import path from 'node:path';
import { stdin as input, stdout as output } from 'node:process';
import readline from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';
import AffectEngineClient from '../../app/src/services/affect-engine/AffectEngineClient.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Minimal browser shims required by AffectEngineClient when used in Node.
 */
function installNodeCompatibilityShims() {
  if (typeof globalThis.WebSocket === 'undefined') {
    globalThis.WebSocket = WebSocket;
  }

  if (typeof globalThis.window === 'undefined') {
    globalThis.window = {
      setTimeout,
      clearTimeout,
      location: {
        protocol: 'http:',
      },
    };
  } else {
    if (typeof globalThis.window.setTimeout !== 'function') {
      globalThis.window.setTimeout = setTimeout;
    }
    if (typeof globalThis.window.clearTimeout !== 'function') {
      globalThis.window.clearTimeout = clearTimeout;
    }
    if (!globalThis.window.location || typeof globalThis.window.location.protocol !== 'string') {
      globalThis.window.location = { protocol: 'http:' };
    }
  }
}

/**
 * Resolve file path from:
 * 1. absolute path
 * 2. cwd-relative path
 * 3. script-relative path
 *
 * @param {string} inputPath
 * @returns {Promise<string>}
 */
async function resolveInputPath(inputPath) {
  if (path.isAbsolute(inputPath)) {
    return inputPath;
  }

  const cwdPath = path.resolve(process.cwd(), inputPath);
  try {
    await fs.access(cwdPath);
    return cwdPath;
  } catch {}

  const scriptPath = path.resolve(__dirname, inputPath);
  try {
    await fs.access(scriptPath);
    return scriptPath;
  } catch {}

  throw new Error(`File not found: ${inputPath}`);
}

/**
 * Parse a range string like "0,1" into [min, max].
 *
 * @param {string | undefined} value
 * @returns {{ min: number, max: number } | null}
 */
function parseRange(value) {
  if (!value) {
    return null;
  }

  const parts = value.split(',').map((x) => x.trim());
  if (parts.length !== 2) {
    throw new Error(`Invalid --range value "${value}". Expected format: min,max`);
  }

  const min = Number(parts[0]);
  const max = Number(parts[1]);

  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    throw new Error(`Invalid --range value "${value}". Both min and max must be numbers.`);
  }

  if (min === max) {
    throw new Error(`Invalid --range value "${value}". min and max must be different.`);
  }

  return { min, max };
}

/**
 * Read text inputs from a file.
 * - If .csv: expects a "text" column
 * - Otherwise: reads non-empty lines
 *
 * @param {string} filepath
 * @returns {Promise<string[]>}
 */
async function readInputsFromFile(filepath) {
  const resolvedPath = await resolveInputPath(filepath);
  const content = await fs.readFile(resolvedPath, 'utf8');
  const ext = path.extname(resolvedPath).toLowerCase();

  if (ext === '.csv') {
    const records = parse(content, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });

    if (records.length === 0) {
      return [];
    }

    if (!Object.hasOwn(records[0], 'text')) {
      throw new Error(`CSV file "${filepath}" must contain a "text" column.`);
    }

    return records
      .map((row) => row.text)
      .filter((value) => typeof value === 'string')
      .map((value) => value.trim())
      .filter(Boolean);
  }

  return content
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
}

/**
 * @param {number | null | undefined} value
 * @returns {string}
 */
function formatMaybeNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(4) : '';
}

/**
 * Normalize the affect_result payload into a tabular row.
 *
 * Expected input shape:
 * {
 *   id,
 *   type: "affect_result",
 *   data: {
 *     text,
 *     range,
 *     values: { valence, arousal, dominance },
 *     publicState?,
 *     signals?
 *   }
 * }
 *
 * @param {any} response
 * @returns {Record<string, string | number | null>}
 */
function responseToRow(response) {
  const text = response?.data?.text ?? '';
  const range = response?.data?.range ?? null;
  const values = response?.data?.values ?? {};
  const publicState = response?.data?.publicState ?? {};
  const signals = response?.data?.signals ?? {};

  return {
    text,
    min: range?.min ?? null,
    max: range?.max ?? null,
    valence: typeof values.valence === 'number' ? values.valence : null,
    arousal: typeof values.arousal === 'number' ? values.arousal : null,
    dominance: typeof values.dominance === 'number' ? values.dominance : null,
    regime: typeof publicState.regime === 'string' ? publicState.regime : '',
    load: typeof signals.load === 'number' ? signals.load : null,
    peace: typeof signals.peace === 'number' ? signals.peace : null,
    vigilance: typeof signals.vigilance === 'number' ? signals.vigilance : null,
  };
}

/**
 * @param {Array<Record<string, string | number | null>>} rows
 * @param {{ min: number, max: number } | null} range
 * @returns {string[]}
 */
function getColumns(rows, range) {
  void rows;

  if (range) {
    return [
      'text',
      'min',
      'max',
      'valence',
      'arousal',
      'dominance',
      'regime',
      'load',
      'peace',
      'vigilance',
    ];
  }

  return ['text', 'valence', 'arousal', 'dominance', 'regime', 'load', 'peace', 'vigilance'];
}

/**
 * Print rows as a markdown table.
 *
 * @param {Array<Record<string, string | number | null>>} rows
 * @param {{ min: number, max: number } | null} range
 */
function printMarkdownTable(rows, range) {
  const header = getColumns(rows, range);

  const body = rows.map((row) =>
    range
      ? [
          String(row.text ?? ''),
          String(row.min ?? ''),
          String(row.max ?? ''),
          formatMaybeNumber(Number(row.valence)),
          formatMaybeNumber(Number(row.arousal)),
          formatMaybeNumber(Number(row.dominance)),
          String(row.regime ?? ''),
          formatMaybeNumber(Number(row.load)),
          formatMaybeNumber(Number(row.peace)),
          formatMaybeNumber(Number(row.vigilance)),
        ]
      : [
          String(row.text ?? ''),
          formatMaybeNumber(Number(row.valence)),
          formatMaybeNumber(Number(row.arousal)),
          formatMaybeNumber(Number(row.dominance)),
          String(row.regime ?? ''),
          formatMaybeNumber(Number(row.load)),
          formatMaybeNumber(Number(row.peace)),
          formatMaybeNumber(Number(row.vigilance)),
        ],
  );

  console.log(markdownTable([header, ...body]));
}

/**
 * Print a single row as a markdown table.
 *
 * @param {Record<string, string | number | null>} row
 * @param {{ min: number, max: number } | null} range
 */
function printMarkdownRow(row, range) {
  printMarkdownTable([row], range);
}

/**
 * @param {Array<Record<string, string | number | null>>} rows
 * @param {{ min: number, max: number } | null} range
 * @returns {string}
 */
function rowsToCsv(rows, range) {
  return stringify(rows, {
    header: true,
    columns: getColumns(rows, range),
  });
}

/**
 * Submit one text to the server and await the affect_result response.
 *
 * @param {AffectEngineClient} client
 * @param {string} text
 * @param {{ min: number, max: number } | null} range
 * @param {number} timeoutMs
 * @returns {Promise<any>}
 */
async function analyzeOne(client, text, range, timeoutMs) {
  const response = await client.submitTextAndWait(text, {
    min: range?.min ?? null,
    max: range?.max ?? null,
    type: 'analyze_affect',
    timeoutMs,
  });

  if (response?.type !== 'affect_result') {
    throw new Error(
      `Expected response type "affect_result" but received "${String(response?.type)}"`,
    );
  }

  return response;
}

/**
 * Process and print one line immediately.
 *
 * @param {AffectEngineClient} client
 * @param {string} text
 * @param {{ min: number, max: number } | null} range
 * @param {number} timeoutMs
 * @param {string | undefined} outputTarget
 * @returns {Promise<void>}
 */
async function processOneLine(client, text, range, timeoutMs, outputTarget) {
  const response = await analyzeOne(client, text, range, timeoutMs);
  const row = responseToRow(response);

  if (outputTarget) {
    throw new Error(
      'Interactive mode only supports stdout. CSV file output is not supported in streaming mode.',
    );
  }

  printMarkdownRow(row, range);
}

/**
 * Read lines interactively from the terminal and process each line immediately.
 * Empty line exits.
 *
 * @param {AffectEngineClient} client
 * @param {{ min: number, max: number } | null} range
 * @param {number} timeoutMs
 * @param {string | undefined} outputTarget
 * @returns {Promise<void>}
 */
async function runInteractive(client, range, timeoutMs, outputTarget) {
  const rl = readline.createInterface({ input, output });

  console.error('Interactive input mode. Enter one line per prompt.');
  console.error('Each line is sent to the affect server immediately.');
  console.error('Press Enter on an empty line to finish.\n');

  try {
    let lineNumber = 1;
    while (true) {
      const line = (await rl.question(`line ${lineNumber}> `)).trim();
      if (!line) {
        break;
      }

      await processOneLine(client, line, range, timeoutMs, outputTarget);
      lineNumber += 1;
    }
  } finally {
    rl.close();
  }
}

/**
 * Analyze many texts sequentially through the affect server.
 * Sequential is deliberate here to preserve ordering and make debugging easier.
 *
 * @param {AffectEngineClient} client
 * @param {string[]} texts
 * @param {{ min: number, max: number } | null} range
 * @param {number} timeoutMs
 * @returns {Promise<Array<Record<string, string | number | null>>>}
 */
async function analyzeMany(client, texts, range, timeoutMs) {
  const rows = [];

  for (const text of texts) {
    const response = await analyzeOne(client, text, range, timeoutMs);
    rows.push(responseToRow(response));
  }

  return rows;
}

async function main() {
  installNodeCompatibilityShims();

  const program = new Command();

  program
    .name('run-models')
    .description('Send text input(s) to the affect-engine websocket server.')
    .option(
      '-l, --line <text>',
      'Input text line. Can be provided multiple times.',
      (value, previous) => {
        previous.push(value);
        return previous;
      },
      [],
    )
    .option(
      '-f, --file <path>',
      'Input file. Reads line-by-line, or if CSV, uses the "text" column.',
    )
    .option(
      '-i, --interactive',
      'Interactive terminal mode. Each entered line is processed immediately.',
    )
    .option('-o, --output <csv-path>', 'Optional CSV output path for batched runs.')
    .option('-r, --range <min,max>', 'Optional output mapping range, e.g. 0,1 or -1,1.')
    .option('-u, --url <ws-url>', 'Affect-engine websocket URL.', 'ws://127.0.0.1:8080')
    .option('--timeout-ms <ms>', 'Timeout per request in milliseconds.', '5000')
    .parse(process.argv);

  const options = program.opts();
  const range = parseRange(options.range);
  const timeoutMs = Number(options.timeoutMs);

  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error(`Invalid --timeout-ms value "${options.timeoutMs}"`);
  }

  const client = new AffectEngineClient({
    url: options.url,
    reconnectDelayMs: 1500,
    autoReconnect: true,
  });

  client.on('status', (status) => {
    if (!status?.status) {
      return;
    }
    console.error(`[affect-engine] status=${status.status}`);
  });

  client.on('error', (error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[affect-engine] error=${message}`);
  });

  await client.connect();

  try {
    if (options.interactive) {
      if (options.output) {
        throw new Error(
          'Interactive mode supports stdout only. CSV file output is only supported for batched --line/--file runs.',
        );
      }

      await runInteractive(client, range, timeoutMs, options.output);
      return;
    }

    /** @type {string[]} */
    const texts = [];

    if (options.line.length > 0) {
      texts.push(...options.line.map((value) => value.trim()).filter(Boolean));
    }

    if (options.file) {
      const fileTexts = await readInputsFromFile(options.file);
      texts.push(...fileTexts);
    }

    if (texts.length === 0) {
      throw new Error('Provide at least one --line, a --file, or use --interactive.');
    }

    const rows = await analyzeMany(client, texts, range, timeoutMs);

    if (options.output) {
      const outputPath = path.isAbsolute(options.output)
        ? options.output
        : path.resolve(process.cwd(), options.output);

      const csv = rowsToCsv(rows, range);
      await fs.writeFile(outputPath, csv, 'utf8');
      console.error(`Wrote ${rows.length} row(s) to ${outputPath}`);
      return;
    }

    printMarkdownTable(rows, range);
  } finally {
    client.disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
