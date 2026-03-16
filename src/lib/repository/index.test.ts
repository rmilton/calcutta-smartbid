import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, vi } from "vitest";
import { getDefaultPayoutRules } from "@/lib/sample-data";
import { saveTeamClassificationSchema, saveTeamNoteSchema } from "@/lib/types";

let storeFile = "";

async function loadRepository() {
  vi.resetModules();
  const { getSessionRepository } = await import("./index");
  return getSessionRepository();
}

async function createBaselineSession() {
  const repository = await loadRepository();
  const operator = await repository.createPlatformUser({
    name: "Operator",
    email: "operator@example.com"
  });
  const mothership = await repository.createSyndicateCatalogEntry({
    name: "Mothership"
  });
  const riverboat = await repository.createSyndicateCatalogEntry({
    name: "Riverboat"
  });
  const session = await repository.createSession({
    name: "Classification Test",
    sharedAccessCode: "classify123",
    accessAssignments: [{ platformUserId: operator.id, role: "admin" }],
    catalogSyndicateIds: [mothership.id, riverboat.id],
    payoutRules: {
      ...getDefaultPayoutRules(),
      projectedPot: 100000
    },
    analysisSettings: {},
    bracketSelection: {
      mode: "upload",
      sourceName: "Official Bracket",
      fileName: "bracket.csv",
      csvContent: buildFullBracketCsv()
    },
    analysisSelection: {
      mode: "upload",
      sourceName: "Metrics Feed",
      fileName: "analysis.csv",
      csvContent: buildFullAnalysisCsv()
    },
    simulationIterations: 1000
  });

  return { repository, session };
}

function buildRegions() {
  return ["South", "West", "East", "Midwest"];
}

