import {
  buildCsvBudgetPlan,
  buildCsvProjectionFeed,
  buildCsvTeamAnalysis
} from "@/lib/providers/csv-projections";

function buildCsvRow(values: string[]) {
  return values.join(",");
}

function buildCsvFixture() {
  const header = buildCsvRow([
    "Team Name",
    "Adjusted Offense Efficiency",
    "Adjust Defense Efficiency",
    "Power Rating - Chance of Beating Average D1 Team",
    "Wins",
    "Adjusted Tempo",
    "Wins Above Bubble"
  ]);

  const rows = Array.from({ length: 68 }, (_, index) => {
    const rank = index + 1;
    const teamName =
      index === 0 ? "\"Maryland, Baltimore County\"" : `Team ${rank}`;
    return buildCsvRow([
      teamName,
      (124 - rank * 0.4).toFixed(3),
      (90 + rank * 0.35).toFixed(3),
      (0.98 - rank * 0.008).toFixed(6),
      String(35 - Math.floor(rank / 4)),
      (64 + (rank % 12) * 0.6).toFixed(3),
      (10 - rank * 0.2).toFixed(3)
    ]);
  });

  return [header, ...rows].join("\n");
}

describe("buildCsvProjectionFeed", () => {
  it("builds a valid 64-team feed with four regions and seeded lines", () => {
    const feed = buildCsvProjectionFeed(buildCsvFixture(), "csv-test");
    expect(feed.provider).toBe("csv-test");
    expect(feed.teams).toHaveLength(64);
    expect(feed.teams.every((team) => team.source === "csv-test")).toBe(true);

    const byRegion = feed.teams.reduce<Record<string, number[]>>((accumulator, team) => {
      accumulator[team.region] = accumulator[team.region] ?? [];
      accumulator[team.region].push(team.seed);
      return accumulator;
    }, {});

    expect(Object.keys(byRegion).sort()).toEqual(["East", "Midwest", "South", "West"]);
    for (const region of Object.keys(byRegion)) {
      expect(byRegion[region]).toHaveLength(16);
      expect(new Set(byRegion[region]).size).toBe(16);
      expect(Math.min(...byRegion[region])).toBe(1);
      expect(Math.max(...byRegion[region])).toBe(16);
    }
  });

  it("parses quoted team names correctly", () => {
    const feed = buildCsvProjectionFeed(buildCsvFixture(), "csv-test");
    const parsedTeam = feed.teams.find((team) => team.name === "Maryland, Baltimore County");
    expect(parsedTeam).toBeDefined();
    expect(parsedTeam?.id).toContain("maryland-baltimore-county");
  });

  it("builds analysis for all valid teams without relying on bracket shape", () => {
    const analysis = buildCsvTeamAnalysis(buildCsvFixture(), "csv-test");
    expect(analysis.teamCount).toBe(68);
    expect(analysis.teams).toHaveLength(68);
    expect(analysis.intelligence.ranking).toHaveLength(68);
    expect(analysis.teams[0].name).toBe("Maryland, Baltimore County");
    expect(analysis.intelligence.ranking.every((row) => row.rankedWins === null)).toBe(true);
  });

  it("builds full-field budget guidance without per-team caps", () => {
    const analysis = buildCsvTeamAnalysis(buildCsvFixture(), "csv-test");
    const plan = buildCsvBudgetPlan(
      analysis,
      {
        bankroll: 10000,
        reservePct: 0.28
      },
      analysis.teams[0]?.id
    );

    expect(plan.investableCash).toBe(7200);
    expect(plan.reservedCash).toBe(2800);
    expect(plan.rows).toHaveLength(analysis.intelligence.ranking.length);
    expect(plan.selected).not.toBeNull();
    expect(plan.selected?.maxBid).toBeGreaterThan(plan.selected?.targetBid ?? 0);
  });

  it("defaults to investing the full bankroll with zero reserve", () => {
    const analysis = buildCsvTeamAnalysis(buildCsvFixture(), "csv-test");
    const plan = buildCsvBudgetPlan(analysis, { bankroll: 10000 });
    expect(plan.investableCash).toBe(10000);
    expect(plan.reservedCash).toBe(0);
  });

  it("parses extended efficiency columns for analysis stats", () => {
    const csv = [
      buildCsvRow([
        "Team Name",
        "Adjusted Offense Efficiency",
        "Adjust Defense Efficiency",
        "Power Rating - Chance of Beating Average D1 Team",
        "Wins",
        "Games Played",
        "Effective Field Goal Percentage",
        "Opponent Effective Field Goal Percentage",
        "Free Throw Rate",
        "Opponent Free Throw Rate",
        "Turnover Percentage",
        "Opponent Turnover Percentage",
        "Offensive Rebound Percentage",
        "Defensive Rebound Percentage",
        "Adjusted Tempo",
        "Offensive Two Point Percentage",
        "Defensive Two Point Percentage",
        "Three Point Rate",
        "Opponent 3 Point Rate",
        "Wins Above Bubble"
      ]),
      buildCsvRow([
        "Alpha",
        "121.2",
        "93.4",
        "0.978",
        "29",
        "33",
        "56.8",
        "48.7",
        "38.1",
        "29.2",
        "15.4",
        "19.7",
        "33.2",
        "72.4",
        "69.5",
        "55.1",
        "47.2",
        "42.8",
        "34.5",
        "7.1"
      ]),
      buildCsvRow([
        "Beta",
        "117.1",
        "97.2",
        "0.932",
        "24",
        "33",
        "53.9",
        "50.9",
        "33.7",
        "32.5",
        "16.9",
        "17.8",
        "29.5",
        "69.9",
        "67.2",
        "52.8",
        "49.3",
        "37.2",
        "36.4",
        "3.8"
      ])
    ].join("\n");

    const analysis = buildCsvTeamAnalysis(csv, "csv-test");
    const topTeam = analysis.teams.find((team) => team.name === "Alpha");

    expect(topTeam).toBeDefined();
    expect(topTeam?.threePointRate).toBeCloseTo(42.8);
    expect(topTeam?.offensiveReboundPct).toBeCloseTo(33.2);
    expect(topTeam?.offensiveTwoPointPct).toBeCloseTo(55.1);
    expect(topTeam?.kenpomRank).toBe(1);
  });

  it("normalizes decimal-form percentages into percentage points", () => {
    const csv = [
      buildCsvRow([
        "Team Name",
        "Adjusted Offense Efficiency",
        "Adjust Defense Efficiency",
        "Power Rating - Chance of Beating Average D1 Team",
        "Adjusted Tempo",
        "Offensive Three Point Percentage",
        "Three Point Rate",
        "Effective Field Goal Percentage",
        "Offensive Rebound Percentage",
        "Offensive Two Point Percentage"
      ]),
      buildCsvRow([
        "Alpha",
        "121.2",
        "93.4",
        "0.978",
        "69.5",
        "0.387",
        "0.446",
        "0.561",
        "0.342",
        "0.548"
      ])
    ].join("\n");

    const analysis = buildCsvTeamAnalysis(csv, "csv-test");
    const team = analysis.teams.find((candidate) => candidate.name === "Alpha");

    expect(team).toBeDefined();
    expect(team?.threePointPct).toBeCloseTo(38.7);
    expect(team?.threePointRate).toBeCloseTo(44.6);
    expect(team?.effectiveFieldGoalPct).toBeCloseTo(56.1);
    expect(team?.offensiveReboundPct).toBeCloseTo(34.2);
    expect(team?.offensiveTwoPointPct).toBeCloseTo(54.8);
  });
});
