import { applyProjectionOverrides, normalizeProjectionFeed, validateProjectionFieldShape } from "@/lib/providers/projections";

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
        source: "ignored"
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
        tempo: 69,
        source: "ignored"
      }
    ]);

    expect(teams).toHaveLength(1);
    expect(teams[0].shortName).toBe("DUKE");
    expect(teams[0].region).toBe("East");
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
