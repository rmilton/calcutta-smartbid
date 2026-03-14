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
    const bracketCsv = [
      "name,region,seed,regionSlot",
      "Michigan State,East,1,East-1",
      "Ole Miss,East,2,East-2",
      "UConn,East,3,East-3",
      "Omaha,East,4,East-4",
      "West Team 1,West,1,West-1",
      "West Team 2,West,2,West-2",
      "West Team 3,West,3,West-3",
      "West Team 4,West,4,West-4",
      "South Team 1,South,1,South-1",
      "South Team 2,South,2,South-2",
      "South Team 3,South,3,South-3",
      "South Team 4,South,4,South-4",
      "Midwest Team 1,Midwest,1,Midwest-1",
      "Midwest Team 2,Midwest,2,Midwest-2",
      "Midwest Team 3,Midwest,3,Midwest-3",
      "Midwest Team 4,Midwest,4,Midwest-4"
    ].join("\n");
    const analysisCsv = [
      "Team Name,Adjusted Offense Efficiency,Adjust Defense Efficiency,Power Rating - Chance of Beating Average D1 Team,Adjusted Tempo",
      "Michigan St.,123,94,0.95,68",
      "Mississippi,121,96,0.91,69",
      "Connecticut,122,92,0.94,67",
      "Nebraska Omaha,112,101,0.71,70",
      "West Team 1,120,95,0.9,68",
      "West Team 2,119,96,0.89,69",
      "West Team 3,118,97,0.88,70",
      "West Team 4,117,98,0.87,71",
      "South Team 1,120,95,0.9,68",
      "South Team 2,119,96,0.89,69",
      "South Team 3,118,97,0.88,70",
      "South Team 4,117,98,0.87,71",
      "Midwest Team 1,120,95,0.9,68",
      "Midwest Team 2,119,96,0.89,69",
      "Midwest Team 3,118,97,0.88,70",
      "Midwest Team 4,117,98,0.87,71"
    ].join("\n");

    const bracket = parseSessionBracketImport(bracketCsv, "Bracket");
    const analysis = parseSessionAnalysisImport(analysisCsv, "Analysis");
    const merged = mergeBracketAndAnalysisImports(bracket, analysis);

    expect(merged.issues).toEqual([
      "Bracket import contains 16 teams. The live room currently requires a resolved 64-team field."
    ]);
    expect(merged.projections.find((team) => team.name === "Michigan State")?.rating).toBe(0.95);
    expect(merged.projections.find((team) => team.name === "Ole Miss")?.rating).toBe(0.91);
    expect(merged.projections.find((team) => team.name === "UConn")?.rating).toBe(0.94);
    expect(merged.projections.find((team) => team.name === "Omaha")?.rating).toBe(0.71);
  });
});
