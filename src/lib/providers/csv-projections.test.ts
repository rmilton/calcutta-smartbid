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
});
