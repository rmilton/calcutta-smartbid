import { describe, expect, it } from "vitest";
import { buildAuctionAssets } from "@/lib/auction-assets";
import { parseSessionBracketImport } from "@/lib/session-imports";
import { SessionBracketImport, TeamProjection } from "@/lib/types";

function buildProjections() {
  const regions = ["East", "West", "South", "Midwest"];
  return regions.flatMap((region) =>
    Array.from({ length: 16 }, (_, index) => {
      const seed = index + 1;
      return {
        id: `${region.toLowerCase()}-${seed}`,
        name: `${region} Team ${seed}`,
        shortName: `${region.slice(0, 2).toUpperCase()}${seed}`,
        region,
        seed,
        rating: 100 - seed * 0.4,
        offense: 120 - seed * 0.25,
        defense: 92 + seed * 0.2,
        tempo: 67 + (seed % 4),
        source: "Test Feed"
      } satisfies TeamProjection;
    })
  );
}

function buildResolvedBracketImport() {
  const regions = ["East", "West", "South", "Midwest"];
  const csv = [
    "id,name,shortName,region,seed,regionSlot",
    ...regions.flatMap((region) =>
      Array.from({ length: 16 }, (_, index) => {
        const seed = index + 1;
        return [
          `${region.toLowerCase()}-${seed}`,
          `${region} Team ${seed}`,
          `${region.slice(0, 2).toUpperCase()}${seed}`,
          region,
          String(seed),
          `${region}-${seed}`
        ].join(",");
      })
    )
  ].join("\n");

  return parseSessionBracketImport(csv, "Resolved Bracket");
}

function buildPlayInBracketImport(): SessionBracketImport {
  const base = buildResolvedBracketImport();
  const teams = base.teams.flatMap((team) => {
    if (team.region === "West" && team.seed === 16) {
      return [
        {
          ...team,
          id: "west-16-a",
          name: "West 16 A",
          shortName: "W16A",
          isPlayIn: true,
          playInGroup: "west-16-playin"
        },
        {
          ...team,
          id: "west-16-b",
          name: "West 16 B",
          shortName: "W16B",
          isPlayIn: true,
          playInGroup: "west-16-playin"
        }
      ];
    }

    if (team.region === "East" && team.seed === 11) {
      return [
        {
          ...team,
          id: "east-11-a",
          name: "East 11 A",
          shortName: "E11A",
          isPlayIn: true,
          playInGroup: "east-11-playin"
        },
        {
          ...team,
          id: "east-11-b",
          name: "East 11 B",
          shortName: "E11B",
          isPlayIn: true,
          playInGroup: "east-11-playin"
        }
      ];
    }

    if (
      (team.region === "West" && team.seed === 16) ||
      (team.region === "East" && team.seed === 11)
    ) {
      return [];
    }

    return [team];
  });

  return {
    ...base,
    teamCount: teams.length,
    teams
  };
}

describe("auction assets", () => {
  it("falls back to single-team assets without a bracket import", () => {
    const projections = buildProjections();
    const assets = buildAuctionAssets({
      baseProjections: projections,
      bracketImport: null
    });

    expect(assets).toHaveLength(64);
    expect(assets[0]).toMatchObject({
      id: "east-1",
      type: "single_team",
      label: "East Team 1"
    });
  });

  it("builds 52 auction assets for a resolved bracket with regional 13-16 bundles", () => {
    const assets = buildAuctionAssets({
      baseProjections: buildProjections(),
      bracketImport: buildResolvedBracketImport()
    });

    expect(assets).toHaveLength(52);
    expect(assets.filter((asset) => asset.type === "seed_bundle")).toHaveLength(4);
    expect(assets.some((asset) => asset.id === "west-13")).toBe(false);
    expect(assets.find((asset) => asset.id === "bundle:west:13-16")?.members).toHaveLength(4);
  });

  it("keeps unresolved 11-seed play-ins separate while folding 16-seed play-ins into the regional bundle", () => {
    const assets = buildAuctionAssets({
      baseProjections: buildProjections(),
      bracketImport: buildPlayInBracketImport()
    });

    expect(assets).toHaveLength(52);
    expect(assets.find((asset) => asset.id === "play-in:east-11-playin")).toMatchObject({
      type: "play_in_slot",
      unresolved: true
    });
    expect(assets.find((asset) => asset.id === "play-in:west-16-playin")).toBeUndefined();
    expect(assets.find((asset) => asset.id === "bundle:west:13-16")?.members).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "play_in_slot",
          id: "west-16-playin",
          unresolved: true
        })
      ])
    );
  });
});
