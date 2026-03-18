import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import logoManifest from "../../public/team-logos/prototype/manifest.json";
import tournamentInput from "../../scripts/team-logo-prototype-input.json";
import { getAssetLogoRefs, getTeamLogoPath } from "@/lib/team-logos";
import { AuctionAsset, TeamProjection } from "@/lib/types";

function buildProjection(id: string, name: string): TeamProjection {
  return {
    id,
    name,
    shortName: name.slice(0, 12).toUpperCase(),
    region: "East",
    seed: 1,
    rating: 100,
    offense: 120,
    defense: 92,
    tempo: 68,
    source: "test"
  };
}

describe("team logos", () => {
  it("covers every team in the current tournament input and points to files on disk", () => {
    expect(logoManifest.summary.requestedCount).toBe(tournamentInput.length);
    expect(logoManifest.summary.downloadedCount).toBe(tournamentInput.length);
    expect(logoManifest.summary.missingCount).toBe(0);
    expect(logoManifest.summary.failedCount).toBe(0);

    for (const team of tournamentInput) {
      expect(getTeamLogoPath({ teamId: team.id, teamName: team.name })).toBeTruthy();
    }

    for (const result of logoManifest.results) {
      if (result.status !== "downloaded" || typeof result.localPath !== "string") {
        continue;
      }

      expect(existsSync(path.join(process.cwd(), result.localPath))).toBe(true);
    }
  });

  it("resolves common aliases and alternate team names", () => {
    const saintMarysPath = getTeamLogoPath({ teamId: "saint-marys", teamName: "Saint Mary's" });
    const uconnPath = getTeamLogoPath({ teamId: "uconn", teamName: "UConn" });
    const texasAmPath = getTeamLogoPath({ teamId: "texas-am", teamName: "Texas A&M" });

    expect(getTeamLogoPath({ teamName: "Saint Marys" })).toBe(saintMarysPath);
    expect(getTeamLogoPath({ teamName: "St. Mary's" })).toBe(saintMarysPath);
    expect(getTeamLogoPath({ teamName: "Connecticut" })).toBe(uconnPath);
    expect(getTeamLogoPath({ teamName: "Texas A and M" })).toBe(texasAmPath);
  });

  it("resolves grouped assets through team lookup even when import ids are custom", () => {
    const teamLookup = new Map<string, TeamProjection>([
      ["tm_001", buildProjection("tm_001", "UConn")],
      ["tm_002", buildProjection("tm_002", "Saint Mary's")]
    ]);

    const asset: AuctionAsset = {
      id: "play-in:east-11-playin",
      label: "UConn / Saint Mary's",
      type: "play_in_slot",
      region: "East",
      seed: 11,
      seedRange: null,
      memberTeamIds: ["tm_001", "tm_002"],
      projectionIds: [],
      members: [
        {
          id: "member-1",
          type: "team",
          label: "UConn",
          region: "East",
          seed: 11,
          regionSlot: "East-11",
          teamIds: ["tm_001"],
          projectionIds: ["tm_001"],
          unresolved: false
        },
        {
          id: "member-2",
          type: "team",
          label: "Saint Mary's",
          region: "East",
          seed: 11,
          regionSlot: "East-11",
          teamIds: ["tm_002"],
          projectionIds: ["tm_002"],
          unresolved: false
        }
      ],
      unresolved: true
    };

    const logoPaths = getAssetLogoRefs(asset, teamLookup).map((ref) => getTeamLogoPath(ref));

    expect(logoPaths).toEqual([
      getTeamLogoPath({ teamName: "UConn" }),
      getTeamLogoPath({ teamName: "Saint Mary's" })
    ]);
  });

  it("keeps grouped asset members without local logos so the UI can show fallback initials", () => {
    const teamLookup = new Map<string, TeamProjection>([
      ["tm_003", buildProjection("tm_003", "Long Island")]
    ]);

    const asset: AuctionAsset = {
      id: "bundle:east-13-16",
      label: "East 13-16 Seeds",
      type: "seed_bundle",
      region: "East",
      seed: 13,
      seedRange: [13, 16],
      memberTeamIds: ["tm_003"],
      projectionIds: ["tm_003"],
      members: [
        {
          id: "member-3",
          type: "team",
          label: "Long Island",
          region: "East",
          seed: 16,
          regionSlot: "East-16",
          teamIds: ["tm_003"],
          projectionIds: ["tm_003"],
          unresolved: false
        }
      ],
      unresolved: false
    };

    expect(getTeamLogoPath({ teamId: "tm_003", teamName: "Long Island" })).toBeNull();
    expect(getAssetLogoRefs(asset, teamLookup)).toEqual([
      { teamId: "tm_003", teamName: "Long Island" }
    ]);
  });
});
