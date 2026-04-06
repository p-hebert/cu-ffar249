#!/usr/bin/env node

import { Command } from 'commander';
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';
import { markdownTable } from 'markdown-table';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { stdin as input, stdout as output } from 'node:process';
import readline from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';
import { VadBert } from '../server/src/nlp/vad-bert.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
 * @param {string | undefined} value
 * @returns {boolean}
 */
function isWebSocketAddress(value) {
  return typeof value === 'string' && /^wss?:\/\//u.test(value);
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
 * @param {number} value
 * @returns {string}
 */
function formatScore(value) {
  return Number(value).toFixed(4);
}

/**
 * @param {{ valence: number, arousal: number, dominance: number }} vad
 * @returns {[number, number, number]}
 */
function vadToArray(vad) {
  return [vad.valence, vad.arousal, vad.dominance];
}

/**
 * @param {{ valence: number, arousal: number, dominance: number }} raw
 * @param {{ min: number, max: number } | null} range
 * @returns {{ valence: number, arousal: number, dominance: number }}
 */
function maybeNormalize(raw, range) {
  if (!range) {
    return raw;
  }
  return VadBert.normalizeVAD(raw, range.min, range.max);
}

/**
 * Build output rows from text inputs.
 *
 * @param {VadBert} model
 * @param {string[]} texts
 * @param {{ min: number, max: number } | null} range
 * @returns {Promise<Array<Record<string, string | number>>>}
 */
async function runModel(model, texts, range) {
  const predictions = await model.predictMany(texts);

  return texts.map((text, index) => {
    const raw = predictions[index];
    const values = maybeNormalize(raw, range);

    if (!range) {
      return {
        text,
        valence: values.valence,
        arousal: values.arousal,
        dominance: values.dominance,
      };
    }

    return {
      text,
      min: range.min,
      max: range.max,
      valence: values.valence,
      arousal: values.arousal,
      dominance: values.dominance,
    };
  });
}

/**
 * @param {Array<Record<string, string | number>>} rows
 * @param {{ min: number, max: number } | null} range
 * @returns {string[]}
 */
function getColumns(rows, range) {
  void rows;
  return range
    ? ['text', 'min', 'max', 'valence', 'arousal', 'dominance']
    : ['text', 'valence', 'arousal', 'dominance'];
}

/**
 * Print rows as a markdown table.
 *
 * @param {Array<Record<string, string | number>>} rows
 * @param {{ min: number, max: number } | null} range
 */
function printMarkdownTable(rows, range) {
  const header = getColumns(rows, range);

  const body = rows.map((row) =>
    range
      ? [
          String(row.text),
          String(row.min),
          String(row.max),
          formatScore(Number(row.valence)),
          formatScore(Number(row.arousal)),
          formatScore(Number(row.dominance)),
        ]
      : [
          String(row.text),
          formatScore(Number(row.valence)),
          formatScore(Number(row.arousal)),
          formatScore(Number(row.dominance)),
        ],
  );

  console.log(markdownTable([header, ...body]));
}

/**
 * Print a single row as a markdown table.
 *
 * @param {Record<string, string | number>} row
 * @param {{ min: number, max: number } | null} range
 */
function printMarkdownRow(row, range) {
  printMarkdownTable([row], range);
}

/**
 * @param {Array<Record<string, string | number>>} rows
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
 * @param {string} text
 * @param {{ valence: number, arousal: number, dominance: number }} values
 * @param {{ min: number, max: number } | null} range
 * @returns {{
 *   id: string,
 *   type: string,
 *   data: {
 *     range: { min: number, max: number } | null,
 *     values: [number, number, number]
 *   }
 * }}
 */
function makeWsPayload(text, values, range) {
  return {
    id: randomUUID(),
    type: 'vad-results',
    data: {
      text,
      range,
      values: vadToArray(values),
    },
  };
}

/**
 * Send one text + VAD result to a websocket endpoint.
 *
 * @param {string} address
 * @param {string} text
 * @param {{ valence: number, arousal: number, dominance: number }} values
 * @param {{ min: number, max: number } | null} range
 * @returns {Promise<void>}
 */
async function sendOneToWebSocket(address, text, values, range) {
  const payload = makeWsPayload(text, values, range);

  await new Promise((resolve, reject) => {
    const ws = new WebSocket(address);

    let settled = false;
    const cleanup = () => {
      ws.removeAllListeners();
    };

    ws.once('open', () => {
      ws.send(JSON.stringify(payload), (error) => {
        if (error) {
          if (!settled) {
            settled = true;
            cleanup();
            try {
              ws.close();
            } catch {}
            reject(error);
          }
          return;
        }

        try {
          ws.close();
        } catch {}

        if (!settled) {
          settled = true;
          cleanup();
          resolve();
        }
      });
    });

    ws.once('error', (error) => {
      if (!settled) {
        settled = true;
        cleanup();
        reject(error);
      }
    });

    ws.once('close', () => {
      if (!settled) {
        settled = true;
        cleanup();
        resolve();
      }
    });
  });
}

/**
 * Process and emit one line immediately.
 *
 * @param {VadBert} model
 * @param {string} text
 * @param {{ min: number, max: number } | null} range
 * @param {string | undefined} outputTarget
 * @returns {Promise<void>}
 */
async function processOneLine(model, text, range, outputTarget) {
  const raw = await model.predict(text);
  const values = maybeNormalize(raw, range);

  if (outputTarget) {
    if (isWebSocketAddress(outputTarget)) {
      await sendOneToWebSocket(outputTarget, text, values, range);
      console.error(`Sent 1 row to ${outputTarget}`);
      return;
    }

    throw new Error(
      'Interactive mode only supports stdout or websocket output. CSV file output is not supported in streaming mode.',
    );
  }

  const row = range
    ? {
        text,
        min: range.min,
        max: range.max,
        valence: values.valence,
        arousal: values.arousal,
        dominance: values.dominance,
      }
    : {
        text,
        valence: values.valence,
        arousal: values.arousal,
        dominance: values.dominance,
      };

  printMarkdownRow(row, range);
}

/**
 * Read lines interactively from the terminal and process each line immediately.
 * Empty line exits.
 *
 * @param {VadBert} model
 * @param {{ min: number, max: number } | null} range
 * @param {string | undefined} outputTarget
 * @returns {Promise<void>}
 */
async function runInteractive(model, range, outputTarget) {
  const rl = readline.createInterface({ input, output });

  console.error('Interactive input mode. Enter one line per prompt.');
  console.error('Each line is processed immediately.');
  console.error('Press Enter on an empty line to finish.\n');

  try {
    let lineNumber = 1;
    while (true) {
      const line = (await rl.question(`line ${lineNumber}> `)).trim();
      if (!line) {
        break;
      }

      await processOneLine(model, line, range, outputTarget);
      lineNumber += 1;
    }
  } finally {
    rl.close();
  }
}

async function main() {
  const program = new Command();

  program
    .name('run-models')
    .description('Run local VAD-BERT inference on text input(s).')
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
    .option(
      '-o, --output <path-or-ws>',
      'Optional output destination. Use a CSV path or a websocket URL like ws://host:port.',
    )
    .option(
      '-r, --range <min,max>',
      'Optional output mapping range, e.g. 0,1 or -1,1. If omitted, raw values are returned.',
    )
    .parse(process.argv);

  const options = program.opts();
  const range = parseRange(options.range);

  const vad = await VadBert.getInstance();

  if (options.interactive) {
    if (options.output && !isWebSocketAddress(options.output)) {
      throw new Error(
        'Interactive mode supports stdout or websocket output only. CSV file output is only supported for batched --line/--file runs.',
      );
    }

    await runInteractive(vad, range, options.output);
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

  const rows = await runModel(vad, texts, range);

  if (options.output) {
    if (isWebSocketAddress(options.output)) {
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const values = {
          valence: Number(row.valence),
          arousal: Number(row.arousal),
          dominance: Number(row.dominance),
        };
        await sendOneToWebSocket(options.output, texts[i], values, range);
      }
      console.error(`Sent ${rows.length} row(s) to ${options.output}`);
      return;
    }

    const outputPath = path.isAbsolute(options.output)
      ? options.output
      : path.resolve(process.cwd(), options.output);

    const csv = rowsToCsv(rows, range);
    await fs.writeFile(outputPath, csv, 'utf8');
    console.error(`Wrote ${rows.length} row(s) to ${outputPath}`);
    return;
  }

  printMarkdownTable(rows, range);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
