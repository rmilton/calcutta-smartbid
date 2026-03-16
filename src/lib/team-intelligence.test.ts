import { buildTeamIntelligence } from "@/lib/team-intelligence";
import { TeamProjection } from "@/lib/types";

const teams: TeamProjection[] = [
  {
    id: "alpha",
    name: "Alpha",
    shortName: "ALP",
    region: "East",
    seed: 1,
    rating: 95,
    offense: 122,
    defense: 92,
    tempo: 69,
    source: "test",
    scouting: {
      netRank: 2,
      kenpomRank: 1,
      threePointPct: 38.6,
      rankedWins: 8,
      quadWins: { q1: 10, q2: 5, q3: 2, q4: 1 },
      ats: { wins: 20, losses: 9, pushes: 1 },
      offenseStyle: "Spacing-heavy half-court",
      defenseStyle: "Switch pressure"
    }
  },
  {
    id: "beta",
    name: "Beta",
    shortName: "BET",
    region: "West",
    seed: 4,
    rating: 88,
    offense: 116,
    defense: 98,
    tempo: 68,
    source: "test",
    scouting: {
      netRank: 21,
      kenpomRank: 19,
      threePointPct: 35.1,
      rankedWins: 4,
      quadWins: { q1: 5, q2: 6, q3: 4, q4: 2 },
      ats: { wins: 15, losses: 14, pushes: 0 },
      offenseStyle: "Balanced",
      defenseStyle: "Containment shell"
    }
  },
  {
    id: "gamma",
    name: "Gamma",
    shortName: "GAM",
    region: "South",
    seed: 8,
    rating: 82,
    offense: 110,
    defense: 102,
    tempo: 70,
    source: "test",
    scouting: {
      netRank: 57,
      kenpomRank: 49,
      threePointPct: 32.8,
      rankedWins: 1,
      quadWins: { q1: 1, q2: 4, q3: 6, q4: 5 },
      ats: { wins: 12, losses: 18, pushes: 1 },
      offenseStyle: "Paint-heavy",
      defenseStyle: "Drop coverage"
    }
  }
];

describe("buildTeamIntelligence", () => {
  it("ranks stronger scouting profiles higher", () => {
    const intelligence = buildTeamIntelligence(teams, "alpha");

    expect(intelligence.ranking[0].teamId).toBe("alpha");
    expect(intelligence.ranking[intelligence.ranking.length - 1].teamId).toBe("gamma");
    expect(intelligence.ranking[0].percentile).toBe(100);
  });

  it("returns selected-team deltas versus field average", () => {
    const intelligence = buildTeamIntelligence(teams, "beta");
    const selected = intelligence.selected;

    expect(selected).not.toBeNull();
    expect(selected?.team.id).toBe("beta");
    expect(selected?.deltas.q1Wins).not.toBeNull();
    expect(selected?.deltas.kenpomRank).not.toBeNull();
  });

  it("adds an uncertainty risk when scouting coverage is sparse", () => {
    const sparseTeams: TeamProjection[] = [
      {
        id: "sparse-a",
        name: "Sparse A",
        shortName: "SPA",
        region: "East",
        seed: 1,
        rating: 90,
        offense: 118,
        defense: 95,
        tempo: 68,
        source: "test",
        scouting: { kenpomRank: 20 }
      },
      {
        id: "sparse-b",
        name: "Sparse B",
        shortName: "SPB",
        region: "West",
        seed: 2,
        rating: 89,
        offense: 117,
        defense: 96,
        tempo: 67,
        source: "test",
        scouting: { kenpomRank: 22 }
      }
    ];

    const intelligence = buildTeamIntelligence(sparseTeams, "sparse-b");
    const selected = intelligence.selected;
    expect(selected).not.toBeNull();
    expect(selected?.row.risks).toContain("Limited scouting data increases uncertainty");
  });

  it("does not add the uncertainty fallback when sparse data still yields a clear strength", () => {
    const teamsWithPartialSignals: TeamProjection[] = [
      {
        id: "duke",
        name: "Duke",
        shortName: "DUKE",
        region: "East",
        seed: 1,
        rating: 0.98,
        offense: 128,
        defense: 91,
        tempo: 66,
        source: "test",
        scouting: {
          kenpomRank: 1,
          quadWins: { q1: 12, q2: 8, q3: 7, q4: 7 }
        }
      },
      {
        id: "houston",
        name: "Houston",
        shortName: "HOU",
        region: "Midwest",
        seed: 1,
        rating: 0.97,
        offense: 127,
        defense: 90,
        tempo: 65,
        source: "test",
        scouting: {
          kenpomRank: 9,
          quadWins: { q1: 8, q2: 7, q3: 6, q4: 6 }
        }
      },
      {
        id: "florida",
        name: "Florida",
        shortName: "FLA",
        region: "West",
        seed: 1,
        rating: 0.96,
        offense: 125,
        defense: 92,
        tempo: 68,
        source: "test",
        scouting: {
          kenpomRank: 15,
          quadWins: { q1: 6, q2: 6, q3: 5, q4: 5 }
        }
      }
    ];

    const intelligence = buildTeamIntelligence(teamsWithPartialSignals, "duke");
    const selected = intelligence.selected;

    expect(selected).not.toBeNull();
    expect(selected?.row.strengths).toContain("High-end Quad 1 resume");
    expect(selected?.row.risks).not.toContain("Limited scouting data increases uncertainty");
  });
});
