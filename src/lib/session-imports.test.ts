import { describe, expect, it } from "vitest";
import {
  buildSessionImportReadiness,
  mergeBracketAndAnalysisImports,
  parseSessionAnalysisImport,
  parseSessionBracketImport
} from "@/lib/session-imports";
import { getDefaultFinalFourPairings, getDefaultPayoutRules } from "@/lib/sample-data";
import { simulateAuctionField } from "@/lib/engine/simulation";

function buildBracketCsv() {
  const regions = ["East", "West", "South", "Midwest"];
  return [
    "id,name,shortName,region,seed,regionSlot,site,subregion",
    ...regions.flatMap((region) =>
      Array.from({ length: 16 }, (_, index) => {
        const seed = index + 1;
        return [
          `${region.toLowerCase()}-${seed}`,
          `${region} Team ${seed}`,
          `${region.slice(0, 2).toUpperCase()}${seed}`,
          region,
          String(seed),
          `${region}-${seed}`,
          `${region} Site`,
          `${region} Pod`
        ].join(",");
      })
    )
  ].join("\n");
}

function buildAnalysisCsv() {
  const regions = ["East", "West", "South", "Midwest"];
  return [
    "teamId,name,shortName,rating,offense,defense,tempo,NET Rank,Ranked Wins,Q1 Wins,Q2 Wins,Q3 Wins,Q4 Wins",
    ...regions.flatMap((region) =>
      Array.from({ length: 16 }, (_, index) => {
        const seed = index + 1;
        return [
          `${region.toLowerCase()}-${seed}`,
          `${region} Team ${seed}`,
          `${region.slice(0, 2).toUpperCase()}${seed}`,
          String(100 - seed * 0.4),
          String(120 - seed * 0.25),
          String(92 + seed * 0.2),
          String(67 + (seed % 4)),
          String(seed + 2),
          String(Math.max(0, 10 - Math.floor(seed / 2))),
          String(Math.max(0, 8 - Math.floor(seed / 3))),
          "6",
          "4",
          "2"
        ].join(",");
      })
    )
  ].join("\n");
}

