#!/usr/bin/env node

import { Command } from "commander";
import { parse } from "csv-parse/sync";
import { stringify } from "csv-stringify/sync";
import { markdownTable } from "markdown-table";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { VadBert } from "../src/nlp/vad-bert.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Resolve file path from:
 * 1. absolute path
 * 2. cwd-relative path
 * 3. script-relative path
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

  const parts = value.split(",").map((x) => x.trim());
  if (parts.length !== 2) {
    throw new Error(
      `Invalid --range value "${value}". Expected format: min,max`,
    );
  }

  const min = Number(parts[0]);
  const max = Number(parts[1]);

  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    throw new Error(
      `Invalid --range value "${value}". Both min and max must be numbers.`,
    );
  }

  if (min === max) {
    throw new Error(
      `Invalid --range value "${value}". min and max must be different.`,
    );
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
  const content = await fs.readFile(await resolveInputPath(filepath), "utf8");
  const ext = path.extname(filepath).toLowerCase();

  if (ext === ".csv") {
    const records = parse(content, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });

    if (records.length === 0) {
      return [];
    }

    if (!Object.hasOwn(records[0], "text")) {
      throw new Error(`CSV file "${filepath}" must contain a "text" column.`);
    }

    return records
      .map((row) => row.text)
      .filter((value) => typeof value === "string")
      .map((value) => value.trim())
      .filter(Boolean);
  }

  return content
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
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

    if (!range) {
      return {
        text,
        valence: raw.valence,
        arousal: raw.arousal,
        dominance: raw.dominance,
      };
    }

    const normalized = VadBert.normalizeVAD(raw, range.min, range.max);

    return {
      text,
      min: range.min,
      max: range.max,
      valence: normalized.valence,
      arousal: normalized.arousal,
      dominance: normalized.dominance,
    };
  });
}

/**
 * Format numbers for output.
 *
 * @param {number} value
 * @returns {string}
 */
function formatScore(value) {
  return Number(value).toFixed(4);
}

/**
 * Print rows as a markdown table.
 *
 * @param {Array<Record<string, string | number>>} rows
 * @param {{ min: number, max: number } | null} range
 */
function printMarkdownTable(rows, range) {
  const header = range
    ? ["text", "min", "max", "valence", "arousal", "dominance"]
    : ["text", "valence", "arousal", "dominance"];

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

async function main() {
  const program = new Command();

  program
    .name("run-models")
    .description("Run local VAD-BERT inference on text input(s).")
    .option(
      "-i, --input <text>",
      "Input text line. Can be provided multiple times.",
      (value, previous) => {
        previous.push(value);
        return previous;
      },
      [],
    )
    .option(
      "-f, --file <path>",
      'Input file. Reads line-by-line, or if CSV, uses the "text" column.',
    )
    .option(
      "-o, --output <path>",
      'Optional output CSV path. Format: "text,valence,arousal,dominance".',
    )
    .option(
      "-r, --range <min,max>",
      "Optional output mapping range, e.g. 0,1 or -1,1. If omitted, raw values are returned.",
    )
    .parse(process.argv);

  const options = program.opts();
  const range = parseRange(options.range);

  /** @type {string[]} */
  let texts = [];

  if (options.input.length > 0) {
    texts.push(...options.input.map((value) => value.trim()).filter(Boolean));
  }

  if (options.file) {
    const fileTexts = await readInputsFromFile(options.file);
    texts.push(...fileTexts);
  }

  if (texts.length === 0) {
    console.error("Error: provide at least one -i input or a -f file.");
    process.exit(1);
  }

  const vad = await VadBert.getInstance();
  const rows = await runModel(vad, texts, range);

  if (options.output) {
    const outputPath = path.isAbsolute(options.output)
      ? options.output
      : path.resolve(process.cwd(), options.output);

    const columns = range
      ? ["text", "min", "max", "valence", "arousal", "dominance"]
      : ["text", "valence", "arousal", "dominance"];

    const csv = stringify(rows, {
      header: true,
      columns,
    });

    await fs.writeFile(outputPath, csv, "utf8");
    console.log(`Wrote ${rows.length} row(s) to ${outputPath}`);
    return;
  }

  printMarkdownTable(rows, range);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
