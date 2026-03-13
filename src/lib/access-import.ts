import { SessionRole } from "@/lib/types";

export interface AccessImportRow {
  name: string;
  email: string;
  role: SessionRole;
}

const accessImportHeaders = ["name", "email", "role"] as const;

export const accessImportSampleCsv = [
  accessImportHeaders.join(","),
  "Jane Doe,jane@example.com,operator"
].join("\n");

export function parseAccessImportCsv(csvContent: string): AccessImportRow[] {
  const rows = parseCsv(csvContent);

  if (rows.length < 2) {
    throw new Error("CSV must include headers and at least one user row.");
  }

  const headerRow = rows[0].map((value) => value.trim().toLowerCase());
  if (
    headerRow.length !== accessImportHeaders.length ||
    !accessImportHeaders.every((header, index) => headerRow[index] === header)
  ) {
    throw new Error("CSV headers must be exactly: name,email,role");
  }

  const seenEmails = new Set<string>();
  return rows.slice(1).map((row, index) => {
    const rowNumber = index + 2;
    const [name = "", email = "", role = ""] = row.map((value) => value.trim());

    if (!name || !email || !role) {
      throw new Error(`Row ${rowNumber} must include name, email, and role.`);
    }

    const normalizedEmail = email.toLowerCase();
    if (seenEmails.has(normalizedEmail)) {
      throw new Error(`Row ${rowNumber} has a duplicate email in the CSV.`);
    }
    seenEmails.add(normalizedEmail);

    return {
      name,
      email: normalizedEmail,
      role: parseAccessImportRole(role, rowNumber)
    } satisfies AccessImportRow;
  });
}

function parseAccessImportRole(role: string, rowNumber: number): SessionRole {
  const normalized = role.trim().toLowerCase();
  if (normalized === "operator" || normalized === "admin") {
    return "admin";
  }

  if (normalized === "viewer") {
    return "viewer";
  }

  throw new Error(`Row ${rowNumber} role must be operator or viewer.`);
}

function parseCsv(csvContent: string) {
  const normalized = csvContent
    .replace(/^\uFEFF/, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");

  const rows: string[][] = [];
  let currentCell = "";
  let currentRow: string[] = [];
  let inQuotes = false;

  for (let index = 0; index < normalized.length; index += 1) {
    const character = normalized[index];

    if (character === "\"") {
      const next = normalized[index + 1];
      if (inQuotes && next === "\"") {
        currentCell += "\"";
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (character === "," && !inQuotes) {
      currentRow.push(currentCell);
      currentCell = "";
      continue;
    }

    if (character === "\n" && !inQuotes) {
      currentRow.push(currentCell);
      pushCsvRow(rows, currentRow);
      currentRow = [];
      currentCell = "";
      continue;
    }

    currentCell += character;
  }

  if (inQuotes) {
    throw new Error("CSV contains an unclosed quoted value.");
  }

  currentRow.push(currentCell);
  pushCsvRow(rows, currentRow);

  return rows;
}

function pushCsvRow(rows: string[][], row: string[]) {
  if (row.every((value) => value.trim() === "")) {
    return;
  }

  rows.push(row);
}