function buildFullBracketCsv() {
  const regions = buildRegions();
  return [
    ["id", "name", "shortName", "region", "seed", "regionSlot"].join(","),
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
}

function buildFullAnalysisCsv() {
  const regions = buildRegions();
  return [
    ["teamId", "name", "shortName", "rating", "offense", "defense", "tempo"].join(","),
    ...regions.flatMap((region) =>
      Array.from({ length: 16 }, (_, index) => {
        const seed = index + 1;
        return [
          `${region.toLowerCase()}-${seed}`,
          `${region} Team ${seed}`,
          `${region.slice(0, 2).toUpperCase()}${seed}`,
          String(100 - seed * 0.5),
          String(120 - seed * 0.25),
          String(92 + seed * 0.2),
          String(67 + (seed % 4))
        ].join(",");
      })
    )
  ].join("\n");
}

describe("repository funding model", () => {
  beforeEach(async () => {
    storeFile = path.join(
      os.tmpdir(),
      `calcutta-smartbid-funding-${Date.now()}-${Math.random().toString(36).slice(2)}.json`
    );
    process.env.CALCUTTA_STORAGE_BACKEND = "local";
    process.env.CALCUTTA_STORE_FILE = storeFile;
    process.env.MOTHERSHIP_SYNDICATE_NAME = "Mothership";
    await fs.rm(storeFile, { force: true });
  });

  afterEach(async () => {
    await fs.rm(storeFile, { force: true });
    delete process.env.CALCUTTA_STORE_FILE;
    delete process.env.CALCUTTA_STORAGE_BACKEND;
    delete process.env.MOTHERSHIP_SYNDICATE_NAME;
    vi.resetModules();
  });

  it("seeds legacy sessions from equal split behavior and persists funding updates", async () => {
    const repository = await loadRepository();
    const operator = await repository.createPlatformUser({
      name: "Operator",
      email: "operator@example.com"
    });
    const mothership = await repository.createSyndicateCatalogEntry({
      name: "Mothership"
    });
    const riverboat = await repository.createSyndicateCatalogEntry({
      name: "Riverboat"
    });
    const payoutRules = {
      ...getDefaultPayoutRules(),
      projectedPot: 100000
    };

    const session = await repository.createSession({
      name: "Funding Test",
      sharedAccessCode: "funding123",
      accessAssignments: [{ platformUserId: operator.id, role: "admin" }],
      catalogSyndicateIds: [mothership.id, riverboat.id],
      payoutRules,
      analysisSettings: {},
      simulationIterations: 1000
    });

    expect(session.mothershipFunding.budgetBase).toBe(50000);
    expect(session.mothershipFunding.budgetLow).toBe(45000);
    expect(
      session.syndicates.find((syndicate) => syndicate.name === "Riverboat")?.estimatedBudget
    ).toBe(50000);

    await repository.updateSessionFunding(session.id, {
      ...session.mothershipFunding,
      fullSharesSold: 180,
      halfSharesSold: 8,
      budgetBase: 62000,
      budgetStretch: 76000
    });
    await repository.updateSessionSyndicates(session.id, {
      catalogSyndicateIds: [mothership.id, riverboat.id],
      syndicateFunding: [
        {
          catalogEntryId: mothership.id,
          estimatedBudget: 62000,
          budgetConfidence: "high",
          budgetNotes: ""
        },
        {
          catalogEntryId: riverboat.id,
          estimatedBudget: 68000,
          budgetConfidence: "high",
          budgetNotes: "Aggressive room read"
        }
      ]
    });

    const reloadedRepository = await loadRepository();
    const reloadedSession = await reloadedRepository.getSession(session.id);

    expect(reloadedSession?.mothershipFunding.budgetBase).toBe(62000);
    expect(reloadedSession?.mothershipFunding.fullSharesSold).toBe(180);
    expect(
      reloadedSession?.syndicates.find((syndicate) => syndicate.name === "Riverboat")
    ).toMatchObject({
      estimatedBudget: 68000,
      budgetConfidence: "high",
      budgetNotes: "Aggressive room read"
    });
  });

  it("seeds newly added syndicates from the legacy budget when no estimate is submitted yet", async () => {
    const repository = await loadRepository();
    const operator = await repository.createPlatformUser({
      name: "Operator",
      email: "operator@example.com"
    });
    const mothership = await repository.createSyndicateCatalogEntry({
      name: "Mothership"
    });
    const riverboat = await repository.createSyndicateCatalogEntry({
      name: "Riverboat"
    });
    const railbirds = await repository.createSyndicateCatalogEntry({
      name: "Railbirds"
    });

    const session = await repository.createSession({
      name: "Funding Seed Test",
      sharedAccessCode: "funding123",
      accessAssignments: [{ platformUserId: operator.id, role: "admin" }],
      catalogSyndicateIds: [mothership.id, riverboat.id],
      payoutRules: {
        ...getDefaultPayoutRules(),
        projectedPot: 120000
      },
      analysisSettings: {},
      simulationIterations: 1000
    });

    const updated = await repository.updateSessionSyndicates(session.id, {
      catalogSyndicateIds: [mothership.id, riverboat.id, railbirds.id],
      syndicateFunding: [{ catalogEntryId: railbirds.id, budgetConfidence: "medium", budgetNotes: "" }]
    });

    expect(
      updated.session.syndicates.find((syndicate) => syndicate.name === "Railbirds")
    ).toMatchObject({
      estimatedBudget: 40000,
      estimatedRemainingBudget: 40000,
      estimateExceeded: false
    });
  });

  it("creates a ready session from saved bracket and analysis sources", async () => {
    const repository = await loadRepository();
    const operator = await repository.createPlatformUser({
      name: "Operator",
      email: "operator@example.com"
    });
    const mothership = await repository.createSyndicateCatalogEntry({ name: "Mothership" });
    const riverboat = await repository.createSyndicateCatalogEntry({ name: "Riverboat" });
    const bracketSource = await repository.createDataSource({
      name: "Official Bracket Source",
      kind: "csv",
      purpose: "bracket",
      csvContent: buildFullBracketCsv(),
      fileName: "bracket.csv"
    });
    const analysisSource = await repository.createDataSource({
      name: "Metrics Feed Source",
      kind: "csv",
      purpose: "analysis",
      csvContent: buildFullAnalysisCsv(),
      fileName: "analysis.csv"
    });

    const session = await repository.createSession({
      name: "Saved Source Session",
      sharedAccessCode: "savedsource",
      accessAssignments: [{ platformUserId: operator.id, role: "admin" }],
      catalogSyndicateIds: [mothership.id, riverboat.id],
      payoutRules: { ...getDefaultPayoutRules(), projectedPot: 120000 },
      analysisSettings: {},
      bracketSelection: { mode: "saved-source", sourceKey: `data-source:${bracketSource.id}` },
      analysisSelection: { mode: "saved-source", sourceKey: `data-source:${analysisSource.id}` },
      simulationIterations: 1000
    });

    expect(session.importReadiness.status).toBe("ready");
    expect(session.bracketImport?.sourceName).toBe("Official Bracket Source");
    expect(session.analysisImport?.sourceName).toBe("Metrics Feed Source");
    expect(session.projections).toHaveLength(64);
  });

  it("honors the requested simulation iterations when creating a ready session", async () => {
    const repository = await loadRepository();
    const operator = await repository.createPlatformUser({
      name: "Operator",
      email: "operator@example.com"
    });
    const mothership = await repository.createSyndicateCatalogEntry({ name: "Mothership" });
    const riverboat = await repository.createSyndicateCatalogEntry({ name: "Riverboat" });

    const session = await repository.createSession({
      name: "Iteration Session",
      sharedAccessCode: "iterations",
      accessAssignments: [{ platformUserId: operator.id, role: "admin" }],
      catalogSyndicateIds: [mothership.id, riverboat.id],
      payoutRules: { ...getDefaultPayoutRules(), projectedPot: 120000 },
      analysisSettings: {},
      bracketSelection: {
        mode: "upload",
        sourceName: "Official Bracket",
        csvContent: buildFullBracketCsv()
      },
      analysisSelection: {
        mode: "upload",
        sourceName: "Metrics Feed",
        csvContent: buildFullAnalysisCsv()
      },
      simulationIterations: 1500
    });

    expect(session.importReadiness.status).toBe("ready");
    expect(session.simulationSnapshot?.iterations).toBe(1500);
  });

  it("creates a session from a mixed saved-source and upload setup", async () => {
    const repository = await loadRepository();
    const operator = await repository.createPlatformUser({
      name: "Operator",
      email: "operator@example.com"
    });
    const mothership = await repository.createSyndicateCatalogEntry({ name: "Mothership" });
    const riverboat = await repository.createSyndicateCatalogEntry({ name: "Riverboat" });
    const bracketSource = await repository.createDataSource({
      name: "Official Bracket Source",
      kind: "csv",
      purpose: "bracket",
      csvContent: buildFullBracketCsv(),
      fileName: "bracket.csv"
    });

    const session = await repository.createSession({
      name: "Mixed Import Session",
      sharedAccessCode: "mixedsource",
      accessAssignments: [{ platformUserId: operator.id, role: "admin" }],
      catalogSyndicateIds: [mothership.id, riverboat.id],
      payoutRules: { ...getDefaultPayoutRules(), projectedPot: 120000 },
      analysisSettings: {},
      bracketSelection: { mode: "saved-source", sourceKey: `data-source:${bracketSource.id}` },
      analysisSelection: {
        mode: "upload",
        sourceName: "Uploaded Metrics",
        fileName: "analysis.csv",
        csvContent: buildFullAnalysisCsv()
      },
      simulationIterations: 1000
    });

    expect(session.importReadiness.status).toBe("ready");
    expect(session.analysisImport?.sourceName).toBe("Uploaded Metrics");
  });

  it("creates a session in attention state when no imports are selected", async () => {
    const repository = await loadRepository();
    const operator = await repository.createPlatformUser({
      name: "Operator",
      email: "operator@example.com"
    });
    const mothership = await repository.createSyndicateCatalogEntry({ name: "Mothership" });
    const riverboat = await repository.createSyndicateCatalogEntry({ name: "Riverboat" });

    const session = await repository.createSession({
      name: "Incomplete Session",
      sharedAccessCode: "incomplete",
      accessAssignments: [{ platformUserId: operator.id, role: "admin" }],
      catalogSyndicateIds: [mothership.id, riverboat.id],
      payoutRules: { ...getDefaultPayoutRules(), projectedPot: 120000 },
      analysisSettings: {},
      simulationIterations: 1000
    });

    expect(session.importReadiness.status).toBe("attention");
    expect(session.importReadiness.issues).toContain("Bracket import is still missing.");
    expect(session.importReadiness.issues).toContain("Analysis import is still missing.");
    expect(session.projections).toHaveLength(0);
  });

  it("supports separate bracket and analysis imports for a session", async () => {
    const repository = await loadRepository();
    const operator = await repository.createPlatformUser({
      name: "Operator",
      email: "operator@example.com"
    });
    const mothership = await repository.createSyndicateCatalogEntry({
      name: "Mothership"
    });
    const riverboat = await repository.createSyndicateCatalogEntry({
      name: "Riverboat"
    });

    const session = await repository.createSession({
      name: "Selection Sunday Test",
      sharedAccessCode: "selection26",
      accessAssignments: [{ platformUserId: operator.id, role: "admin" }],
      catalogSyndicateIds: [mothership.id, riverboat.id],
      payoutRules: {
        ...getDefaultPayoutRules(),
        projectedPot: 120000
      },
      analysisSettings: {},
      simulationIterations: 1000
    });

    const regions = ["East", "West", "South", "Midwest"];
    const bracketCsv = [
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
    const analysisCsv = [
      "teamId,name,shortName,rating,offense,defense,tempo",
      ...regions.flatMap((region) =>
        Array.from({ length: 16 }, (_, index) => {
          const seed = index + 1;
          return [
            `${region.toLowerCase()}-${seed}`,
            `${region} Team ${seed}`,
            `${region.slice(0, 2).toUpperCase()}${seed}`,
            String(100 - seed * 0.3),
            String(121 - seed * 0.25),
            String(92 + seed * 0.2),
            String(67 + (seed % 4))
          ].join(",");
        })
      )
    ].join("\n");

    const afterBracket = await repository.importSessionBracket(session.id, {
      selection: {
        mode: "upload",
        sourceName: "Official Bracket",
        fileName: "bracket.csv",
        csvContent: bracketCsv
      }
    });
    expect(afterBracket.session.importReadiness.status).toBe("attention");
    expect(afterBracket.session.importReadiness.hasBracket).toBe(true);
    expect(afterBracket.session.importReadiness.hasAnalysis).toBe(false);

    const afterAnalysis = await repository.importSessionAnalysis(session.id, {
      selection: {
        mode: "upload",
        sourceName: "Metrics Feed",
        fileName: "analysis.csv",
        csvContent: analysisCsv
      }
    });
    expect(afterAnalysis.session.importReadiness.status).toBe("ready");
    expect(afterAnalysis.session.projectionProvider).toBe("Official Bracket + Metrics Feed");
    expect(afterAnalysis.session.activeDataSource.name).toBe("Session-managed imports");
  });

  it("allows nominating a 13-16 bundle asset after session-managed imports", async () => {
    const { repository, session } = await createBaselineSession();
    const regions = ["East", "West", "South", "Midwest"];
    const bracketCsv = [
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
    const analysisCsv = [
      "teamId,name,shortName,rating,offense,defense,tempo",
      ...regions.flatMap((region) =>
        Array.from({ length: 16 }, (_, index) => {
          const seed = index + 1;
          return [
            `${region.toLowerCase()}-${seed}`,
            `${region} Team ${seed}`,
            `${region.slice(0, 2).toUpperCase()}${seed}`,
            String(100 - seed * 0.3),
            String(121 - seed * 0.25),
            String(92 + seed * 0.2),
            String(67 + (seed % 4))
          ].join(",");
        })
      )
    ].join("\n");

    await repository.importSessionBracket(session.id, {
      selection: {
        mode: "upload",
        sourceName: "Official Bracket",
        csvContent: bracketCsv
      }
    });
    await repository.importSessionAnalysis(session.id, {
      selection: {
        mode: "upload",
        sourceName: "Metrics Feed",
        csvContent: analysisCsv
      }
    });

    const dashboard = await repository.updateLiveState(session.id, {
      nominatedAssetId: "bundle:east:13-16"
    });

    expect(dashboard.session.liveState.nominatedAssetId).toBe("bundle:east:13-16");
    expect(dashboard.session.liveState.nominatedTeamId).toBe("east-13");
  });

  it("treats a nominatedTeamId that matches an asset id as a bundle nomination", async () => {
    const { repository, session } = await createBaselineSession();
    const regions = ["East", "West", "South", "Midwest"];
    const bracketCsv = [
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
    const analysisCsv = [
      "teamId,name,shortName,rating,offense,defense,tempo",
      ...regions.flatMap((region) =>
        Array.from({ length: 16 }, (_, index) => {
          const seed = index + 1;
          return [
            `${region.toLowerCase()}-${seed}`,
            `${region} Team ${seed}`,
            `${region.slice(0, 2).toUpperCase()}${seed}`,
            String(100 - seed * 0.3),
            String(121 - seed * 0.25),
            String(92 + seed * 0.2),
            String(67 + (seed % 4))
          ].join(",");
        })
      )
    ].join("\n");

    await repository.importSessionBracket(session.id, {
      selection: {
        mode: "upload",
        sourceName: "Official Bracket",
        csvContent: bracketCsv
      }
    });
    await repository.importSessionAnalysis(session.id, {
      selection: {
        mode: "upload",
        sourceName: "Metrics Feed",
        csvContent: analysisCsv
      }
    });

    const dashboard = await repository.updateLiveState(session.id, {
      nominatedTeamId: "bundle:east:13-16"
    });

    expect(dashboard.session.liveState.nominatedAssetId).toBe("bundle:east:13-16");
    expect(dashboard.session.liveState.nominatedTeamId).toBe("east-13");
  });

  it("stores grouped purchases with underlying projection ids", async () => {
    const { repository, session } = await createBaselineSession();
    const regions = ["East", "West", "South", "Midwest"];
    const bracketCsv = [
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
    const analysisCsv = [
      "teamId,name,shortName,rating,offense,defense,tempo",
      ...regions.flatMap((region) =>
        Array.from({ length: 16 }, (_, index) => {
          const seed = index + 1;
          return [
            `${region.toLowerCase()}-${seed}`,
            `${region} Team ${seed}`,
            `${region.slice(0, 2).toUpperCase()}${seed}`,
            String(100 - seed * 0.3),
            String(121 - seed * 0.25),
            String(92 + seed * 0.2),
            String(67 + (seed % 4))
          ].join(",")
        })
      )
    ].join("\n");

    await repository.importSessionBracket(session.id, {
      selection: {
        mode: "upload",
        sourceName: "Official Bracket",
        csvContent: bracketCsv
      }
    });
    await repository.importSessionAnalysis(session.id, {
      selection: {
        mode: "upload",
        sourceName: "Metrics Feed",
        csvContent: analysisCsv
      }
    });

    const dashboard = await repository.recordPurchase(session.id, {
      teamId: "bundle:east:13-16",
      buyerSyndicateId: session.syndicates[0]!.id,
      price: 2500
    });

    expect(dashboard.lastPurchase?.assetId).toBe("bundle:east:13-16");
    expect(dashboard.lastPurchase?.teamId).toBe("east-13");
    expect(dashboard.lastPurchase?.projectionIds).toEqual([
      "east-13",
      "east-14",
      "east-15",
      "east-16"
    ]);
    expect(
      dashboard.ledger.find((candidate) => candidate.id === session.syndicates[0]!.id)?.ownedTeamIds
    ).toEqual(expect.arrayContaining(["east-13", "east-14", "east-15", "east-16"]));
  });

  it("clears stale projections when a replacement session-managed import no longer merges cleanly", async () => {
    const { repository, session } = await createBaselineSession();
    const regions = ["East", "West", "South", "Midwest"];
    const bracketCsv = [
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
    const analysisCsv = [
      "teamId,name,shortName,rating,offense,defense,tempo",
      ...regions.flatMap((region) =>
        Array.from({ length: 16 }, (_, index) => {
          const seed = index + 1;
          return [
            `${region.toLowerCase()}-${seed}`,
            `${region} Team ${seed}`,
            `${region.slice(0, 2).toUpperCase()}${seed}`,
            String(100 - seed * 0.3),
            String(121 - seed * 0.25),
            String(92 + seed * 0.2),
            String(67 + (seed % 4))
          ].join(",");
        })
      )
    ].join("\n");

    await repository.importSessionBracket(session.id, {
      selection: {
        mode: "upload",
        sourceName: "Official Bracket",
        csvContent: bracketCsv
      }
    });
    const ready = await repository.importSessionAnalysis(session.id, {
      selection: {
        mode: "upload",
        sourceName: "Metrics Feed",
        csvContent: analysisCsv
      }
    });
    expect(ready.session.importReadiness.status).toBe("ready");
    expect(ready.session.projections).toHaveLength(64);

    const replacementBracketCsv = bracketCsv.replace(
      "east-1,East Team 1,EA1,East,1,East-1",
      "totally-new-team,Totally New Team,TNT,East,1,East-1"
    );
    const broken = await repository.importSessionBracket(session.id, {
      selection: {
        mode: "upload",
        sourceName: "Replacement Bracket",
        csvContent: replacementBracketCsv
      }
    });

    expect(broken.session.importReadiness.status).toBe("attention");
    expect(broken.session.importReadiness.issues).toContain(
      "Analysis import is missing metrics for Totally New Team."
    );
    expect(broken.session.projections).toHaveLength(0);
    expect(broken.session.simulationSnapshot).toBeNull();
  });

  it("returns to legacy mode when a fallback source import runs", async () => {
    const { repository, session } = await createBaselineSession();
    const regions = ["East", "West", "South", "Midwest"];
    const bracketCsv = [
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
    const analysisCsv = [
      "teamId,name,shortName,rating,offense,defense,tempo",
      ...regions.flatMap((region) =>
        Array.from({ length: 16 }, (_, index) => {
          const seed = index + 1;
          return [
            `${region.toLowerCase()}-${seed}`,
            `${region} Team ${seed}`,
            `${region.slice(0, 2).toUpperCase()}${seed}`,
            String(100 - seed * 0.3),
            String(121 - seed * 0.25),
            String(92 + seed * 0.2),
            String(67 + (seed % 4))
          ].join(",");
        })
      )
    ].join("\n");

    await repository.importSessionBracket(session.id, {
      selection: {
        mode: "upload",
        sourceName: "Official Bracket",
        csvContent: bracketCsv
      }
    });
    await repository.importSessionAnalysis(session.id, {
      selection: {
        mode: "upload",
        sourceName: "Metrics Feed",
        csvContent: analysisCsv
      }
    });

    const fallback = await repository.runSessionImport(session.id, "builtin:mock");

    expect(fallback.session.bracketImport).toBeNull();
    expect(fallback.session.analysisImport).toBeNull();
    expect(fallback.session.importReadiness.mode).toBe("legacy");
    expect(fallback.session.importReadiness.status).toBe("ready");
    expect(fallback.session.activeDataSource.key).toBe("builtin:mock");
  });

  it("preserves legacy API source config during metadata-only updates", async () => {
    const now = new Date().toISOString();
    await fs.writeFile(
      storeFile,
      JSON.stringify(
        {
          sessions: [],
          platformUsers: [],
          syndicateCatalog: [],
          dataSources: [
            {
              id: "legacy-api",
              name: "Legacy API Source",
              kind: "api",
              purpose: "analysis",
              active: true,
              config: {
                url: "https://example.com/feed.json",
                bearerToken: "secret-token"
              },
              createdAt: now,
              updatedAt: now,
              lastTestedAt: null
            }
          ],
          dataImportRuns: [],
          csvAnalysisPortfolios: []
        },
        null,
        2
      ),
      "utf8"
    );

    const repository = await loadRepository();
    const updated = await repository.updateDataSource("legacy-api", { active: false });

    expect(updated.active).toBe(false);
    expect(updated.kind).toBe("api");
    expect(updated.config).toEqual({
      url: "https://example.com/feed.json",
      bearerToken: "secret-token"
    });
  });
});

describe("repository purchases", () => {
  beforeEach(async () => {
    storeFile = path.join(
      os.tmpdir(),
      `calcutta-smartbid-purchases-${Date.now()}-${Math.random().toString(36).slice(2)}.json`
    );
    process.env.CALCUTTA_STORAGE_BACKEND = "local";
    process.env.CALCUTTA_STORE_FILE = storeFile;
    process.env.MOTHERSHIP_SYNDICATE_NAME = "Mothership";
    await fs.rm(storeFile, { force: true });
  });

  afterEach(async () => {
    await fs.rm(storeFile, { force: true });
    delete process.env.CALCUTTA_STORE_FILE;
    delete process.env.CALCUTTA_STORAGE_BACKEND;
    delete process.env.MOTHERSHIP_SYNDICATE_NAME;
    vi.resetModules();
  });

  it("undoes the most recent purchase and restores that team to the live board", async () => {
    const { repository, session } = await createBaselineSession();
    const [team] = session.projections;
    const buyer = session.syndicates.find((candidate) => candidate.name === "Riverboat");

    expect(team).toBeDefined();
    expect(buyer).toBeDefined();

    if (!team || !buyer) {
      throw new Error("Expected baseline session data.");
    }

    const purchasedDashboard = await repository.recordPurchase(session.id, {
      teamId: team.id,
      buyerSyndicateId: buyer.id,
      price: 4200
    });

    expect(purchasedDashboard.lastPurchase?.teamId).toBe(team.id);
    expect(purchasedDashboard.session.liveState.nominatedTeamId).toBeNull();
    expect(purchasedDashboard.session.liveState.soldTeamIds).toContain(team.id);

    const undoneDashboard = await repository.undoPurchase(
      session.id,
      purchasedDashboard.lastPurchase?.id
    );

    expect(undoneDashboard.lastPurchase).toBeNull();
    expect(undoneDashboard.session.purchases).toHaveLength(0);
    expect(undoneDashboard.session.liveState.nominatedTeamId).toBe(team.id);
    expect(undoneDashboard.session.liveState.currentBid).toBe(4200);
    expect(undoneDashboard.session.liveState.soldTeamIds).not.toContain(team.id);
    expect(
      undoneDashboard.ledger.find((candidate) => candidate.id === buyer.id)?.ownedTeamIds
    ).toEqual([]);
  });

  it("rejects undoing an older purchase once a newer one exists", async () => {
    const { repository, session } = await createBaselineSession();
    const [firstTeam, secondTeam] = session.projections;
    const buyer = session.syndicates.find((candidate) => candidate.name === "Riverboat");

    expect(firstTeam).toBeDefined();
    expect(secondTeam).toBeDefined();
    expect(buyer).toBeDefined();

    if (!firstTeam || !secondTeam || !buyer) {
      throw new Error("Expected baseline session data.");
    }

    const firstDashboard = await repository.recordPurchase(session.id, {
      teamId: firstTeam.id,
      buyerSyndicateId: buyer.id,
      price: 4100
    });
    await repository.recordPurchase(session.id, {
      teamId: secondTeam.id,
      buyerSyndicateId: buyer.id,
      price: 4300
    });

    await expect(repository.undoPurchase(session.id, firstDashboard.lastPurchase?.id)).rejects.toThrow(
      "Only the most recent purchase can be undone."
    );
  });
});

describe("repository team classifications", () => {
  beforeEach(async () => {
    storeFile = path.join(
      os.tmpdir(),
      `calcutta-smartbid-classifications-${Date.now()}-${Math.random().toString(36).slice(2)}.json`
    );
    process.env.CALCUTTA_STORAGE_BACKEND = "local";
    process.env.CALCUTTA_STORE_FILE = storeFile;
    process.env.MOTHERSHIP_SYNDICATE_NAME = "Mothership";
    await fs.rm(storeFile, { force: true });
  });

  afterEach(async () => {
    await fs.rm(storeFile, { force: true });
    delete process.env.CALCUTTA_STORE_FILE;
    delete process.env.CALCUTTA_STORAGE_BACKEND;
    delete process.env.MOTHERSHIP_SYNDICATE_NAME;
    vi.resetModules();
  });

  it("saves, overwrites, clears, and persists team classifications", async () => {
    const { repository, session } = await createBaselineSession();
    const teamId = session.projections[0]?.id;

    if (!teamId) {
      throw new Error("Expected baseline projections.");
    }

    await repository.saveTeamClassification(session.id, teamId, {
      classification: "must-have"
    });
    await repository.saveTeamClassification(session.id, teamId, {
      classification: "caution"
    });

    let reloadedRepository = await loadRepository();
    let reloadedSession = await reloadedRepository.getSession(session.id);

    expect(reloadedSession?.teamClassifications[teamId]?.classification).toBe("caution");

    await reloadedRepository.clearTeamClassification(session.id, teamId);

    reloadedRepository = await loadRepository();
    reloadedSession = await reloadedRepository.getSession(session.id);

    expect(reloadedSession?.teamClassifications[teamId]).toBeUndefined();
  });

  it("rejects invalid classification values and unknown teams", async () => {
    expect(
      saveTeamClassificationSchema.safeParse({ classification: "maybe" }).success
    ).toBe(false);

    const { repository, session } = await createBaselineSession();

    await expect(
      repository.saveTeamClassification(session.id, "ghost-team", {
        classification: "caution"
      })
    ).rejects.toThrow("Team classification team not found.");
  });

  it("preserves matching classifications on import and drops orphaned ones", async () => {
    const { repository, session } = await createBaselineSession();
    const teamId = session.projections[0]?.id;

    if (!teamId) {
      throw new Error("Expected baseline projections.");
    }

    await repository.saveTeamClassification(session.id, teamId, {
      classification: "must-have"
    });

    const rawStore = JSON.parse(await fs.readFile(storeFile, "utf8")) as {
      sessions: Array<{
        id: string;
        teamClassifications?: Record<string, { teamId: string; classification: string; updatedAt: string }>;
      }>;
    };
    const targetSession = rawStore.sessions.find((candidate) => candidate.id === session.id);
    expect(targetSession).toBeDefined();

    if (targetSession) {
      targetSession.teamClassifications = {
        ...(targetSession.teamClassifications ?? {}),
        ghost: {
          teamId: "ghost",
          classification: "nuclear-disaster",
          updatedAt: new Date().toISOString()
        }
      };
    }

    await fs.writeFile(storeFile, JSON.stringify(rawStore, null, 2), "utf8");

    const reloadedRepository = await loadRepository();
    await reloadedRepository.importSessionAnalysis(session.id, {
      selection: {
        mode: "upload",
        sourceName: "Metrics Feed",
        csvContent: buildFullAnalysisCsv()
      }
    });
    const importedSession = await reloadedRepository.getSession(session.id);

    expect(importedSession?.teamClassifications[teamId]?.classification).toBe("must-have");
    expect(importedSession?.teamClassifications.ghost).toBeUndefined();
  });
});

describe("repository team notes", () => {
  beforeEach(async () => {
    storeFile = path.join(
      os.tmpdir(),
      `calcutta-smartbid-team-notes-${Date.now()}-${Math.random().toString(36).slice(2)}.json`
    );
    process.env.CALCUTTA_STORAGE_BACKEND = "local";
    process.env.CALCUTTA_STORE_FILE = storeFile;
    process.env.MOTHERSHIP_SYNDICATE_NAME = "Mothership";
    await fs.rm(storeFile, { force: true });
  });

  afterEach(async () => {
    await fs.rm(storeFile, { force: true });
    delete process.env.CALCUTTA_STORE_FILE;
    delete process.env.CALCUTTA_STORAGE_BACKEND;
    delete process.env.MOTHERSHIP_SYNDICATE_NAME;
    vi.resetModules();
  });

  it("saves, overwrites, clears, and persists team notes", async () => {
    const { repository, session } = await createBaselineSession();
    const teamId = session.projections[0]?.id;

    if (!teamId) {
      throw new Error("Expected baseline projections.");
    }

    await repository.saveTeamNote(session.id, teamId, {
      note: "Disciplined late-game team"
    });
    await repository.saveTeamNote(session.id, teamId, {
      note: "Elite guard play"
    });

    let reloadedRepository = await loadRepository();
    let reloadedSession = await reloadedRepository.getSession(session.id);

    expect(reloadedSession?.teamNotes[teamId]?.note).toBe("Elite guard play");

    await reloadedRepository.clearTeamNote(session.id, teamId);

    reloadedRepository = await loadRepository();
    reloadedSession = await reloadedRepository.getSession(session.id);

    expect(reloadedSession?.teamNotes[teamId]).toBeUndefined();
  });

  it("rejects invalid notes and unknown teams", async () => {
    expect(saveTeamNoteSchema.safeParse({ note: "" }).success).toBe(false);
    expect(saveTeamNoteSchema.safeParse({ note: "x".repeat(81) }).success).toBe(false);

    const { repository, session } = await createBaselineSession();

    await expect(
      repository.saveTeamNote(session.id, "ghost-team", {
        note: "Fast-paced value"
      })
    ).rejects.toThrow("Team note team not found.");
  });

  it("preserves matching notes on import and drops orphaned ones", async () => {
    const { repository, session } = await createBaselineSession();
    const teamId = session.projections[0]?.id;

    if (!teamId) {
      throw new Error("Expected baseline projections.");
    }

    await repository.saveTeamNote(session.id, teamId, {
      note: "Strong inside-out balance"
    });

    const rawStore = JSON.parse(await fs.readFile(storeFile, "utf8")) as {
      sessions: Array<{
        id: string;
        teamNotes?: Record<string, { teamId: string; note: string; updatedAt: string }>;
      }>;
    };
    const targetSession = rawStore.sessions.find((candidate) => candidate.id === session.id);
    expect(targetSession).toBeDefined();

    if (targetSession) {
      targetSession.teamNotes = {
        ...(targetSession.teamNotes ?? {}),
        ghost: {
          teamId: "ghost",
          note: "Should disappear",
          updatedAt: new Date().toISOString()
        }
      };
    }

    await fs.writeFile(storeFile, JSON.stringify(rawStore, null, 2), "utf8");

    const reloadedRepository = await loadRepository();
    await reloadedRepository.importSessionAnalysis(session.id, {
      selection: {
        mode: "upload",
        sourceName: "Metrics Feed",
        csvContent: buildFullAnalysisCsv()
      }
    });
    const importedSession = await reloadedRepository.getSession(session.id);

    expect(importedSession?.teamNotes[teamId]?.note).toBe("Strong inside-out balance");
    expect(importedSession?.teamNotes.ghost).toBeUndefined();
  });
});

describe("repository bracket state", () => {
  beforeEach(async () => {
    storeFile = path.join(
      os.tmpdir(),
      `calcutta-smartbid-bracket-${Date.now()}-${Math.random().toString(36).slice(2)}.json`
    );
    process.env.CALCUTTA_STORAGE_BACKEND = "local";
    process.env.CALCUTTA_STORE_FILE = storeFile;
    process.env.MOTHERSHIP_SYNDICATE_NAME = "Mothership";
    await fs.rm(storeFile, { force: true });
  });

  afterEach(async () => {
    await fs.rm(storeFile, { force: true });
    delete process.env.CALCUTTA_STORE_FILE;
    delete process.env.CALCUTTA_STORAGE_BACKEND;
    delete process.env.MOTHERSHIP_SYNDICATE_NAME;
    vi.resetModules();
  });

  it("defaults missing bracket state and persists winner updates for a full field session", async () => {
    const repository = await loadRepository();
    const operator = await repository.createPlatformUser({
      name: "Operator",
      email: "operator@example.com"
    });
    const mothership = await repository.createSyndicateCatalogEntry({
      name: "Mothership"
    });
    const riverboat = await repository.createSyndicateCatalogEntry({
      name: "Riverboat"
    });
    const source = await repository.createDataSource({
      name: "Official Bracket Source",
      kind: "csv",
      purpose: "bracket",
      csvContent: buildFullBracketCsv(),
      fileName: "bracket.csv"
    });
    const analysisSource = await repository.createDataSource({
      name: "Metrics Feed Source",
      kind: "csv",
      purpose: "analysis",
      csvContent: buildFullAnalysisCsv(),
      fileName: "analysis.csv"
    });

    const session = await repository.createSession({
      name: "Bracket Test",
      sharedAccessCode: "bracket123",
      accessAssignments: [{ platformUserId: operator.id, role: "admin" }],
      catalogSyndicateIds: [mothership.id, riverboat.id],
      payoutRules: {
        ...getDefaultPayoutRules(),
        projectedPot: 100000
      },
      analysisSettings: {},
      bracketSelection: {
        mode: "saved-source",
        sourceKey: `data-source:${source.id}`
      },
      analysisSelection: {
        mode: "saved-source",
        sourceKey: `data-source:${analysisSource.id}`
      },
      simulationIterations: 1000
    });

    expect(session.bracketState.winnersByGameId).toEqual({});

    const rawStore = JSON.parse(await fs.readFile(storeFile, "utf8")) as {
      sessions: Array<{ id: string; bracketState?: { winnersByGameId?: Record<string, string | null> } }>;
    };
    const rawSession = rawStore.sessions.find((candidate) => candidate.id === session.id);
    expect(rawSession).toBeDefined();
    if (rawSession) {
      delete rawSession.bracketState;
    }
    await fs.writeFile(storeFile, JSON.stringify(rawStore, null, 2), "utf8");

    let reloadedRepository = await loadRepository();
    let reloadedSession = await reloadedRepository.getSession(session.id);
    expect(reloadedSession?.bracketState.winnersByGameId).toEqual({});

    await reloadedRepository.updateBracketGame(session.id, "south-round-of-64-1", "south-1");

    reloadedRepository = await loadRepository();
    reloadedSession = await reloadedRepository.getSession(session.id);
    expect(reloadedSession?.bracketState.winnersByGameId["south-round-of-64-1"]).toBe("south-1");
  });

  it("upserts viewer presence, counts active viewers, and excludes stale or removed viewers", async () => {
    const repository = await loadRepository();
    const operator = await repository.createPlatformUser({
      name: "Operator",
      email: "operator@example.com"
    });
    const viewer = await repository.createPlatformUser({
      name: "Viewer One",
      email: "viewer@example.com"
    });
    const mothership = await repository.createSyndicateCatalogEntry({
      name: "Mothership"
    });
    const riverboat = await repository.createSyndicateCatalogEntry({
      name: "Riverboat"
    });

    const session = await repository.createSession({
      name: "Presence Test",
      sharedAccessCode: "presence123",
      accessAssignments: [
        { platformUserId: operator.id, role: "admin" },
        { platformUserId: viewer.id, role: "viewer" }
      ],
      catalogSyndicateIds: [mothership.id, riverboat.id],
      payoutRules: {
        ...getDefaultPayoutRules(),
        projectedPot: 100000
      },
      analysisSettings: {},
      simulationIterations: 1000
    });

    const viewerMember = session.accessMembers.find((member) => member.email === viewer.email);
    expect(viewerMember).toBeDefined();

    if (!viewerMember) {
      throw new Error("Expected viewer session member.");
    }

    await repository.recordViewerPresence(session.id, viewerMember.id, "auction");
    await repository.recordViewerPresence(session.id, viewerMember.id, "bracket");

    let config = await repository.getSessionAdminConfig(session.id);
    expect(config.activeViewers).toHaveLength(1);
    expect(config.activeViewers[0]).toMatchObject({
      memberId: viewerMember.id,
      email: "viewer@example.com",
      currentView: "bracket"
    });

    let sessions = await repository.listSessions();
    expect(sessions.find((entry) => entry.id === session.id)?.activeViewerCount).toBe(1);

    const rawStore = JSON.parse(await fs.readFile(storeFile, "utf8")) as {
      viewerPresence: Array<{ sessionId: string; memberId: string; lastSeenAt: string }>;
    };
    rawStore.viewerPresence = rawStore.viewerPresence.map((entry) =>
      entry.sessionId === session.id && entry.memberId === viewerMember.id
        ? {
            ...entry,
            lastSeenAt: "2000-01-01T00:00:00.000Z"
          }
        : entry
    );
    await fs.writeFile(storeFile, JSON.stringify(rawStore, null, 2), "utf8");

    let reloadedRepository = await loadRepository();
    config = await reloadedRepository.getSessionAdminConfig(session.id);
    expect(config.activeViewers).toHaveLength(0);

    await reloadedRepository.recordViewerPresence(session.id, viewerMember.id, "auction");
    await reloadedRepository.updateSessionAccess(session.id, [
      { platformUserId: operator.id, role: "admin" }
    ]);

    reloadedRepository = await loadRepository();
    config = await reloadedRepository.getSessionAdminConfig(session.id);
    expect(config.activeViewers).toHaveLength(0);

    sessions = await reloadedRepository.listSessions();
    expect(sessions.find((entry) => entry.id === session.id)?.activeViewerCount).toBe(0);
  });
});
