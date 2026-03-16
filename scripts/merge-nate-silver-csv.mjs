#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";

const [, , analysisPathArg, natePathArg, outputPathArg, reportPathArg] = process.argv;

if (!analysisPathArg || !natePathArg || !outputPathArg) {
  console.error(
    "Usage: node scripts/merge-nate-silver-csv.mjs <analysis-csv> <nate-csv> <output-csv> [report-json]"
  );
  process.exit(1);
}

const analysisPath = path.resolve(analysisPathArg);
const natePath = path.resolve(natePathArg);
const outputPath = path.resolve(outputPathArg);
const reportPath = reportPathArg ? path.resolve(reportPathArg) : null;

const nateColumnLabels = [
  ["Seed", "Nate Silver Projection Seed"],
  ["R64", "Nate Silver Projection - Round of 64"],
  ["R32", "Nate Silver Projection - Round of 32"],
  ["S16", "Nate Silver Projection - Sweet 16"],
  ["E8", "Nate Silver Projection - Elite 8"],
  ["F4", "Nate Silver Projection - Final Four"],
  ["CP", "Nate Silver Projection - Championship Game"],
  ["WIN", "Nate Silver Projection - Champion"]
];

const manualAliases = new Map([
  ["connecticut", "uconn"],
  ["saint mary s", "saint mary s ca"],
  ["miami", "u miami fl"],
  ["prairie view a and m", "prairie view"],
  ["mcneese state", "mcneese"],
  ["miami ohio", "miami u oh"]
]);

const analysisCsv = await fs.readFile(analysisPath, "utf8");
const nateCsv = await fs.readFile(natePath, "utf8");

const analysisRows = parseCsv(analysisCsv);
const nateRows = parseCsv(nateCsv);

if (analysisRows.length < 2 || nateRows.length < 2) {
  throw new Error("Both CSV files must include a header row and at least one data row.");
}

const analysisHeaders = analysisRows[0];
const nateHeaders = nateRows[0];

const analysisNameIndex = findRequiredIndex(analysisHeaders, [
  "team name",
  "team",
  "name",
  "school"
]);
const nateTeamIndex = findRequiredIndex(nateHeaders, ["team"]);

const nateIndices = Object.fromEntries(
  nateColumnLabels.map(([sourceLabel]) => [sourceLabel, findRequiredIndex(nateHeaders, [sourceLabel])])
);

const nateByName = new Map();
for (const row of nateRows.slice(1)) {
  const rawName = String(row[nateTeamIndex] ?? "").trim();
  if (!rawName) {
    continue;
  }
  nateByName.set(normalizeTeamName(rawName), row);
}

const aliasMatches = [];
const unmatchedAnalysis = [];
const matchedNames = new Set();

const mergedRows = [
  [...analysisHeaders, ...nateColumnLabels.map(([, label]) => label)],
  ...analysisRows.slice(1).map((row) => {
    const rawName = String(row[analysisNameIndex] ?? "").trim();
    const normalized = normalizeTeamName(rawName);
    const alias = manualAliases.get(normalized) ?? normalized;
    const nateRow = nateByName.get(alias) ?? null;

    if (nateRow) {
      matchedNames.add(String(nateRow[nateTeamIndex] ?? "").trim());
      if (alias !== normalized) {
        aliasMatches.push({
          analysisName: rawName,
          nateName: String(nateRow[nateTeamIndex] ?? "").trim()
        });
      }
    } else {
      unmatchedAnalysis.push(rawName);
    }

    return [
      ...row,
      ...nateColumnLabels.map(([sourceLabel]) =>
        nateRow ? String(nateRow[nateIndices[sourceLabel]] ?? "").trim() : ""
      )
    ];
  })
];

const unmatchedNate = nateRows
  .slice(1)
  .map((row) => String(row[nateTeamIndex] ?? "").trim())
  .filter((name) => name && !matchedNames.has(name));

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, stringifyCsv(mergedRows), "utf8");

if (reportPath) {
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(
    reportPath,
    JSON.stringify(
      {
        analysisPath,
        natePath,
        outputPath,
        analysisRowCount: analysisRows.length - 1,
        nateRowCount: nateRows.length - 1,
        matchedNateTeams: matchedNames.size,
        unmatchedAnalysisTeamCount: unmatchedAnalysis.length,
        unmatchedNateTeamCount: unmatchedNate.length,
        aliasMatches,
        unmatchedAnalysisTeams: unmatchedAnalysis,
        unmatchedNateTeams: unmatchedNate
      },
      null,
      2
    ),
    "utf8"
  );
}

console.log(
  JSON.stringify(
    {
      outputPath,
      reportPath,
      matchedNateTeams: matchedNames.size,
      unmatchedAnalysisTeamCount: unmatchedAnalysis.length,
      unmatchedNateTeamCount: unmatchedNate.length,
      aliasMatches
    },
    null,
    2
  )
);

function normalizeHeader(value) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function findRequiredIndex(headers, aliases) {
  const normalizedAliases = new Set(aliases.map((alias) => normalizeHeader(alias)));
  const index = headers.findIndex((header) => normalizedAliases.has(normalizeHeader(header)));
  if (index < 0) {
    throw new Error(`Missing required column: ${aliases[0]}`);
  }
  return index;
}

function normalizeTeamName(value) {
  return value
    .toLowerCase()
    .replace(/[()]/g, " ")
    .replace(/&/g, " and ")
    .replace(/\bst\.?\b/g, "state")
    .replace(/\bu\.\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;
  const input = text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    const next = input[index + 1];

    if (char === "\"") {
      if (inQuotes && next === "\"") {
        cell += "\"";
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(cell);
      cell = "";
      continue;
    }

    if (char === "\n" && !inQuotes) {
      row.push(cell);
      if (row.some((value) => value.trim() !== "")) {
        rows.push(row);
      }
      row = [];
      cell = "";
      continue;
    }

    cell += char;
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    if (row.some((value) => value.trim() !== "")) {
      rows.push(row);
    }
  }

  return rows;
}

function stringifyCsv(rows) {
  return `${rows
    .map((row) =>
      row
        .map((value) => {
          const cell = String(value ?? "");
          if (/[",\n]/.test(cell)) {
            return `"${cell.replace(/"/g, "\"\"")}"`;
          }
          return cell;
        })
        .join(",")
    )
    .join("\n")}\n`;
}
