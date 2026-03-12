import {
  applyProjectionOverrides,
  loadProjectionsFromSource,
  normalizeProjectionFeed,
  validateProjectionFieldShape
} from "@/lib/providers/projections";

describe("normalizeProjectionFeed", () => {
  it("normalizes names and removes duplicate team ids", () => {
    const teams = normalizeProjectionFeed("remote", [
      {
        id: "duke",
        name: " Duke ",
        shortName: "duke",
        region: " East ",
        seed: 1,
        rating: 95,
        offense: 122,
        defense: 92,
        tempo: 69,
        scouting: {
          kenpomRank: 3,
          threePointPct: 38.4,
          quadWins: { q1: 9, q2: 5, q3: 2, q4: 1 },
          ats: { wins: 18, losses: 11, pushes: 1 },
          offenseStyle: " Four-out spacing ",
          defenseStyle: " Point-of-attack pressure "
        }
      },
      {
        id: "duke",
        name: "Duke",
        shortName: "DUKE",
        region: "East",
        seed: 1,
        rating: 95,
        offense: 122,
        defense: 92,
        tempo: 69
      }
    ]);

    expect(teams).toHaveLength(1);
    expect(teams[0].shortName).toBe("DUKE");
    expect(teams[0].region).toBe("East");
    expect(teams[0].scouting?.offenseStyle).toBe("Four-out spacing");
    expect(teams[0].scouting?.ats?.wins).toBe(18);
  });
});

describe("projection overrides", () => {
  it("applies manual overrides on top of imported projections", () => {
    const [team] = applyProjectionOverrides(
      [
        {
          id: "duke",
          name: "Duke",
          shortName: "DUKE",
          region: "East",
          seed: 1,
          rating: 95,
          offense: 122,
          defense: 92,
          tempo: 69,
          source: "remote"
        }
      ],
      {
        duke: {
          teamId: "duke",
          rating: 98,
          offense: 125,
          updatedAt: new Date().toISOString()
        }
      }
    );

    expect(team.rating).toBe(98);
    expect(team.offense).toBe(125);
    expect(team.source).toContain("override");
  });
});

describe("validateProjectionFieldShape", () => {
  it("rejects feeds without four regions", () => {
    expect(() =>
      validateProjectionFieldShape([
        {
          id: "duke",
          name: "Duke",
          shortName: "DUKE",
          region: "East",
          seed: 1,
          rating: 95,
          offense: 122,
          defense: 92,
          tempo: 69,
          source: "remote"
        }
      ])
    ).toThrow("exactly four tournament regions");
  });
});

describe("csv source loading", () => {
  it("accepts NCAA analysis-style CSV data sources and regionizes them into a field", async () => {
    const rows = [
      "Team Name,Adjusted Offense Efficiency,Adjusted Defense Efficiency,Power Rating - Chance of Beating Average D1 Team,Adjusted Tempo",
      ...Array.from({ length: 64 }, (_, index) => {
        const rank = index + 1;
        return `Team ${rank},${120 - index * 0.2},${90 + index * 0.15},${95 - index * 0.35},${68 + (index % 5)}`;
      })
    ];

    const result = await loadProjectionsFromSource(
      {
        key: "data-source:ncaa-data",
        name: "NCAA DATA",
        kind: "csv"
      },
      [
        {
          id: "ncaa-data",
          name: "NCAA DATA",
          kind: "csv",
          active: true,
          config: {
            csvContent: rows.join("\n"),
            fileName: "ncaa.csv"
          },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          lastTestedAt: null
        }
      ]
    );

    expect(result.teams).toHaveLength(64);
    expect(new Set(result.teams.map((team) => team.region)).size).toBe(4);
    expect(Math.min(...result.teams.map((team) => team.seed))).toBe(1);
    expect(Math.max(...result.teams.map((team) => team.seed))).toBe(16);
  });
});
