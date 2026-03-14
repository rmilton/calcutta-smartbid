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
    analysisSettings: {
      targetTeamCount: 8,
      maxSingleTeamPct: 22
    },
    dataSourceKey: "builtin:mock",
    simulationIterations: 1000
  });

  return { repository, session };
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
      analysisSettings: {
        targetTeamCount: 8,
        maxSingleTeamPct: 22
      },
      dataSourceKey: "builtin:mock",
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
      analysisSettings: {
        targetTeamCount: 8,
        maxSingleTeamPct: 22
      },
      dataSourceKey: "builtin:mock",
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

    await repository.saveTeamClassification(session.id, "alabama", {
      classification: "must-have"
    });
    await repository.saveTeamClassification(session.id, "alabama", {
      classification: "caution"
    });

    let reloadedRepository = await loadRepository();
    let reloadedSession = await reloadedRepository.getSession(session.id);

    expect(reloadedSession?.teamClassifications.alabama?.classification).toBe("caution");

    await reloadedRepository.clearTeamClassification(session.id, "alabama");

    reloadedRepository = await loadRepository();
    reloadedSession = await reloadedRepository.getSession(session.id);

    expect(reloadedSession?.teamClassifications.alabama).toBeUndefined();
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
    await repository.saveTeamClassification(session.id, "alabama", {
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
    await reloadedRepository.runSessionImport(session.id);
    const importedSession = await reloadedRepository.getSession(session.id);

    expect(importedSession?.teamClassifications.alabama?.classification).toBe("must-have");
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

    await repository.saveTeamNote(session.id, "alabama", {
      note: "Disciplined late-game team"
    });
    await repository.saveTeamNote(session.id, "alabama", {
      note: "Elite guard play"
    });

    let reloadedRepository = await loadRepository();
    let reloadedSession = await reloadedRepository.getSession(session.id);

    expect(reloadedSession?.teamNotes.alabama?.note).toBe("Elite guard play");

    await reloadedRepository.clearTeamNote(session.id, "alabama");

    reloadedRepository = await loadRepository();
    reloadedSession = await reloadedRepository.getSession(session.id);

    expect(reloadedSession?.teamNotes.alabama).toBeUndefined();
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
    await repository.saveTeamNote(session.id, "alabama", {
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
    await reloadedRepository.runSessionImport(session.id);
    const importedSession = await reloadedRepository.getSession(session.id);

    expect(importedSession?.teamNotes.alabama?.note).toBe("Strong inside-out balance");
    expect(importedSession?.teamNotes.ghost).toBeUndefined();
  });
});