describe("session-managed imports", () => {
  it("parses bracket metadata from a session import", () => {
    const bracket = parseSessionBracketImport(buildBracketCsv(), "Selection Sunday", "bracket.csv");

    expect(bracket.teamCount).toBe(64);
    expect(bracket.teams[0]).toMatchObject({
      id: "east-1",
      region: "East",
      seed: 1,
      regionSlot: "East-1",
      site: "East Site",
      subregion: "East Pod"
    });
  });

  it("merges bracket and analysis imports into a live projection field", () => {
    const bracket = parseSessionBracketImport(buildBracketCsv(), "Official Bracket");
    const analysis = parseSessionAnalysisImport(buildAnalysisCsv(), "Metrics Feed");
    const merge = mergeBracketAndAnalysisImports(bracket, analysis);

    expect(merge.issues).toEqual([]);
    expect(merge.projections).toHaveLength(64);
    expect(merge.projections[0]).toMatchObject({
      id: "east-1",
      name: "East Team 1",
      source: "Official Bracket + Metrics Feed"
    });
  });

  it("accepts NCAA-style power rating headers in the analysis import", () => {
    const csv = [
      "Team Name,Adjusted Offense Efficiency,Adjust Defense Efficiency,Power Rating - Chance of Beating Average D1 Team,Adjusted Tempo",
      "Duke,123.1,93.2,0.954,68.9"
    ].join("\n");

    const analysis = parseSessionAnalysisImport(csv, "NCAA DATA");

    expect(analysis.teams[0]).toMatchObject({
      name: "Duke",
      offense: 123.1,
      defense: 93.2,
      rating: 0.954,
      tempo: 68.9
    });
  });

  it("surfaces readiness issues until both imports and a simulation snapshot exist", () => {
    const bracket = parseSessionBracketImport(buildBracketCsv(), "Official Bracket");
    const analysis = parseSessionAnalysisImport(buildAnalysisCsv(), "Metrics Feed");
    const merged = mergeBracketAndAnalysisImports(bracket, analysis);
    const withoutSnapshot = buildSessionImportReadiness({
      bracketImport: bracket,
      analysisImport: analysis,
      baseProjections: merged.projections,
      simulationSnapshot: null
    });

    expect(withoutSnapshot.status).toBe("attention");
    expect(withoutSnapshot.issues[0]).toContain("Simulations have not been rebuilt");

    const snapshot = simulateAuctionField({
      sessionId: "session-managed",
      projections: merged.projections,
      payoutRules: getDefaultPayoutRules(),
      finalFourPairings: getDefaultFinalFourPairings(),
      iterations: 1000,
      provider: "Official Bracket + Metrics Feed",
      seed: "session-managed"
    });
    const ready = buildSessionImportReadiness({
      bracketImport: bracket,
      analysisImport: analysis,
      baseProjections: merged.projections,
      simulationSnapshot: snapshot
    });

    expect(ready.status).toBe("ready");
    expect(ready.mergedProjectionCount).toBe(64);
  });

  it("matches common team aliases between bracket and analysis imports", () => {
    const bracketRows = buildBracketCsv().split("\n");
    bracketRows[1] = "michigan-state,Michigan State,,East,1,East-1,,";
    bracketRows[2] = "ole-miss,Ole Miss,,East,2,East-2,,";
    bracketRows[3] = "uconn,UConn,,East,3,East-3,,";
    bracketRows[4] = "omaha,Omaha,,East,4,East-4,,";
    const bracketCsv = bracketRows.join("\n");

    const analysisRows = buildAnalysisCsv().split("\n");
    analysisRows[1] = "michigan-state,Michigan St.,,0.95,123,94,68,3,8,6,6,4,2";
    analysisRows[2] = "ole-miss,Mississippi,,0.91,121,96,69,4,7,5,6,4,2";
    analysisRows[3] = "uconn,Connecticut,,0.94,122,92,67,5,7,5,6,4,2";
    analysisRows[4] = "omaha,Nebraska Omaha,,0.71,112,101,70,18,3,1,3,4,2";
    const analysisCsv = analysisRows.join("\n");

    const bracket = parseSessionBracketImport(bracketCsv, "Bracket");
    const analysis = parseSessionAnalysisImport(analysisCsv, "Analysis");
    const merged = mergeBracketAndAnalysisImports(bracket, analysis);

    expect(merged.issues).toEqual([]);
    expect(merged.projections.find((team) => team.name === "Michigan State")?.rating).toBe(0.95);
    expect(merged.projections.find((team) => team.name === "Ole Miss")?.rating).toBe(0.91);
    expect(merged.projections.find((team) => team.name === "UConn")?.rating).toBe(0.94);
    expect(merged.projections.find((team) => team.name === "Omaha")?.rating).toBe(0.71);
  });

  it("flags missing seed lines inside an otherwise full region", () => {
    const rows = buildBracketCsv().split("\n");
    rows[16] = "east-16,East Team 16,EA16,East,17,East-16,East Site,East Pod";
    const bracket = parseSessionBracketImport(rows.join("\n"), "Broken Bracket");
    const analysis = parseSessionAnalysisImport(buildAnalysisCsv(), "Metrics Feed");
    const merged = mergeBracketAndAnalysisImports(bracket, analysis);

    expect(merged.issues).toContain("Bracket import contains out-of-range seeds in East. Expected seeds 1-16.");
    expect(merged.issues).toContain("Bracket import is missing seed 16 in East.");
  });

  it("requires a full 16-slot region before marking the bracket valid", () => {
    const rows = buildBracketCsv().split("\n");
    const trimmedBracketCsv = rows.filter((row) => !row.startsWith("east-16,")).join("\n");
    const bracket = parseSessionBracketImport(trimmedBracketCsv, "Short Bracket");
    const analysis = parseSessionAnalysisImport(buildAnalysisCsv(), "Metrics Feed");
    const merged = mergeBracketAndAnalysisImports(bracket, analysis);

    expect(merged.issues).toContain(
      "Bracket import contains 15 bracket slots in East. Exactly 16 slots are required per region."
    );
    expect(merged.issues).toContain("Bracket import is missing seed 16 in East.");
  });
});
