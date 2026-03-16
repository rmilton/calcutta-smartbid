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
      "Team Name,Adjusted Offense Efficiency,Adjust Defense Efficiency,Power Rating - Chance of Beating Average D1 Team,Adjusted Tempo,Wins Above Bubble",
      "Duke,123.1,93.2,0.954,68.9,12"
    ].join("\n");

    const analysis = parseSessionAnalysisImport(csv, "NCAA DATA");

    expect(analysis.teams[0]).toMatchObject({
      name: "Duke",
      offense: 123.1,
      defense: 93.2,
      rating: 0.954,
      tempo: 68.9,
      scouting: {
        kenpomRank: 1,
        quadWins: {
          q1: 11
        },
        rankedWins: 8
      }
    });
  });

  it("does not treat three point rate as three point percentage", () => {
    const csv = [
      "Team Name,Adjusted Offense Efficiency,Adjust Defense Efficiency,Power Rating - Chance of Beating Average D1 Team,Adjusted Tempo,Three Point Rate,Wins Above Bubble",
      "Duke,123.1,93.2,0.954,68.9,54.4,12"
    ].join("\n");

    const analysis = parseSessionAnalysisImport(csv, "NCAA DATA");

    expect(analysis.teams[0]).toMatchObject({
      name: "Duke",
      scouting: {
        kenpomRank: 1
      }
    });
    expect(analysis.teams[0].scouting?.threePointPct).toBeUndefined();
  });

  it("derives useful scouting when session analysis imports only provide NCAA-style columns", () => {
    const bracketCsv = [
      "id,name,shortName,region,seed,regionSlot,site,subregion",
      "duke,Duke,DUKE,East,1,East-1,East Site,East Pod",
      "houston,Houston,HOU,West,1,West-1,West Site,West Pod",
      "florida,Florida,FLA,South,1,South-1,South Site,South Pod",
      "auburn,Auburn,AUB,Midwest,1,Midwest-1,Midwest Site,Midwest Pod"
    ].join("\n");
    const analysisCsv = [
      "Team Name,Adjusted Offense Efficiency,Adjust Defense Efficiency,Power Rating - Chance of Beating Average D1 Team,Adjusted Tempo,Wins Above Bubble",
      "Duke,128.582,90.5437,0.982595,66.018,12",
      "Houston,127.100,89.9000,0.971000,64.500,10",
      "Florida,125.300,92.2000,0.962000,68.100,8",
      "Auburn,124.700,93.4000,0.955000,69.200,7"
    ].join("\n");

    const merged = mergeBracketAndAnalysisImports(
      parseSessionBracketImport(bracketCsv, "Bracket"),
      parseSessionAnalysisImport(analysisCsv, "NCAA DATA")
    );
    const duke = merged.projections.find((team) => team.id === "duke");

    expect(duke?.scouting).toMatchObject({
      netRank: 1,
      kenpomRank: 1,
      rankedWins: 8,
      quadWins: {
        q1: 11
      },
      offenseStyle: "Spacing-heavy half-court shot creation"
    });
  });

  it("parses Nate Silver projection columns when present", () => {
    const csv = [
      "teamId,name,shortName,rating,offense,defense,tempo,Nate Silver Projection Seed,Nate Silver Projection - Round of 64,Nate Silver Projection - Round of 32,Nate Silver Projection - Sweet 16,Nate Silver Projection - Elite 8,Nate Silver Projection - Final Four,Nate Silver Projection - Championship Game,Nate Silver Projection - Champion",
      "duke,Duke,DUKE,0.982595,128.582,90.5437,66.018,1,1,0.99,0.759,0.552,0.409,0.258,0.158"
    ].join("\n");

    const analysis = parseSessionAnalysisImport(csv, "Merged Metrics");

    expect(analysis.teams[0].nateSilverProjection).toEqual({
      seed: "1",
      roundOf64: 1,
      roundOf32: 0.99,
      sweet16: 0.759,
      elite8: 0.552,
      finalFour: 0.409,
      championshipGame: 0.258,
      champion: 0.158
    });
  });

  it("keeps partial Nate Silver projection rows nullable instead of failing", () => {
    const csv = [
      "teamId,name,shortName,rating,offense,defense,tempo,Nate Silver Projection Seed,Nate Silver Projection - Round of 32,Nate Silver Projection - Champion",
      "duke,Duke,DUKE,0.982595,128.582,90.5437,66.018,1,0.99,"
    ].join("\n");

    const analysis = parseSessionAnalysisImport(csv, "Merged Metrics");

    expect(analysis.teams[0].nateSilverProjection).toEqual({
      seed: "1",
      roundOf64: null,
      roundOf32: 0.99,
      sweet16: null,
      elite8: null,
      finalFour: null,
      championshipGame: null,
      champion: null
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
