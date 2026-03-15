import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  applyBracketWinnerMutation,
  createEmptyBracketState,
  normalizeBracketState
} from "@/lib/bracket";
import {
  buildDefaultMothershipFunding,
  deriveLegacyBudgetSeed,
  deriveSyndicateEstimateState,
  normalizeMothershipFunding,
  normalizeSyndicateEstimate
} from "@/lib/funding";
import { buildAuctionAssets } from "@/lib/auction-assets";
import {
  getConfiguredMothershipSyndicateName,
  getConfiguredStorageBackend
} from "@/lib/config";
import { buildDashboard } from "@/lib/dashboard";
import { simulateAuctionField } from "@/lib/engine/simulation";
import { getDefaultFinalFourPairings, getDefaultPayoutRules } from "@/lib/sample-data";
import {
  createSharedCodeLookup,
  encryptSharedCode,
  decryptSharedCode,
  hashSharedCode,
  verifySharedCode
} from "@/lib/session-security";
import {
  applyProjectionOverrides,
  loadProjectionProvider,
  loadProjectionsFromSource,
  testDataSourceConnection
} from "@/lib/providers/projections";
import {
  buildSessionImportReadiness,
  mergeBracketAndAnalysisImports,
  parseSessionAnalysisImport,
  parseSessionBracketImport
} from "@/lib/session-imports";
import { getSyndicateBrandColor } from "@/lib/syndicate-colors";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  AccessMember,
  AnalysisSettings,
  AdminCenterData,
  AdminSessionSummary,
  AuthenticatedMember,
  AuctionAsset,
  AuctionDashboard,
  AuctionSession,
  BracketState,
  CsvAnalysisPortfolio,
  DataImportRun,
  DataSource,
  DataSourcePurpose,
  MothershipFundingModel,
  PlatformUser,
  ProjectionOverride,
  PurchaseRecord,
  PayoutRules,
  SessionAnalysisImport,
  SessionAdminConfig,
  SessionDataSourceRef,
  SessionImportReadiness,
  SessionRole,
  SessionBracketImport,
  SessionSourceSelection,
  SessionSyndicateFundingInput,
  StoredAuctionSession,
  StorageBackend,
  Syndicate,
  SyndicateCatalogEntry,
  TeamClassificationTag,
  TeamClassificationValue,
  TeamNoteTag,
  TeamProjection,
  createDataSourceSchema,
  createPlatformUserSchema,
  createSessionSchema,
  updateBracketGameSchema,
  saveTeamNoteSchema,
  createSyndicateCatalogSchema,
  updateDataSourceSchema,
  updatePlatformUserSchema,
  updateSyndicateCatalogSchema
} from "@/lib/types";
import { createId, roundCurrency } from "@/lib/utils";

interface SessionStore {
  sessions: StoredAuctionSession[];
  platformUsers: PlatformUser[];
  syndicateCatalog: SyndicateCatalogEntry[];
  dataSources: DataSource[];
  dataImportRuns: DataImportRun[];
  csvAnalysisPortfolios: CsvAnalysisPortfolio[];
}

interface CreateSessionInput {
  name: string;
  sharedAccessCode: string;
  accessAssignments: Array<{ platformUserId: string; role: SessionRole }>;
  catalogSyndicateIds: string[];
  payoutRules: PayoutRules;
  analysisSettings: AnalysisSettings;
  bracketSelection?: SessionSourceSelection;
  analysisSelection?: SessionSourceSelection;
  simulationIterations: number;
}

interface ProjectionOverrideInput {
  rating?: number;
  offense?: number;
  defense?: number;
  tempo?: number;
}

interface TeamClassificationInput {
  classification: TeamClassificationValue;
}

interface TeamNoteInput {
  note: string;
}

const storeFile =
  process.env.CALCUTTA_STORE_FILE ?? path.join(os.tmpdir(), "calcutta-smartbid-store.json");

const builtinMockSource: SessionDataSourceRef = {
  key: "builtin:mock",
  name: "Built-in Mock Field",
  kind: "builtin"
};

export interface SessionRepository {
  backend: StorageBackend;
  createSession(input: CreateSessionInput): Promise<StoredAuctionSession>;
  listSessions(): Promise<AdminSessionSummary[]>;
  getAdminCenterData(): Promise<AdminCenterData>;
  getSessionAdminConfig(sessionId: string): Promise<SessionAdminConfig>;
  getSession(sessionId: string): Promise<StoredAuctionSession | null>;
  getDashboard(sessionId: string): Promise<AuctionDashboard>;
  getAccessMember(sessionId: string, memberId: string): Promise<AccessMember | null>;
  authenticateMember(
    email: string,
    sharedCode: string
  ): Promise<{ sessionId: string; member: AccessMember }>;
  createPlatformUser(input: {
    name: string;
    email: string;
    active?: boolean;
  }): Promise<PlatformUser>;
  updatePlatformUser(
    userId: string,
    input: Partial<{ name: string; email: string; active: boolean }>
  ): Promise<PlatformUser>;
  createSyndicateCatalogEntry(input: {
    name: string;
    active?: boolean;
  }): Promise<SyndicateCatalogEntry>;
  updateSyndicateCatalogEntry(
    entryId: string,
    input: Partial<{ name: string; active: boolean }>
  ): Promise<SyndicateCatalogEntry>;
  createDataSource(input: {
    name: string;
    kind?: "csv";
    purpose: DataSourcePurpose;
    active?: boolean;
    csvContent?: string;
    fileName?: string | null;
  }): Promise<DataSource>;
  updateDataSource(
    sourceId: string,
    input: Partial<{
      name: string;
      active: boolean;
      csvContent: string;
      fileName: string | null;
    }>
  ): Promise<DataSource>;
  testDataSource(sourceId: string): Promise<void>;
  updateSessionAccess(
    sessionId: string,
    assignments: Array<{ platformUserId: string; role: SessionRole; active?: boolean }>
  ): Promise<SessionAdminConfig>;
  rotateSessionSharedCode(sessionId: string, sharedAccessCode: string): Promise<SessionAdminConfig>;
  updateSessionPayoutRules(
    sessionId: string,
    payoutRules: PayoutRules
  ): Promise<SessionAdminConfig>;
  updateSessionFunding(
    sessionId: string,
    mothershipFunding: MothershipFundingModel
  ): Promise<SessionAdminConfig>;
  updateSessionAnalysisSettings(
    sessionId: string,
    analysisSettings: AnalysisSettings
  ): Promise<SessionAdminConfig>;
  archiveSession(
    sessionId: string,
    actor: Pick<AuthenticatedMember, "name" | "email">
  ): Promise<void>;
  deleteSession(
    sessionId: string,
    actor: Pick<AuthenticatedMember, "name" | "email">,
    confirmationName: string
  ): Promise<void>;
  updateSessionSyndicates(
    sessionId: string,
    input: {
      catalogSyndicateIds: string[];
      syndicateFunding: SessionSyndicateFundingInput[];
    }
  ): Promise<SessionAdminConfig>;
  importSessionBracket(
    sessionId: string,
    input: { selection: SessionSourceSelection }
  ): Promise<SessionAdminConfig>;
  importSessionAnalysis(
    sessionId: string,
    input: { selection: SessionSourceSelection }
  ): Promise<SessionAdminConfig>;
  setSessionDataSource(sessionId: string, sourceKey: string): Promise<SessionAdminConfig>;
  runSessionImport(sessionId: string, sourceKey?: string): Promise<SessionAdminConfig>;
  importProjections(sessionId: string, provider: "mock" | "remote"): Promise<AuctionDashboard>;
  rebuildSimulation(sessionId: string, iterations?: number): Promise<AuctionDashboard>;
  updateLiveState(
    sessionId: string,
    patch: { nominatedAssetId?: string | null; nominatedTeamId?: string | null; currentBid?: number }
  ): Promise<AuctionDashboard>;
  recordPurchase(
    sessionId: string,
    input: { assetId?: string; teamId?: string; buyerSyndicateId: string; price: number }
  ): Promise<AuctionDashboard>;
  undoPurchase(sessionId: string, purchaseId?: string): Promise<AuctionDashboard>;
  saveProjectionOverride(
    sessionId: string,
    teamId: string,
    input: ProjectionOverrideInput
  ): Promise<AuctionDashboard>;
  clearProjectionOverride(sessionId: string, teamId: string): Promise<AuctionDashboard>;
  saveTeamClassification(
    sessionId: string,
    teamId: string,
    input: TeamClassificationInput
  ): Promise<AuctionDashboard>;
  clearTeamClassification(sessionId: string, teamId: string): Promise<AuctionDashboard>;
  saveTeamNote(sessionId: string, teamId: string, input: TeamNoteInput): Promise<AuctionDashboard>;
  clearTeamNote(sessionId: string, teamId: string): Promise<AuctionDashboard>;
  updateBracketGame(sessionId: string, gameId: string, winnerTeamId: string | null): Promise<AuctionDashboard>;
  getCsvAnalysisPortfolio(sessionId: string, memberId: string): Promise<CsvAnalysisPortfolio>;
  saveCsvAnalysisPortfolio(
    sessionId: string,
    memberId: string,
    entries: Array<{ teamId: string; paidPrice: number }>
  ): Promise<CsvAnalysisPortfolio>;
}

class LocalSessionRepository implements SessionRepository {
  readonly backend = "local" as const;

  async createSession(input: CreateSessionInput) {
    const store = await this.readStore();
    ensureUniqueSessionSharedCode(store.sessions, input.sharedAccessCode);
    const session = await createSessionModel(input, store);
    store.sessions.push(session);
    await this.writeStore(store);
    return session;
  }

  async listSessions() {
    const store = await this.readStore();
    return store.sessions
      .map((session) => buildAdminSessionSummary(session))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  async getAdminCenterData() {
    const store = await this.readStore();
    return {
      sessions: await this.listSessions(),
      platformUsers: [...store.platformUsers].sort(sortByName),
      syndicateCatalog: [...store.syndicateCatalog].sort(sortByName),
      dataSources: [...store.dataSources].sort(sortByName)
    };
  }

  async getSessionAdminConfig(sessionId: string) {
    const store = await this.readStore();
    const session = findSession(store.sessions, sessionId);
    return buildSessionAdminConfig(session, store);
  }

  async getSession(sessionId: string) {
    const store = await this.readStore();
    return store.sessions.find((session) => session.id === sessionId) ?? null;
  }

  async getDashboard(sessionId: string) {
    const session = await this.requireSession(sessionId);
    return buildDashboard(session, this.backend);
  }

  async getAccessMember(sessionId: string, memberId: string) {
    const session = await this.requireSession(sessionId);
    return session.accessMembers.find((member) => member.id === memberId) ?? null;
  }

  async authenticateMember(email: string, sharedCode: string) {
    const store = await this.readStore();
    const normalizedEmail = email.trim().toLowerCase();
    const session = store.sessions.find((candidate) => doesSharedCodeMatch(candidate, sharedCode));

    if (!session) {
      throw new Error("Email or shared code is invalid.");
    }

    const member =
      session.accessMembers.find(
        (candidate) =>
          candidate.active && candidate.email.trim().toLowerCase() === normalizedEmail
      ) ?? null;

    if (!member) {
      throw new Error("Email or shared code is invalid.");
    }

    return {
      sessionId: session.id,
      member
    };
  }

  async createPlatformUser(input: { name: string; email: string; active?: boolean }) {
    const store = await this.readStore();
    const parsed = createPlatformUserSchema.parse(input);
    ensureUniquePlatformUserEmail(store.platformUsers, parsed.email);
    const now = new Date().toISOString();
    const user: PlatformUser = {
      id: createId("user"),
      name: parsed.name.trim(),
      email: parsed.email.trim().toLowerCase(),
      active: parsed.active,
      createdAt: now,
      updatedAt: now
    };
    store.platformUsers.push(user);
    await this.writeStore(store);
    return user;
  }

  async updatePlatformUser(
    userId: string,
    input: Partial<{ name: string; email: string; active: boolean }>
  ) {
    const store = await this.readStore();
    const user = findById(store.platformUsers, userId, "Platform user not found.");
    const parsed = updatePlatformUserSchema.parse(input);
    if (parsed.email && parsed.email.trim().toLowerCase() !== user.email) {
      ensureUniquePlatformUserEmail(store.platformUsers, parsed.email, userId);
      user.email = parsed.email.trim().toLowerCase();
    }
    if (parsed.name) {
      user.name = parsed.name.trim();
    }
    if (parsed.active !== undefined) {
      user.active = parsed.active;
    }
    user.updatedAt = new Date().toISOString();
    syncSessionMembersForPlatformUser(store.sessions, user);
    await this.writeStore(store);
    return user;
  }

  async createSyndicateCatalogEntry(input: {
    name: string;
    active?: boolean;
  }) {
    const store = await this.readStore();
    const parsed = createSyndicateCatalogSchema.parse(input);
    const name = parsed.name.trim();
    ensureUniqueCatalogSyndicateName(store.syndicateCatalog, parsed.name);
    const now = new Date().toISOString();
    const entry: SyndicateCatalogEntry = {
      id: createId("catalog"),
      name,
      color: getSyndicateBrandColor(name),
      active: parsed.active,
      createdAt: now,
      updatedAt: now
    };
    store.syndicateCatalog.push(entry);
    await this.writeStore(store);
    return entry;
  }

  async updateSyndicateCatalogEntry(
    entryId: string,
    input: Partial<{ name: string; active: boolean }>
  ) {
    const store = await this.readStore();
    const entry = findById(store.syndicateCatalog, entryId, "Syndicate catalog entry not found.");
    const parsed = updateSyndicateCatalogSchema.parse(input);
    if (parsed.name && parsed.name.trim().toLowerCase() !== entry.name.toLowerCase()) {
      ensureUniqueCatalogSyndicateName(store.syndicateCatalog, parsed.name, entryId);
      entry.name = parsed.name.trim();
    }
    entry.color = getSyndicateBrandColor(entry.name);
    if (parsed.active !== undefined) {
      entry.active = parsed.active;
    }
    entry.updatedAt = new Date().toISOString();
    syncSessionSyndicatesForCatalogEntry(store.sessions, entry);
    await this.writeStore(store);
    return entry;
  }

  async createDataSource(input: {
    name: string;
    kind?: "csv";
    purpose: DataSourcePurpose;
    active?: boolean;
    csvContent?: string;
    fileName?: string | null;
  }) {
    const store = await this.readStore();
    const parsed = createDataSourceSchema.parse(input);
    const now = new Date().toISOString();
    const source: DataSource = {
      id: createId("source"),
      name: parsed.name.trim(),
      kind: "csv",
      purpose: parsed.purpose,
      active: parsed.active,
      config: {
        csvContent: parsed.csvContent,
        fileName: parsed.fileName ?? null
      },
      createdAt: now,
      updatedAt: now,
      lastTestedAt: null
    };
    store.dataSources.push(source);
    await this.writeStore(store);
    return source;
  }

  async updateDataSource(
    sourceId: string,
    input: Partial<{
      name: string;
      active: boolean;
      csvContent: string;
      fileName: string | null;
    }>
  ) {
    const store = await this.readStore();
    const source = findById(store.dataSources, sourceId, "Data source not found.");
    const parsed = updateDataSourceSchema.parse(input);
    if (parsed.name) {
      source.name = parsed.name.trim();
    }
    if (parsed.active !== undefined) {
      source.active = parsed.active;
    }
    if (source.kind === "csv") {
      source.config = {
        csvContent: parsed.csvContent ?? (source.config as { csvContent: string }).csvContent,
        fileName:
          parsed.fileName ?? (source.config as { fileName: string | null }).fileName ?? null
      };
    }
    source.updatedAt = new Date().toISOString();
    syncSessionActiveDataSource(store.sessions, source);
    await this.writeStore(store);
    return source;
  }

  async testDataSource(sourceId: string) {
    const store = await this.readStore();
    const source = findById(store.dataSources, sourceId, "Data source not found.");
    await testDataSourceConnection(source);
    source.lastTestedAt = new Date().toISOString();
    await this.writeStore(store);
  }

  async updateSessionAccess(
    sessionId: string,
    assignments: Array<{ platformUserId: string; role: SessionRole; active?: boolean }>
  ) {
    const store = await this.readStore();
    const session = findSession(store.sessions, sessionId);
    session.accessMembers = buildAccessMembers(assignments, store.platformUsers, session.accessMembers);
    session.updatedAt = new Date().toISOString();
    await this.writeStore(store);
    return buildSessionAdminConfig(session, store);
  }

  async rotateSessionSharedCode(sessionId: string, sharedAccessCode: string) {
    const store = await this.readStore();
    const session = findSession(store.sessions, sessionId);
    ensureUniqueSessionSharedCode(store.sessions, sharedAccessCode, sessionId);
    setStoredSharedAccessCode(session, sharedAccessCode);
    session.updatedAt = new Date().toISOString();
    await this.writeStore(store);
    return buildSessionAdminConfig(session, store);
  }

  async updateSessionPayoutRules(sessionId: string, payoutRules: PayoutRules) {
    const store = await this.readStore();
    const session = findSession(store.sessions, sessionId);
    applyPayoutRulesMutation(session, payoutRules);
    await this.writeStore(store);
    return buildSessionAdminConfig(session, store);
  }

  async updateSessionFunding(sessionId: string, mothershipFunding: MothershipFundingModel) {
    const store = await this.readStore();
    const session = findSession(store.sessions, sessionId);
    applyMothershipFundingMutation(session, mothershipFunding);
    await this.writeStore(store);
    return buildSessionAdminConfig(session, store);
  }

  async updateSessionAnalysisSettings(sessionId: string, analysisSettings: AnalysisSettings) {
    const store = await this.readStore();
    const session = findSession(store.sessions, sessionId);
    session.analysisSettings = normalizeAnalysisSettings(analysisSettings);
    session.updatedAt = new Date().toISOString();
    await this.writeStore(store);
    return buildSessionAdminConfig(session, store);
  }

  async archiveSession(
    sessionId: string,
    actor: Pick<AuthenticatedMember, "name" | "email">
  ) {
    const store = await this.readStore();
    const session = findSession(store.sessions, sessionId);

    if (!session.archivedAt) {
      session.archivedAt = new Date().toISOString();
      session.archivedByName = actor.name;
      session.archivedByEmail = actor.email;
      session.updatedAt = session.archivedAt;
      await this.writeStore(store);
    }
  }

  async deleteSession(
    sessionId: string,
    _actor: Pick<AuthenticatedMember, "name" | "email">,
    confirmationName: string
  ) {
    const store = await this.readStore();
    const session = findSession(store.sessions, sessionId);

    if (!session.archivedAt) {
      throw new Error("Archive the session before deleting it permanently.");
    }

    if (confirmationName !== session.name) {
      throw new Error("Session name confirmation does not match.");
    }

    store.sessions = store.sessions.filter((candidate) => candidate.id !== sessionId);
    store.dataImportRuns = store.dataImportRuns.filter((run) => run.sessionId !== sessionId);
    store.csvAnalysisPortfolios = store.csvAnalysisPortfolios.filter(
      (portfolio) => portfolio.sessionId !== sessionId
    );
    await this.writeStore(store);
  }

  async updateSessionSyndicates(
    sessionId: string,
    input: {
      catalogSyndicateIds: string[];
      syndicateFunding: SessionSyndicateFundingInput[];
    }
  ) {
    const store = await this.readStore();
    const session = findSession(store.sessions, sessionId);
    session.syndicates = rebuildSessionSyndicates(
      session,
      store.syndicateCatalog,
      input.catalogSyndicateIds
    );
    session.syndicates = applySyndicateFundingUpdates(session, session.syndicates, input.syndicateFunding);
    session.focusSyndicateId = requireSessionFocusSyndicate(session).id;
    session.syndicates = recalculateSyndicateValues(session);
    session.updatedAt = new Date().toISOString();
    await this.writeStore(store);
    return buildSessionAdminConfig(session, store);
  }

  async importSessionBracket(
    sessionId: string,
    input: { selection: SessionSourceSelection }
  ) {
    const store = await this.readStore();
    const session = findSession(store.sessions, sessionId);
    if (session.purchases.length > 0) {
      throw new Error("Cannot replace projections after purchases have been recorded.");
    }
    const bracketImport = resolveSessionImportSelection(
      input.selection,
      "bracket",
      store.dataSources
    );
    if (!bracketImport) {
      throw new Error("Bracket import payload is required.");
    }
    session.bracketImport = bracketImport;

    try {
      applySessionManagedImports(session);
      store.dataImportRuns.push(
        createImportRun(
          session.id,
          { key: "session:bracket", name: bracketImport.sourceName, kind: "csv" },
          "success",
          "Bracket import completed."
        )
      );
      await this.writeStore(store);
      return buildSessionAdminConfig(session, store);
    } catch (error) {
      store.dataImportRuns.push(
        createImportRun(
          session.id,
          { key: "session:bracket", name: bracketImport.sourceName, kind: "csv" },
          "failed",
          error instanceof Error ? error.message : "Unable to import bracket."
        )
      );
      await this.writeStore(store);
      throw error;
    }
  }

  async importSessionAnalysis(
    sessionId: string,
    input: { selection: SessionSourceSelection }
  ) {
    const store = await this.readStore();
    const session = findSession(store.sessions, sessionId);
    if (session.purchases.length > 0) {
      throw new Error("Cannot replace projections after purchases have been recorded.");
    }
    const analysisImport = resolveSessionImportSelection(
      input.selection,
      "analysis",
      store.dataSources
    );
    if (!analysisImport) {
      throw new Error("Analysis import payload is required.");
    }
    session.analysisImport = analysisImport;

    try {
      applySessionManagedImports(session);
      store.dataImportRuns.push(
        createImportRun(
          session.id,
          { key: "session:analysis", name: analysisImport.sourceName, kind: "csv" },
          "success",
          "Analysis import completed."
        )
      );
      await this.writeStore(store);
      return buildSessionAdminConfig(session, store);
    } catch (error) {
      store.dataImportRuns.push(
        createImportRun(
          session.id,
          { key: "session:analysis", name: analysisImport.sourceName, kind: "csv" },
          "failed",
          error instanceof Error ? error.message : "Unable to import analysis."
        )
      );
      await this.writeStore(store);
      throw error;
    }
  }

  async setSessionDataSource(sessionId: string, sourceKey: string) {
    const store = await this.readStore();
    const session = findSession(store.sessions, sessionId);
    session.activeDataSource = resolveDataSourceRef(sourceKey, store.dataSources);
    session.updatedAt = new Date().toISOString();
    await this.writeStore(store);
    return buildSessionAdminConfig(session, store);
  }

  async runSessionImport(sessionId: string, sourceKey?: string) {
    const store = await this.readStore();
    const session = findSession(store.sessions, sessionId);
    const resolvedSource = resolveDataSourceRef(sourceKey ?? session.activeDataSource.key, store.dataSources);
    session.activeDataSource = resolvedSource;
    try {
      await applyProjectionImport(session, resolvedSource, store.dataSources);
      const run = createImportRun(session.id, resolvedSource, "success", "Import completed.");
      store.dataImportRuns.push(run);
      await this.writeStore(store);
      return buildSessionAdminConfig(session, store);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to import projections.";
      store.dataImportRuns.push(createImportRun(session.id, resolvedSource, "failed", message));
      await this.writeStore(store);
      throw error;
    }
  }

  async importProjections(sessionId: string, provider: "mock" | "remote") {
    const store = await this.readStore();
    const session = findSession(store.sessions, sessionId);
    await applyProjectionImportLegacy(session, provider);
    await this.writeStore(store);
    return buildDashboard(session, this.backend);
  }

  async rebuildSimulation(sessionId: string, iterations?: number) {
    const store = await this.readStore();
    const session = findSession(store.sessions, sessionId);
    recalculateSessionState(session, iterations);
    await this.writeStore(store);
    return buildDashboard(session, this.backend);
  }

  async updateLiveState(
    sessionId: string,
    patch: { nominatedAssetId?: string | null; nominatedTeamId?: string | null; currentBid?: number }
  ) {
    const store = await this.readStore();
    const session = findSession(store.sessions, sessionId);
    applyLiveStatePatch(session, patch);
    await this.writeStore(store);
    return buildDashboard(session, this.backend);
  }

  async recordPurchase(
    sessionId: string,
    input: { assetId?: string; teamId?: string; buyerSyndicateId: string; price: number }
  ) {
    const store = await this.readStore();
    const session = findSession(store.sessions, sessionId);
    applyPurchaseMutation(session, input);
    await this.writeStore(store);
    return buildDashboard(session, this.backend);
  }

  async undoPurchase(sessionId: string, purchaseId?: string) {
    const store = await this.readStore();
    const session = findSession(store.sessions, sessionId);
    undoPurchaseMutation(session, purchaseId);
    await this.writeStore(store);
    return buildDashboard(session, this.backend);
  }

  async saveProjectionOverride(sessionId: string, teamId: string, input: ProjectionOverrideInput) {
    const store = await this.readStore();
    const session = findSession(store.sessions, sessionId);
    applyProjectionOverrideMutation(session, teamId, input);
    await this.writeStore(store);
    return buildDashboard(session, this.backend);
  }

  async clearProjectionOverride(sessionId: string, teamId: string) {
    const store = await this.readStore();
    const session = findSession(store.sessions, sessionId);
    clearProjectionOverrideMutation(session, teamId);
    await this.writeStore(store);
    return buildDashboard(session, this.backend);
  }

  async saveTeamClassification(
    sessionId: string,
    teamId: string,
    input: TeamClassificationInput
  ) {
    const store = await this.readStore();
    const session = findSession(store.sessions, sessionId);
    applyTeamClassificationMutation(session, teamId, input);
    await this.writeStore(store);
    return buildDashboard(session, this.backend);
  }

  async clearTeamClassification(sessionId: string, teamId: string) {
    const store = await this.readStore();
    const session = findSession(store.sessions, sessionId);
    clearTeamClassificationMutation(session, teamId);
    await this.writeStore(store);
    return buildDashboard(session, this.backend);
  }

  async saveTeamNote(sessionId: string, teamId: string, input: TeamNoteInput) {
    const store = await this.readStore();
    const session = findSession(store.sessions, sessionId);
    applyTeamNoteMutation(session, teamId, input);
    await this.writeStore(store);
    return buildDashboard(session, this.backend);
  }

  async clearTeamNote(sessionId: string, teamId: string) {
    const store = await this.readStore();
    const session = findSession(store.sessions, sessionId);
    clearTeamNoteMutation(session, teamId);
    await this.writeStore(store);
    return buildDashboard(session, this.backend);
  }

  async updateBracketGame(sessionId: string, gameId: string, winnerTeamId: string | null) {
    const store = await this.readStore();
    const session = findSession(store.sessions, sessionId);
    const parsed = updateBracketGameSchema.parse({ winnerTeamId });
    applyBracketWinnerMutation(session, gameId, parsed.winnerTeamId);
    await this.writeStore(store);
    return buildDashboard(session, this.backend);
  }

  async getCsvAnalysisPortfolio(sessionId: string, memberId: string) {
    const store = await this.readStore();
    findSession(store.sessions, sessionId);
    const existing =
      store.csvAnalysisPortfolios.find(
        (item) => item.sessionId === sessionId && item.memberId === memberId
      ) ?? null;
    if (existing) {
      return {
        ...existing,
        entries: sanitizeCsvPortfolioEntries(existing.entries)
      };
    }

    return {
      sessionId,
      memberId,
      entries: [],
      updatedAt: new Date(0).toISOString()
    };
  }

  async saveCsvAnalysisPortfolio(
    sessionId: string,
    memberId: string,
    entries: Array<{ teamId: string; paidPrice: number }>
  ) {
    const store = await this.readStore();
    findSession(store.sessions, sessionId);
    const normalizedEntries = sanitizeCsvPortfolioEntries(entries);
    const updatedAt = new Date().toISOString();

    const existingIndex = store.csvAnalysisPortfolios.findIndex(
      (item) => item.sessionId === sessionId && item.memberId === memberId
    );

    const next: CsvAnalysisPortfolio = {
      sessionId,
      memberId,
      entries: normalizedEntries,
      updatedAt
    };

    if (existingIndex >= 0) {
      store.csvAnalysisPortfolios[existingIndex] = next;
    } else {
      store.csvAnalysisPortfolios.push(next);
    }

    await this.writeStore(store);
    return next;
  }

  private async requireSession(sessionId: string) {
    const session = await this.getSession(sessionId);
    if (!session) {
      throw new Error("Auction session not found.");
    }
    return session;
  }

  private async readStore(): Promise<SessionStore> {
    try {
      const content = await fs.readFile(storeFile, "utf8");
      return normalizeStoreShape(JSON.parse(content) as SessionStore);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return {
          sessions: [],
          platformUsers: [],
          syndicateCatalog: [],
          dataSources: [],
          dataImportRuns: [],
          csvAnalysisPortfolios: []
        };
      }
      throw error;
    }
  }

  private async writeStore(store: SessionStore) {
    await fs.writeFile(storeFile, JSON.stringify(store, null, 2), "utf8");
  }
}

class SupabaseSessionRepository implements SessionRepository {
  readonly backend = "supabase" as const;

  async createSession(input: CreateSessionInput) {
    const session = await createSessionModel(input, await this.readReferenceData());
    await this.persistFullSession(session);
    return session;
  }

  async listSessions() {
    return (await this.getAdminCenterData()).sessions;
  }

  async getAdminCenterData() {
    const client = requireSupabaseClient();
    const [
      sessionsResult,
      syndicatesResult,
      purchasesResult,
      projectionsResult,
      overridesResult,
      membersResult,
      usersResult,
      catalogResult,
      sourcesResult
    ] = await Promise.all([
      client
        .from("auction_sessions")
        .select(
          "id, name, created_at, updated_at, archived_at, projection_provider, bracket_import, analysis_import"
        )
        .order("updated_at", { ascending: false }),
      client.from("syndicates").select("session_id"),
      client.from("purchase_records").select("session_id"),
      client.from("team_projections").select("session_id"),
      client.from("projection_overrides").select("session_id"),
      client.from("session_members").select("session_id, role, active"),
      client.from("platform_users").select("*").order("name", { ascending: true }),
      client.from("syndicate_catalog").select("*").order("name", { ascending: true }),
      client.from("data_sources").select("*").order("name", { ascending: true })
    ]);

    throwOnSupabaseError(sessionsResult.error);
    throwOnSupabaseError(syndicatesResult.error);
    throwOnSupabaseError(purchasesResult.error);
    throwOnSupabaseError(projectionsResult.error);
    throwOnSupabaseError(overridesResult.error);
    throwOnSupabaseError(membersResult.error);
    throwOnSupabaseError(usersResult.error);
    throwOnSupabaseError(catalogResult.error);
    throwOnSupabaseError(sourcesResult.error);

    const syndicateCounts = countRowsBySession(
      (syndicatesResult.data as Array<Record<string, unknown>> | null) ?? []
    );
    const purchaseCounts = countRowsBySession(
      (purchasesResult.data as Array<Record<string, unknown>> | null) ?? []
    );
    const projectionCounts = countRowsBySession(
      (projectionsResult.data as Array<Record<string, unknown>> | null) ?? []
    );
    const overrideCounts = countRowsBySession(
      (overridesResult.data as Array<Record<string, unknown>> | null) ?? []
    );
    const memberCounts = countMembersBySession(
      (membersResult.data as Array<Record<string, unknown>> | null) ?? []
    );

    return {
      sessions: (((sessionsResult.data as Array<Record<string, unknown>> | null) ?? []).map(
        (row) => {
          const sessionId = String(row.id);
          const memberCount = memberCounts.get(sessionId) ?? {
            adminCount: 0,
            viewerCount: 0
          };
          const readiness = buildAdminImportReadinessFromSummaryData({
            bracketImport: row.bracket_import as SessionBracketImport | null | undefined,
            analysisImport: row.analysis_import as SessionAnalysisImport | null | undefined,
            projectionCount: projectionCounts.get(sessionId) ?? 0
          });

          return {
            id: sessionId,
            name: String(row.name),
            createdAt: String(row.created_at),
            updatedAt: String(row.updated_at),
            isArchived: row.archived_at !== null,
            archivedAt: row.archived_at ? String(row.archived_at) : null,
            projectionProvider: String(row.projection_provider),
            bracketSourceName: readiness.hasBracket
              ? normalizeBracketImport(row.bracket_import as SessionBracketImport | null | undefined)
                  ?.sourceName ?? null
              : null,
            analysisSourceName: readiness.hasAnalysis
              ? normalizeAnalysisImport(row.analysis_import as SessionAnalysisImport | null | undefined)
                  ?.sourceName ?? null
              : null,
            importReadinessStatus: readiness.status,
            importReadinessSummary: readiness.summary,
            purchaseCount: purchaseCounts.get(sessionId) ?? 0,
            syndicateCount: syndicateCounts.get(sessionId) ?? 0,
            overrideCount: overrideCounts.get(sessionId) ?? 0,
            adminCount: memberCount.adminCount,
            viewerCount: memberCount.viewerCount
          } satisfies AdminSessionSummary;
        }
      )) as AdminSessionSummary[],
      platformUsers: mapPlatformUsers(usersResult.data),
      syndicateCatalog: mapSyndicateCatalog(catalogResult.data),
      dataSources: mapDataSources(sourcesResult.data)
    };
  }

  async getSessionAdminConfig(sessionId: string) {
    const [session, refs, importRuns] = await Promise.all([
      this.requireSession(sessionId),
      this.readReferenceData(),
      this.listImportRuns(sessionId)
    ]);
    return {
      session,
      currentSharedAccessCode: getStoredSharedAccessCode(session),
      accessMembers: session.accessMembers,
      platformUsers: refs.platformUsers,
      syndicateCatalog: refs.syndicateCatalog,
      dataSources: refs.dataSources,
      importRuns
    };
  }

  async getSession(sessionId: string) {
    const client = requireSupabaseClient();
    const [
      sessionResult,
      syndicatesResult,
      projectionsResult,
      purchasesResult,
      snapshotResult,
      overridesResult,
      classificationsResult,
      notesResult,
      membersResult,
      usersResult
    ] = await Promise.all([
      client.from("auction_sessions").select("*").eq("id", sessionId).maybeSingle(),
      client.from("syndicates").select("*").eq("session_id", sessionId),
      client.from("team_projections").select("*").eq("session_id", sessionId),
      client
        .from("purchase_records")
        .select("*")
        .eq("session_id", sessionId)
        .order("created_at", { ascending: true }),
      client
        .from("simulation_snapshots")
        .select("*")
        .eq("session_id", sessionId)
        .order("generated_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      client.from("projection_overrides").select("*").eq("session_id", sessionId),
      client.from("team_classifications").select("*").eq("session_id", sessionId),
      client.from("team_notes").select("*").eq("session_id", sessionId),
      client.from("session_members").select("*").eq("session_id", sessionId),
      client.from("platform_users").select("*")
    ]);

    throwOnSupabaseError(sessionResult.error);
    throwOnSupabaseError(syndicatesResult.error);
    throwOnSupabaseError(projectionsResult.error);
    throwOnSupabaseError(purchasesResult.error);
    throwOnSupabaseError(snapshotResult.error);
    throwOnSupabaseError(overridesResult.error);
    throwOnSupabaseError(classificationsResult.error);
    throwOnSupabaseError(notesResult.error);
    throwOnSupabaseError(membersResult.error);
    throwOnSupabaseError(usersResult.error);

    if (!sessionResult.data) {
      return null;
    }

    const platformUsers = mapPlatformUsers(usersResult.data);
    const baseProjections = sortProjections(
      (((projectionsResult.data as Array<Record<string, unknown>> | null) ?? []).map(
        mapTeamProjectionRow
      ) as TeamProjection[])
    );

    const overrides = Object.fromEntries(
      ((overridesResult.data as Array<Record<string, unknown>> | null) ?? []).map((row) => [
        String(row.team_id),
        {
          teamId: String(row.team_id),
          rating: numberOrUndefined(row.rating),
          offense: numberOrUndefined(row.offense),
          defense: numberOrUndefined(row.defense),
          tempo: numberOrUndefined(row.tempo),
          updatedAt: String(row.updated_at)
        } satisfies ProjectionOverride
      ])
    );
    const teamClassifications = Object.fromEntries(
      ((classificationsResult.data as Array<Record<string, unknown>> | null) ?? []).map((row) => [
        String(row.team_id),
        {
          teamId: String(row.team_id),
          classification: String(row.classification) as TeamClassificationValue,
          updatedAt: String(row.updated_at)
        } satisfies TeamClassificationTag
      ])
    );
    const teamNotes = Object.fromEntries(
      ((notesResult.data as Array<Record<string, unknown>> | null) ?? []).map((row) => [
        String(row.team_id),
        {
          teamId: String(row.team_id),
          note: String(row.note),
          updatedAt: String(row.updated_at)
        } satisfies TeamNoteTag
      ])
    );

    const rawAuctionAssets = buildAuctionAssets({
      baseProjections,
      bracketImport:
        (sessionResult.data.bracket_import as SessionBracketImport | null) ?? null
    });

    return normalizeSessionShape({
      id: String(sessionResult.data.id),
      name: String(sessionResult.data.name),
      createdAt: String(sessionResult.data.created_at),
      updatedAt: String(sessionResult.data.updated_at),
      archivedAt: sessionResult.data.archived_at ? String(sessionResult.data.archived_at) : null,
      archivedByName: sessionResult.data.archived_by_name
        ? String(sessionResult.data.archived_by_name)
        : null,
      archivedByEmail: sessionResult.data.archived_by_email
        ? String(sessionResult.data.archived_by_email)
        : null,
      focusSyndicateId: String(sessionResult.data.focus_syndicate_id),
      eventAccess: { sharedCodeConfigured: true },
      sharedAccessCodePlaintext: String(sessionResult.data.shared_code_plaintext ?? ""),
      sharedAccessCodeHash: String(sessionResult.data.shared_code_hash ?? ""),
      sharedAccessCodeLookup: String(sessionResult.data.shared_code_lookup ?? ""),
      sharedAccessCodeCiphertext: String(sessionResult.data.shared_code_ciphertext ?? ""),
      accessMembers: mapAccessMembers(
        (membersResult.data as Array<Record<string, unknown>> | null) ?? [],
        platformUsers
      ),
      payoutRules: sessionResult.data.payout_rules as PayoutRules,
      analysisSettings:
        (sessionResult.data.analysis_settings as AnalysisSettings | null) ?? defaultAnalysisSettings(),
      mothershipFunding:
        (sessionResult.data.mothership_funding as MothershipFundingModel | null) ?? undefined,
      syndicates: mapSessionSyndicates(syndicatesResult.data),
      baseProjections,
      projections: applyProjectionOverrides(baseProjections, overrides),
      projectionOverrides: overrides,
      teamClassifications,
      teamNotes,
      projectionProvider: String(sessionResult.data.projection_provider),
      activeDataSource: {
        key: String(sessionResult.data.active_data_source_key ?? builtinMockSource.key),
        name: String(sessionResult.data.active_data_source_name ?? builtinMockSource.name),
        kind: String(
          sessionResult.data.active_data_source_kind ?? builtinMockSource.kind
        ) as SessionDataSourceRef["kind"]
      },
      finalFourPairings: sessionResult.data.final_four_pairings as [string, string][],
      bracketImport:
        (sessionResult.data.bracket_import as SessionBracketImport | null) ?? null,
      analysisImport:
        (sessionResult.data.analysis_import as SessionAnalysisImport | null) ?? null,
      importReadiness: buildSessionImportReadiness({
        bracketImport: (sessionResult.data.bracket_import as SessionBracketImport | null) ?? null,
        analysisImport: (sessionResult.data.analysis_import as SessionAnalysisImport | null) ?? null,
        baseProjections,
        simulationSnapshot: (snapshotResult.data?.payload as AuctionSession["simulationSnapshot"]) ?? null
      }),
      liveState: sessionResult.data.live_state as AuctionSession["liveState"],
      bracketState: (sessionResult.data.bracket_state as BracketState | null) ?? createEmptyBracketState(),
      purchases: (((purchasesResult.data as Array<Record<string, unknown>> | null) ?? []).map(
        (row) => {
          const storedId = String(row.team_id);
          const matchingAsset = rawAuctionAssets.find((asset) => asset.id === storedId) ?? null;

          return {
            id: String(row.id),
            sessionId: String(row.session_id),
            teamId: storedId,
            assetId: matchingAsset?.id,
            assetLabel: matchingAsset?.label,
            projectionIds: matchingAsset?.projectionIds,
            buyerSyndicateId: String(row.buyer_syndicate_id),
            price: Number(row.price),
            createdAt: String(row.created_at)
          };
        }
      )) as AuctionSession["purchases"],
      simulationSnapshot:
        (snapshotResult.data?.payload as AuctionSession["simulationSnapshot"]) ?? null
    });
  }

  async getDashboard(sessionId: string) {
    const session = await this.requireSession(sessionId);
    return buildDashboard(session, this.backend);
  }

  async getAccessMember(sessionId: string, memberId: string) {
    const session = await this.requireSession(sessionId);
    return session.accessMembers.find((member) => member.id === memberId) ?? null;
  }

  async authenticateMember(email: string, sharedCode: string) {
    const client = requireSupabaseClient();
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedCode = sharedCode.trim();
    const plaintextResult = await client
      .from("auction_sessions")
      .select("id")
      .eq("shared_code_plaintext", normalizedCode)
      .maybeSingle();

    if (plaintextResult.error && !isMissingSharedCodePlaintextColumnError(plaintextResult.error)) {
      throwOnSupabaseError(plaintextResult.error);
    }

    if (!plaintextResult.error && plaintextResult.data) {
      const plaintextSession = await this.requireSession(String(plaintextResult.data.id));
      const plaintextMember =
        plaintextSession.accessMembers.find(
          (candidate) =>
            candidate.active && candidate.email.trim().toLowerCase() === normalizedEmail
        ) ?? null;

      if (plaintextMember) {
        return {
          sessionId: plaintextSession.id,
          member: plaintextMember
        };
      }
    }

    const lookup = createSharedCodeLookup(sharedCode);
    const legacyResult = await client
      .from("auction_sessions")
      .select("id, shared_code_hash")
      .eq("shared_code_lookup", lookup)
      .maybeSingle();

    throwOnSupabaseError(legacyResult.error);

    if (!legacyResult.data) {
      throw new Error("Email or shared code is invalid.");
    }

    if (!verifySharedCode(sharedCode, String(legacyResult.data.shared_code_hash))) {
      throw new Error("Email or shared code is invalid.");
    }

    const legacySession = await this.requireSession(String(legacyResult.data.id));
    const legacyMember =
      legacySession.accessMembers.find(
        (candidate) =>
          candidate.active && candidate.email.trim().toLowerCase() === normalizedEmail
      ) ?? null;

    if (!legacyMember) {
      throw new Error("Email or shared code is invalid.");
    }

    return {
      sessionId: legacySession.id,
      member: legacyMember
    };
  }

  async createPlatformUser(input: { name: string; email: string; active?: boolean }) {
    const parsed = createPlatformUserSchema.parse(input);
    const now = new Date().toISOString();
    const client = requireSupabaseClient();
    const result = await client.from("platform_users").insert({
      id: createId("user"),
      name: parsed.name.trim(),
      email: parsed.email.trim().toLowerCase(),
      active: parsed.active,
      created_at: now,
      updated_at: now
    }).select("*").single();
    throwOnSupabaseError(result.error);
    return mapPlatformUsers([result.data])[0];
  }

  async updatePlatformUser(
    userId: string,
    input: Partial<{ name: string; email: string; active: boolean }>
  ) {
    const parsed = updatePlatformUserSchema.parse(input);
    const client = requireSupabaseClient();
    const result = await client
      .from("platform_users")
      .update({
        ...(parsed.name ? { name: parsed.name.trim() } : {}),
        ...(parsed.email ? { email: parsed.email.trim().toLowerCase() } : {}),
        ...(parsed.active !== undefined ? { active: parsed.active } : {}),
        updated_at: new Date().toISOString()
      })
      .eq("id", userId)
      .select("*")
      .single();
    throwOnSupabaseError(result.error);

    const user = mapPlatformUsers([result.data])[0];
    const syncResult = await client
      .from("session_members")
      .update({
        name: user.name,
        email: user.email
      })
      .eq("platform_user_id", userId);
    throwOnSupabaseError(syncResult.error);
    return user;
  }

  async createSyndicateCatalogEntry(input: {
    name: string;
    active?: boolean;
  }) {
    const parsed = createSyndicateCatalogSchema.parse(input);
    const name = parsed.name.trim();
    const now = new Date().toISOString();
    const client = requireSupabaseClient();
    const result = await client
      .from("syndicate_catalog")
      .insert({
        id: createId("catalog"),
        name,
        color: getSyndicateBrandColor(name),
        active: parsed.active,
        created_at: now,
        updated_at: now
      })
      .select("*")
      .single();
    throwOnSupabaseError(result.error);
    return mapSyndicateCatalog([result.data])[0];
  }

  async updateSyndicateCatalogEntry(
    entryId: string,
    input: Partial<{ name: string; active: boolean }>
  ) {
    const parsed = updateSyndicateCatalogSchema.parse(input);
    const client = requireSupabaseClient();
    const currentResult = await client
      .from("syndicate_catalog")
      .select("*")
      .eq("id", entryId)
      .single();
    throwOnSupabaseError(currentResult.error);
    const currentEntry = mapSyndicateCatalog([currentResult.data])[0];
    const nextName = parsed.name ? parsed.name.trim() : currentEntry.name;
    const result = await client
      .from("syndicate_catalog")
      .update({
        name: nextName,
        color: getSyndicateBrandColor(nextName),
        ...(parsed.active !== undefined ? { active: parsed.active } : {}),
        updated_at: new Date().toISOString()
      })
      .eq("id", entryId)
      .select("*")
      .single();
    throwOnSupabaseError(result.error);

    const entry = mapSyndicateCatalog([result.data])[0];
    const syncResult = await client
      .from("syndicates")
      .update({
        name: entry.name,
        color: entry.color
      })
      .eq("catalog_entry_id", entryId);
    throwOnSupabaseError(syncResult.error);
    return entry;
  }

  async createDataSource(input: {
    name: string;
    kind?: "csv";
    purpose: DataSourcePurpose;
    active?: boolean;
    csvContent?: string;
    fileName?: string | null;
  }) {
    const parsed = createDataSourceSchema.parse(input);
    const now = new Date().toISOString();
    const client = requireSupabaseClient();
    const result = await client
      .from("data_sources")
      .insert({
        id: createId("source"),
        name: parsed.name.trim(),
        kind: "csv",
        purpose: parsed.purpose,
        active: parsed.active,
        config: {
          csvContent: parsed.csvContent,
          fileName: parsed.fileName ?? null
        },
        created_at: now,
        updated_at: now,
        last_tested_at: null
      })
      .select("*")
      .single();
    throwOnSupabaseError(result.error);
    return mapDataSources([result.data])[0];
  }

  async updateDataSource(
    sourceId: string,
    input: Partial<{
      name: string;
      active: boolean;
      csvContent: string;
      fileName: string | null;
    }>
  ) {
    const parsed = updateDataSourceSchema.parse(input);
    const client = requireSupabaseClient();
    const currentResult = await client.from("data_sources").select("*").eq("id", sourceId).single();
    throwOnSupabaseError(currentResult.error);
    const current = mapDataSources([currentResult.data])[0];
    const config =
      current.kind === "csv"
        ? {
            csvContent:
              parsed.csvContent ?? (current.config as { csvContent: string }).csvContent,
            fileName:
              parsed.fileName ?? (current.config as { fileName: string | null }).fileName ?? null
          }
        : current.config;

    const result = await client
      .from("data_sources")
      .update({
        ...(parsed.name ? { name: parsed.name.trim() } : {}),
        ...(parsed.active !== undefined ? { active: parsed.active } : {}),
        config,
        updated_at: new Date().toISOString()
      })
      .eq("id", sourceId)
      .select("*")
      .single();
    throwOnSupabaseError(result.error);

    const source = mapDataSources([result.data])[0];
    const syncResult = await client
      .from("auction_sessions")
      .update({
        active_data_source_name: source.name
      })
      .eq("active_data_source_key", `data-source:${source.id}`);
    throwOnSupabaseError(syncResult.error);
    return source;
  }

  async testDataSource(sourceId: string) {
    const client = requireSupabaseClient();
    const result = await client.from("data_sources").select("*").eq("id", sourceId).single();
    throwOnSupabaseError(result.error);
    const source = mapDataSources([result.data])[0];
    await testDataSourceConnection(source);
    const update = await client
      .from("data_sources")
      .update({
        last_tested_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq("id", sourceId);
    throwOnSupabaseError(update.error);
  }

  async updateSessionAccess(
    sessionId: string,
    assignments: Array<{ platformUserId: string; role: SessionRole; active?: boolean }>
  ) {
    const refs = await this.readReferenceData();
    const session = await this.requireSession(sessionId);
    session.accessMembers = buildAccessMembers(assignments, refs.platformUsers, session.accessMembers);
    session.updatedAt = new Date().toISOString();
    await this.persistSessionMembers(session);
    return this.getSessionAdminConfig(sessionId);
  }

  async rotateSessionSharedCode(sessionId: string, sharedAccessCode: string) {
    const session = await this.requireSession(sessionId);
    setStoredSharedAccessCode(session, sharedAccessCode);
    session.updatedAt = new Date().toISOString();
    await updateAuctionSessionRow(
      requireSupabaseClient(),
      {
        shared_code_plaintext: session.sharedAccessCodePlaintext,
        shared_code_hash: session.sharedAccessCodeHash,
        shared_code_lookup: session.sharedAccessCodeLookup,
        shared_code_ciphertext: session.sharedAccessCodeCiphertext,
        updated_at: session.updatedAt
      },
      sessionId
    );
    return this.getSessionAdminConfig(sessionId);
  }

  async updateSessionPayoutRules(sessionId: string, payoutRules: PayoutRules) {
    const session = await this.requireSession(sessionId);
    applyPayoutRulesMutation(session, payoutRules);
    await this.persistDerivedState(session);
    return this.getSessionAdminConfig(sessionId);
  }

  async updateSessionFunding(sessionId: string, mothershipFunding: MothershipFundingModel) {
    const session = await this.requireSession(sessionId);
    applyMothershipFundingMutation(session, mothershipFunding);
    await this.persistDerivedState(session);
    return this.getSessionAdminConfig(sessionId);
  }

  async updateSessionAnalysisSettings(sessionId: string, analysisSettings: AnalysisSettings) {
    const session = await this.requireSession(sessionId);
    session.analysisSettings = normalizeAnalysisSettings(analysisSettings);
    session.updatedAt = new Date().toISOString();
    await this.persistSessionMeta(session);
    return this.getSessionAdminConfig(sessionId);
  }

  async archiveSession(
    sessionId: string,
    actor: Pick<AuthenticatedMember, "name" | "email">
  ) {
    const session = await this.requireSession(sessionId);

    if (!session.archivedAt) {
      session.archivedAt = new Date().toISOString();
      session.archivedByName = actor.name;
      session.archivedByEmail = actor.email;
      session.updatedAt = session.archivedAt;
      await this.persistSessionMeta(session);
    }
  }

  async deleteSession(
    sessionId: string,
    _actor: Pick<AuthenticatedMember, "name" | "email">,
    confirmationName: string
  ) {
    const session = await this.requireSession(sessionId);

    if (!session.archivedAt) {
      throw new Error("Archive the session before deleting it permanently.");
    }

    if (confirmationName !== session.name) {
      throw new Error("Session name confirmation does not match.");
    }

    const client = requireSupabaseClient();
    const result = await client.from("auction_sessions").delete().eq("id", sessionId);
    throwOnSupabaseError(result.error);
  }

  async updateSessionSyndicates(
    sessionId: string,
    input: {
      catalogSyndicateIds: string[];
      syndicateFunding: SessionSyndicateFundingInput[];
    }
  ) {
    const refs = await this.readReferenceData();
    const session = await this.requireSession(sessionId);
    session.syndicates = rebuildSessionSyndicates(
      session,
      refs.syndicateCatalog,
      input.catalogSyndicateIds
    );
    session.syndicates = applySyndicateFundingUpdates(session, session.syndicates, input.syndicateFunding);
    session.focusSyndicateId = requireSessionFocusSyndicate(session).id;
    session.syndicates = recalculateSyndicateValues(session);
    session.updatedAt = new Date().toISOString();
    await this.persistSessionMeta(session);
    await this.persistSessionSyndicates(session);
    return this.getSessionAdminConfig(sessionId);
  }

  async importSessionBracket(
    sessionId: string,
    input: { selection: SessionSourceSelection }
  ) {
    const refs = await this.readReferenceData();
    const session = await this.requireSession(sessionId);
    if (session.purchases.length > 0) {
      throw new Error("Cannot replace projections after purchases have been recorded.");
    }
    const bracketImport = resolveSessionImportSelection(input.selection, "bracket", refs.dataSources);
    if (!bracketImport) {
      throw new Error("Bracket import payload is required.");
    }
    session.bracketImport = bracketImport;

    try {
      applySessionManagedImports(session);
      await this.persistProjectionImport(session);
      await this.insertImportRun(
        createImportRun(
          session.id,
          { key: "session:bracket", name: bracketImport.sourceName, kind: "csv" },
          "success",
          "Bracket import completed."
        )
      );
      return this.getSessionAdminConfig(sessionId);
    } catch (error) {
      await this.persistSessionMeta(session);
      await this.insertImportRun(
        createImportRun(
          session.id,
          { key: "session:bracket", name: bracketImport.sourceName, kind: "csv" },
          "failed",
          error instanceof Error ? error.message : "Unable to import bracket."
        )
      );
      throw error;
    }
  }

  async importSessionAnalysis(
    sessionId: string,
    input: { selection: SessionSourceSelection }
  ) {
    const refs = await this.readReferenceData();
    const session = await this.requireSession(sessionId);
    if (session.purchases.length > 0) {
      throw new Error("Cannot replace projections after purchases have been recorded.");
    }
    const analysisImport = resolveSessionImportSelection(
      input.selection,
      "analysis",
      refs.dataSources
    );
    if (!analysisImport) {
      throw new Error("Analysis import payload is required.");
    }
    session.analysisImport = analysisImport;

    try {
      applySessionManagedImports(session);
      await this.persistProjectionImport(session);
      await this.insertImportRun(
        createImportRun(
          session.id,
          { key: "session:analysis", name: analysisImport.sourceName, kind: "csv" },
          "success",
          "Analysis import completed."
        )
      );
      return this.getSessionAdminConfig(sessionId);
    } catch (error) {
      await this.persistSessionMeta(session);
      await this.insertImportRun(
        createImportRun(
          session.id,
          { key: "session:analysis", name: analysisImport.sourceName, kind: "csv" },
          "failed",
          error instanceof Error ? error.message : "Unable to import analysis."
        )
      );
      throw error;
    }
  }

  async setSessionDataSource(sessionId: string, sourceKey: string) {
    const refs = await this.readReferenceData();
    const session = await this.requireSession(sessionId);
    session.activeDataSource = resolveDataSourceRef(sourceKey, refs.dataSources);
    session.updatedAt = new Date().toISOString();
    await this.persistSessionMeta(session);
    return this.getSessionAdminConfig(sessionId);
  }

  async runSessionImport(sessionId: string, sourceKey?: string) {
    const refs = await this.readReferenceData();
    const session = await this.requireSession(sessionId);
    const resolvedSource = resolveDataSourceRef(sourceKey ?? session.activeDataSource.key, refs.dataSources);
    session.activeDataSource = resolvedSource;

    try {
      await applyProjectionImport(session, resolvedSource, refs.dataSources);
      await this.persistProjectionImport(session);
      await this.insertImportRun(
        createImportRun(session.id, resolvedSource, "success", "Import completed.")
      );
      return this.getSessionAdminConfig(sessionId);
    } catch (error) {
      await this.insertImportRun(
        createImportRun(
          session.id,
          resolvedSource,
          "failed",
          error instanceof Error ? error.message : "Unable to import projections."
        )
      );
      throw error;
    }
  }

  async importProjections(sessionId: string, provider: "mock" | "remote") {
    const session = await this.requireSession(sessionId);
    await applyProjectionImportLegacy(session, provider);
    await this.persistProjectionImport(session);
    return buildDashboard(session, this.backend);
  }

  async rebuildSimulation(sessionId: string, iterations?: number) {
    const session = await this.requireSession(sessionId);
    recalculateSessionState(session, iterations);
    await this.persistDerivedState(session);
    return buildDashboard(session, this.backend);
  }

  async updateLiveState(
    sessionId: string,
    patch: { nominatedAssetId?: string | null; nominatedTeamId?: string | null; currentBid?: number }
  ) {
    const session = await this.requireSession(sessionId);
    applyLiveStatePatch(session, patch);

    const client = requireSupabaseClient();
    const result = await client
      .from("auction_sessions")
      .update({
        live_state: session.liveState,
        updated_at: session.updatedAt
      })
      .eq("id", sessionId);

    throwOnSupabaseError(result.error);
    return buildDashboard(session, this.backend);
  }

  async recordPurchase(
    sessionId: string,
    input: { assetId?: string; teamId?: string; buyerSyndicateId: string; price: number }
  ) {
    const session = await this.requireSession(sessionId);
    const purchase = applyPurchaseMutation(session, input);
    const client = requireSupabaseClient();

    const result = await client.rpc("record_purchase_transaction", {
      p_session_id: sessionId,
      p_purchase_id: purchase.id,
      p_team_id: purchase.teamId,
      p_buyer_syndicate_id: purchase.buyerSyndicateId,
      p_price: purchase.price,
      p_created_at: purchase.createdAt,
      p_live_state: session.liveState,
      p_updated_at: session.updatedAt,
      p_syndicates: session.syndicates.map((syndicate) => ({
        id: syndicate.id,
        spend: syndicate.spend,
        remaining_bankroll: syndicate.remainingBankroll,
        owned_team_ids: syndicate.ownedTeamIds,
        portfolio_expected_value: syndicate.portfolioExpectedValue
      }))
    });

    throwOnSupabaseError(result.error);
    return buildDashboard(session, this.backend);
  }

  async undoPurchase(sessionId: string, purchaseId?: string) {
    const session = await this.requireSession(sessionId);
    const purchase = undoPurchaseMutation(session, purchaseId);
    const client = requireSupabaseClient();

    const result = await client.rpc("undo_purchase_transaction", {
      p_session_id: sessionId,
      p_purchase_id: purchase.id,
      p_live_state: session.liveState,
      p_updated_at: session.updatedAt,
      p_syndicates: session.syndicates.map((syndicate) => ({
        id: syndicate.id,
        spend: syndicate.spend,
        remaining_bankroll: syndicate.remainingBankroll,
        owned_team_ids: syndicate.ownedTeamIds,
        portfolio_expected_value: syndicate.portfolioExpectedValue
      }))
    });

    throwOnSupabaseError(result.error);
    return buildDashboard(session, this.backend);
  }

  async saveProjectionOverride(sessionId: string, teamId: string, input: ProjectionOverrideInput) {
    const session = await this.requireSession(sessionId);
    applyProjectionOverrideMutation(session, teamId, input);
    await this.persistProjectionState(session, teamId);
    return buildDashboard(session, this.backend);
  }

  async clearProjectionOverride(sessionId: string, teamId: string) {
    const session = await this.requireSession(sessionId);
    clearProjectionOverrideMutation(session, teamId);
    await this.persistProjectionState(session, teamId, true);
    return buildDashboard(session, this.backend);
  }

  async saveTeamClassification(
    sessionId: string,
    teamId: string,
    input: TeamClassificationInput
  ) {
    const session = await this.requireSession(sessionId);
    applyTeamClassificationMutation(session, teamId, input);
    await this.persistTeamClassificationState(session, teamId);
    return buildDashboard(session, this.backend);
  }

  async clearTeamClassification(sessionId: string, teamId: string) {
    const session = await this.requireSession(sessionId);
    clearTeamClassificationMutation(session, teamId);
    await this.persistTeamClassificationState(session, teamId, true);
    return buildDashboard(session, this.backend);
  }

  async saveTeamNote(sessionId: string, teamId: string, input: TeamNoteInput) {
    const session = await this.requireSession(sessionId);
    applyTeamNoteMutation(session, teamId, input);
    await this.persistTeamNoteState(session, teamId);
    return buildDashboard(session, this.backend);
  }

  async clearTeamNote(sessionId: string, teamId: string) {
    const session = await this.requireSession(sessionId);
    clearTeamNoteMutation(session, teamId);
    await this.persistTeamNoteState(session, teamId, true);
    return buildDashboard(session, this.backend);
  }

  async updateBracketGame(sessionId: string, gameId: string, winnerTeamId: string | null) {
    const session = await this.requireSession(sessionId);
    const parsed = updateBracketGameSchema.parse({ winnerTeamId });
    applyBracketWinnerMutation(session, gameId, parsed.winnerTeamId);
    await this.persistBracketState(session);
    return buildDashboard(session, this.backend);
  }

  async getCsvAnalysisPortfolio(sessionId: string, memberId: string) {
    await this.requireSession(sessionId);
    const client = requireSupabaseClient();
    const result = await client
      .from("csv_analysis_portfolios")
      .select("*")
      .eq("session_id", sessionId)
      .eq("member_id", memberId)
      .maybeSingle();

    throwOnSupabaseError(result.error);

    if (!result.data) {
      return {
        sessionId,
        memberId,
        entries: [],
        updatedAt: new Date(0).toISOString()
      } satisfies CsvAnalysisPortfolio;
    }

    const row = result.data as Record<string, unknown>;
    return {
      sessionId: String(row.session_id),
      memberId: String(row.member_id),
      entries: sanitizeCsvPortfolioEntries(
        (row.entries as Array<{ teamId: string; paidPrice: number }> | null) ?? []
      ),
      updatedAt: String(row.updated_at)
    } satisfies CsvAnalysisPortfolio;
  }

  async saveCsvAnalysisPortfolio(
    sessionId: string,
    memberId: string,
    entries: Array<{ teamId: string; paidPrice: number }>
  ) {
    await this.requireSession(sessionId);
    const client = requireSupabaseClient();
    const normalizedEntries = sanitizeCsvPortfolioEntries(entries);
    const updatedAt = new Date().toISOString();

    const result = await client.from("csv_analysis_portfolios").upsert({
      session_id: sessionId,
      member_id: memberId,
      entries: normalizedEntries,
      updated_at: updatedAt
    });
    throwOnSupabaseError(result.error);

    return {
      sessionId,
      memberId,
      entries: normalizedEntries,
      updatedAt
    } satisfies CsvAnalysisPortfolio;
  }

  private async requireSession(sessionId: string) {
    const session = await this.getSession(sessionId);
    if (!session) {
      throw new Error("Auction session not found.");
    }
    return session;
  }

  private async readReferenceData() {
    const client = requireSupabaseClient();
    const [usersResult, catalogResult, sourcesResult] = await Promise.all([
      client.from("platform_users").select("*"),
      client.from("syndicate_catalog").select("*"),
      client.from("data_sources").select("*")
    ]);
    throwOnSupabaseError(usersResult.error);
    throwOnSupabaseError(catalogResult.error);
    throwOnSupabaseError(sourcesResult.error);
    return {
      platformUsers: mapPlatformUsers(usersResult.data),
      syndicateCatalog: mapSyndicateCatalog(catalogResult.data),
      dataSources: mapDataSources(sourcesResult.data)
    };
  }

  private async listImportRuns(sessionId: string) {
    const client = requireSupabaseClient();
    const result = await client
      .from("data_import_runs")
      .select("*")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: false });
    throwOnSupabaseError(result.error);
    return (((result.data as Array<Record<string, unknown>> | null) ?? []).map((row) => ({
      id: String(row.id),
      sessionId: String(row.session_id),
      sourceKey: String(row.source_key),
      sourceName: String(row.source_name),
      status: String(row.status) as DataImportRun["status"],
      message: String(row.message),
      createdAt: String(row.created_at)
    })) as DataImportRun[]);
  }

  private async insertImportRun(run: DataImportRun) {
    const client = requireSupabaseClient();
    const result = await client.from("data_import_runs").insert({
      id: run.id,
      session_id: run.sessionId,
      source_key: run.sourceKey,
      source_name: run.sourceName,
      status: run.status,
      message: run.message,
      created_at: run.createdAt
    });
    throwOnSupabaseError(result.error);
  }

  private async persistFullSession(session: StoredAuctionSession) {
    await this.persistSessionMeta(session);
    await this.persistSessionMembers(session);
    await this.persistSessionSyndicates(session);
    await this.persistProjectionImport(session);
    await replaceRows(
      requireSupabaseClient(),
      "purchase_records",
      "session_id",
      session.id,
      session.purchases.map((purchase) => ({
        id: purchase.id,
        session_id: session.id,
        team_id: purchase.teamId,
        buyer_syndicate_id: purchase.buyerSyndicateId,
        price: purchase.price,
        created_at: purchase.createdAt
      }))
    );
  }

  private async persistSessionMeta(session: StoredAuctionSession) {
    await upsertAuctionSessionRow(requireSupabaseClient(), {
      id: session.id,
      name: session.name,
      focus_syndicate_id: session.focusSyndicateId,
      operator_passcode: "legacy-admin",
      viewer_passcode: "legacy-viewer",
      shared_code_plaintext: session.sharedAccessCodePlaintext,
      shared_code_hash: session.sharedAccessCodeHash,
      shared_code_lookup: session.sharedAccessCodeLookup,
      shared_code_ciphertext: session.sharedAccessCodeCiphertext,
      archived_at: session.archivedAt,
      archived_by_name: session.archivedByName,
      archived_by_email: session.archivedByEmail,
      payout_rules: session.payoutRules,
      analysis_settings: session.analysisSettings,
      mothership_funding: session.mothershipFunding,
      projection_provider: session.projectionProvider,
      active_data_source_key: session.activeDataSource.key,
      active_data_source_name: session.activeDataSource.name,
      active_data_source_kind: session.activeDataSource.kind,
      final_four_pairings: session.finalFourPairings,
      bracket_import: session.bracketImport,
      analysis_import: session.analysisImport,
      live_state: session.liveState,
      bracket_state: session.bracketState,
      created_at: session.createdAt,
      updated_at: session.updatedAt
    });
  }

  private async persistSessionMembers(session: StoredAuctionSession) {
    await replaceRows(
      requireSupabaseClient(),
      "session_members",
      "session_id",
      session.id,
      session.accessMembers.map((member) => ({
        id: member.id,
        session_id: session.id,
        platform_user_id: member.platformUserId ?? null,
        name: member.name,
        email: member.email,
        role: member.role,
        active: member.active,
        created_at: member.createdAt
      }))
    );
    await this.persistSessionMeta(session);
  }

  private async persistSessionSyndicates(session: StoredAuctionSession) {
    await replaceRows(
      requireSupabaseClient(),
      "syndicates",
      "session_id",
      session.id,
      session.syndicates.map((syndicate) => ({
        id: syndicate.id,
        session_id: session.id,
        catalog_entry_id: syndicate.catalogEntryId ?? null,
        session_only: Boolean(syndicate.sessionOnly),
        name: syndicate.name,
        color: syndicate.color,
        spend: syndicate.spend,
        remaining_bankroll: syndicate.remainingBankroll,
        estimated_budget: syndicate.estimatedBudget,
        budget_confidence: syndicate.budgetConfidence,
        budget_notes: syndicate.budgetNotes,
        owned_team_ids: syndicate.ownedTeamIds,
        portfolio_expected_value: syndicate.portfolioExpectedValue
      }))
    );
    await this.persistSessionMeta(session);
  }

  private async persistProjectionImport(session: StoredAuctionSession) {
    const client = requireSupabaseClient();
    await this.persistSessionMeta(session);
    await replaceRows(
      client,
      "team_projections",
      "session_id",
      session.id,
      session.baseProjections.map((team) => serializeTeamProjectionRow(session.id, team))
    );
    await replaceRows(
      client,
      "projection_overrides",
      "session_id",
      session.id,
      Object.values(session.projectionOverrides).map((override) => ({
        session_id: session.id,
        team_id: override.teamId,
        rating: override.rating ?? null,
        offense: override.offense ?? null,
        defense: override.defense ?? null,
        tempo: override.tempo ?? null,
        updated_at: override.updatedAt
      }))
    );
    await replaceRows(
      client,
      "team_classifications",
      "session_id",
      session.id,
      Object.values(session.teamClassifications).map((classification) => ({
        session_id: session.id,
        team_id: classification.teamId,
        classification: classification.classification,
        updated_at: classification.updatedAt
      }))
    );
    await replaceRows(
      client,
      "team_notes",
      "session_id",
      session.id,
      Object.values(session.teamNotes).map((note) => ({
        session_id: session.id,
        team_id: note.teamId,
        note: note.note,
        updated_at: note.updatedAt
      }))
    );
    await client.from("simulation_snapshots").delete().eq("session_id", session.id);
    if (session.simulationSnapshot) {
      const snapshotResult = await client.from("simulation_snapshots").insert({
        id: session.simulationSnapshot.id,
        session_id: session.id,
        provider: session.simulationSnapshot.provider,
        iterations: session.simulationSnapshot.iterations,
        generated_at: session.simulationSnapshot.generatedAt,
        payload: session.simulationSnapshot
      });
      throwOnSupabaseError(snapshotResult.error);
    }
  }

  private async persistDerivedState(session: StoredAuctionSession) {
    await this.persistSessionMeta(session);
    await this.persistSessionSyndicates(session);
    const client = requireSupabaseClient();
    await client.from("simulation_snapshots").delete().eq("session_id", session.id);
    if (session.simulationSnapshot) {
      const snapshotResult = await client.from("simulation_snapshots").insert({
        id: session.simulationSnapshot.id,
        session_id: session.id,
        provider: session.simulationSnapshot.provider,
        iterations: session.simulationSnapshot.iterations,
        generated_at: session.simulationSnapshot.generatedAt,
        payload: session.simulationSnapshot
      });
      throwOnSupabaseError(snapshotResult.error);
    }
  }

  private async persistProjectionState(
    session: StoredAuctionSession,
    teamId: string,
    cleared = false
  ) {
    const client = requireSupabaseClient();
    const sessionUpdate = await client
      .from("auction_sessions")
      .update({
        updated_at: session.updatedAt
      })
      .eq("id", session.id);
    throwOnSupabaseError(sessionUpdate.error);

    if (cleared) {
      const deleteOverride = await client
        .from("projection_overrides")
        .delete()
        .eq("session_id", session.id)
        .eq("team_id", teamId);
      throwOnSupabaseError(deleteOverride.error);
    } else {
      const override = session.projectionOverrides[teamId];
      const overrideResult = await client.from("projection_overrides").upsert({
        session_id: session.id,
        team_id: override.teamId,
        rating: override.rating ?? null,
        offense: override.offense ?? null,
        defense: override.defense ?? null,
        tempo: override.tempo ?? null,
        updated_at: override.updatedAt
      });
      throwOnSupabaseError(overrideResult.error);
    }

    await this.persistDerivedState(session);
  }

  private async persistTeamClassificationState(
    session: StoredAuctionSession,
    teamId: string,
    cleared = false
  ) {
    const client = requireSupabaseClient();
    await updateAuctionSessionRow(
      client,
      {
        updated_at: session.updatedAt
      },
      session.id
    );

    if (cleared) {
      const deleteClassification = await client
        .from("team_classifications")
        .delete()
        .eq("session_id", session.id)
        .eq("team_id", teamId);
      throwOnSupabaseError(deleteClassification.error);
      return;
    }

    const classification = session.teamClassifications[teamId];
    const classificationResult = await client.from("team_classifications").upsert({
      session_id: session.id,
      team_id: classification.teamId,
      classification: classification.classification,
      updated_at: classification.updatedAt
    });
    throwOnSupabaseError(classificationResult.error);
  }

  private async persistTeamNoteState(
    session: StoredAuctionSession,
    teamId: string,
    cleared = false
  ) {
    const client = requireSupabaseClient();
    await updateAuctionSessionRow(
      client,
      {
        updated_at: session.updatedAt
      },
      session.id
    );

    if (cleared) {
      const deleteNote = await client
        .from("team_notes")
        .delete()
        .eq("session_id", session.id)
        .eq("team_id", teamId);
      throwOnSupabaseError(deleteNote.error);
      return;
    }

    const note = session.teamNotes[teamId];
    const noteResult = await client.from("team_notes").upsert({
      session_id: session.id,
      team_id: note.teamId,
      note: note.note,
      updated_at: note.updatedAt
    });
    throwOnSupabaseError(noteResult.error);
  }

  private async persistBracketState(session: StoredAuctionSession) {
    await updateAuctionSessionRow(
      requireSupabaseClient(),
      {
        bracket_state: session.bracketState,
        updated_at: session.updatedAt
      },
      session.id
    );
  }
}

async function createSessionModel(input: CreateSessionInput, refs: ReferenceData) {
  const parsed = createSessionSchema.parse(input);
  const accessMembers = buildAccessMembers(parsed.accessAssignments, refs.platformUsers);
  const bracketImport = resolveSessionImportSelection(
    parsed.bracketSelection,
    "bracket",
    refs.dataSources
  );
  const analysisImport = resolveSessionImportSelection(
    parsed.analysisSelection,
    "analysis",
    refs.dataSources
  );
  const timestamp = new Date().toISOString();
  const sessionId = createId("session");
  const legacyBudgetSeed = deriveLegacyBudgetSeed(
    parsed.payoutRules.projectedPot,
    parsed.catalogSyndicateIds.length
  );
  const syndicates = buildInitialSessionSyndicates(
    refs.syndicateCatalog,
    parsed.catalogSyndicateIds,
    parsed.payoutRules.projectedPot
  );
  const focusSyndicate = requireMothershipSyndicate(syndicates);

  const session: StoredAuctionSession = normalizeSessionShape({
    id: sessionId,
    name: parsed.name,
    createdAt: timestamp,
    updatedAt: timestamp,
    archivedAt: null,
    archivedByName: null,
    archivedByEmail: null,
    focusSyndicateId: focusSyndicate.id,
    eventAccess: {
      sharedCodeConfigured: true
    },
    sharedAccessCodePlaintext: "",
    sharedAccessCodeHash: "",
    sharedAccessCodeLookup: "",
    sharedAccessCodeCiphertext: "",
    accessMembers,
    payoutRules: parsed.payoutRules,
    analysisSettings: normalizeAnalysisSettings(parsed.analysisSettings),
    mothershipFunding: buildDefaultMothershipFunding(legacyBudgetSeed),
    syndicates,
    baseProjections: [],
    projections: [],
    projectionOverrides: {},
    teamClassifications: {},
    teamNotes: {},
    projectionProvider: "Session-managed imports",
    activeDataSource: builtinMockSource,
    finalFourPairings: getDefaultFinalFourPairings(),
    bracketImport,
    analysisImport,
    importReadiness: buildSessionImportReadiness({
      bracketImport,
      analysisImport,
      baseProjections: [],
      simulationSnapshot: null
    }),
    liveState: {
      nominatedTeamId: null,
      currentBid: 0,
      soldTeamIds: [],
      lastUpdatedAt: timestamp
    },
    bracketState: createEmptyBracketState(),
    purchases: [],
    simulationSnapshot: null
  });

  setStoredSharedAccessCode(session, parsed.sharedAccessCode);
  if (session.bracketImport || session.analysisImport) {
    applySessionManagedImports(session, parsed.simulationIterations);
  }
  return session;
}

async function applyProjectionImport(
  session: StoredAuctionSession,
  dataSource: SessionDataSourceRef,
  dataSources: DataSource[]
) {
  if (session.purchases.length > 0) {
    throw new Error("Cannot replace projections after purchases have been recorded.");
  }

  const projectionFeed = await loadProjectionsFromSource(dataSource, dataSources);
  session.bracketImport = null;
  session.analysisImport = null;
  session.baseProjections = sortProjections(projectionFeed.teams);
  session.projectionProvider = projectionFeed.provider;
  session.activeDataSource = dataSource;
  session.projectionOverrides = filterOverridesForProjectionSet(
    session.projectionOverrides,
    session.baseProjections
  );
  session.teamClassifications = filterTeamClassificationsForProjectionSet(
    session.teamClassifications,
    session.baseProjections
  );
  session.teamNotes = filterTeamNotesForProjectionSet(session.teamNotes, session.baseProjections);
  session.projections = applyProjectionOverrides(
    session.baseProjections,
    session.projectionOverrides
  );
  session.liveState = {
    ...session.liveState,
    nominatedTeamId: session.projections[0]?.id ?? null,
    currentBid: 0,
    soldTeamIds: [],
    lastUpdatedAt: new Date().toISOString()
  };
  session.bracketState = createEmptyBracketState();
  recalculateSessionState(session, session.simulationSnapshot?.iterations);
}

function applySessionManagedImports(
  session: StoredAuctionSession,
  requestedIterations?: number
) {
  if (session.purchases.length > 0) {
    throw new Error("Cannot replace projections after purchases have been recorded.");
  }

  const simulationIterations = requestedIterations ?? session.simulationSnapshot?.iterations;
  session.updatedAt = new Date().toISOString();
  session.activeDataSource = {
    key: "session:managed-imports",
    name: "Session-managed imports",
    kind: "csv"
  };
  session.projectionProvider = "Session-managed imports";
  session.baseProjections = [];
  session.projections = [];
  session.simulationSnapshot = null;
  session.liveState = {
    ...session.liveState,
    nominatedTeamId: null,
    currentBid: 0,
    soldTeamIds: [],
    lastUpdatedAt: session.updatedAt
  };

  if (!session.bracketImport || !session.analysisImport) {
    session.importReadiness = buildSessionImportReadiness({
      bracketImport: session.bracketImport,
      analysisImport: session.analysisImport,
      baseProjections: [],
      simulationSnapshot: null
    });
    return;
  }

  const merge = mergeBracketAndAnalysisImports(session.bracketImport, session.analysisImport);
  session.importReadiness = buildSessionImportReadiness({
    bracketImport: session.bracketImport,
    analysisImport: session.analysisImport,
    baseProjections: merge.projections,
    simulationSnapshot: null
  });

  if (merge.issues.length > 0) {
    return;
  }

  session.baseProjections = sortProjections(merge.projections);
  session.projectionProvider = `${session.bracketImport.sourceName} + ${session.analysisImport.sourceName}`;
  session.activeDataSource = {
    key: "session:managed-imports",
    name: "Session-managed imports",
    kind: "csv"
  };
  session.projectionOverrides = filterOverridesForProjectionSet(
    session.projectionOverrides,
    session.baseProjections
  );
  session.teamClassifications = filterTeamClassificationsForProjectionSet(
    session.teamClassifications,
    session.baseProjections
  );
  session.teamNotes = filterTeamNotesForProjectionSet(session.teamNotes, session.baseProjections);
  session.projections = applyProjectionOverrides(session.baseProjections, session.projectionOverrides);
  session.liveState = {
    ...session.liveState,
    nominatedTeamId: session.projections[0]?.id ?? null,
    currentBid: 0,
    soldTeamIds: [],
    lastUpdatedAt: session.updatedAt
  };
  recalculateSessionState(session, simulationIterations);
  session.importReadiness = buildSessionImportReadiness({
    bracketImport: session.bracketImport,
    analysisImport: session.analysisImport,
    baseProjections: session.baseProjections,
    simulationSnapshot: session.simulationSnapshot
  });
}

async function applyProjectionImportLegacy(session: StoredAuctionSession, provider: "mock" | "remote") {
  if (session.purchases.length > 0) {
    throw new Error("Cannot replace projections after purchases have been recorded.");
  }

  const projectionFeed = await loadProjectionProvider(provider);
  session.bracketImport = null;
  session.analysisImport = null;
  session.baseProjections = sortProjections(projectionFeed.teams);
  session.projectionProvider = projectionFeed.provider;
  session.activeDataSource = provider === "mock" ? builtinMockSource : session.activeDataSource;
  session.projectionOverrides = filterOverridesForProjectionSet(
    session.projectionOverrides,
    session.baseProjections
  );
  session.teamClassifications = filterTeamClassificationsForProjectionSet(
    session.teamClassifications,
    session.baseProjections
  );
  session.teamNotes = filterTeamNotesForProjectionSet(session.teamNotes, session.baseProjections);
  session.projections = applyProjectionOverrides(
    session.baseProjections,
    session.projectionOverrides
  );
  session.liveState = {
    ...session.liveState,
    nominatedTeamId: session.projections[0]?.id ?? null,
    currentBid: 0,
    soldTeamIds: [],
    lastUpdatedAt: new Date().toISOString()
  };
  session.bracketState = createEmptyBracketState();
  recalculateSessionState(session, session.simulationSnapshot?.iterations);
}

function recalculateSessionState(session: StoredAuctionSession, iterations?: number) {
  session.projections = applyProjectionOverrides(
    session.baseProjections,
    session.projectionOverrides
  );
  session.auctionAssets = buildAuctionAssets({
    baseProjections: session.baseProjections,
    bracketImport: session.bracketImport
  });
  session.liveState = normalizeLiveState(
    session.liveState,
    session.auctionAssets,
    session.projections,
    session.purchases
  );
  if (session.projections.length === 0) {
    session.simulationSnapshot = null;
    session.syndicates = recalculateSyndicateValues(session);
    session.updatedAt = new Date().toISOString();
    session.importReadiness = buildSessionImportReadiness({
      bracketImport: session.bracketImport,
      analysisImport: session.analysisImport,
      baseProjections: session.baseProjections,
      simulationSnapshot: null
    });
    return;
  }
  session.simulationSnapshot = simulateAuctionField({
    sessionId: session.id,
    projections: session.projections,
    payoutRules: session.payoutRules,
    finalFourPairings: session.finalFourPairings,
    iterations: iterations ?? session.simulationSnapshot?.iterations ?? 4000,
    provider: session.projectionProvider
  });
  session.syndicates = recalculateSyndicateValues(session);
  session.updatedAt = new Date().toISOString();
  session.importReadiness = buildSessionImportReadiness({
    bracketImport: session.bracketImport,
    analysisImport: session.analysisImport,
    baseProjections: session.baseProjections,
    simulationSnapshot: session.simulationSnapshot
  });
}

function applyLiveStatePatch(
  session: StoredAuctionSession,
  patch: { nominatedAssetId?: string | null; nominatedTeamId?: string | null; currentBid?: number }
) {
  const auctionAssets = session.auctionAssets ?? [];
  const nextState = {
    ...session.liveState,
    ...patch,
    lastUpdatedAt: new Date().toISOString()
  };

  if (patch.nominatedAssetId !== undefined) {
    if (patch.nominatedAssetId === null) {
      nextState.nominatedAssetId = null;
      nextState.nominatedTeamId = null;
    } else {
      const asset = auctionAssets.find((candidate) => candidate.id === patch.nominatedAssetId) ?? null;
      if (!asset) {
        throw new Error("Selected team does not exist in the tournament field.");
      }
      if ((nextState.soldAssetIds ?? []).includes(asset.id)) {
        throw new Error("That team has already been sold.");
      }

      nextState.nominatedAssetId = asset.id;
      nextState.nominatedTeamId = resolveRepresentativeProjectionId(asset, session.projections);
    }
  } else if (patch.nominatedTeamId) {
    const asset = auctionAssets.find((candidate) => candidate.id === patch.nominatedTeamId) ?? null;
    if (asset) {
      if ((nextState.soldAssetIds ?? []).includes(asset.id)) {
        throw new Error("That team has already been sold.");
      }

      nextState.nominatedAssetId = asset.id;
      nextState.nominatedTeamId = resolveRepresentativeProjectionId(asset, session.projections);
    }
  }

  if (
    nextState.nominatedTeamId &&
    !session.projections.some((projection) => projection.id === nextState.nominatedTeamId)
  ) {
    throw new Error("Selected team does not exist in the tournament field.");
  }

  if (
    nextState.nominatedTeamId &&
    session.liveState.soldTeamIds.includes(nextState.nominatedTeamId)
  ) {
    throw new Error("That team has already been sold.");
  }

  if (
    (patch.nominatedAssetId !== undefined || patch.nominatedTeamId !== undefined) &&
    nextState.nominatedAssetId !== session.liveState.nominatedAssetId &&
    patch.currentBid === undefined
  ) {
    nextState.currentBid = 0;
  }

  session.liveState = nextState;
  session.updatedAt = nextState.lastUpdatedAt;
}

function applyPurchaseMutation(
  session: StoredAuctionSession,
  input: { assetId?: string; teamId?: string; buyerSyndicateId: string; price: number }
) {
  if (input.price <= 0) {
    throw new Error("Enter a bid greater than $0 before recording a purchase.");
  }

  const auctionAssets = session.auctionAssets ?? [];
  const assetId =
    input.assetId ??
    input.teamId ??
    session.liveState.nominatedAssetId ??
    session.liveState.nominatedTeamId;
  if (!assetId) {
    throw new Error("No team is currently nominated.");
  }

  const asset = auctionAssets.find((candidate) => candidate.id === assetId) ?? null;
  if (!asset) {
    throw new Error("The nominated team is missing from the tournament field.");
  }

  if (session.purchases.some((purchase) => (purchase.assetId ?? purchase.teamId) === asset.id)) {
    throw new Error("That team has already been sold.");
  }

  const syndicate = session.syndicates.find(
    (candidate) => candidate.id === input.buyerSyndicateId
  );
  if (!syndicate) {
    throw new Error("Unknown buyer syndicate.");
  }

  const createdAt = new Date().toISOString();
  const representativeProjectionId =
    asset.projectionIds.find((projectionId) =>
      session.projections.some((projection) => projection.id === projectionId)
    ) ?? asset.projectionIds[0] ?? asset.id;
  const purchase = {
    id: createId("purchase"),
    sessionId: session.id,
    teamId: representativeProjectionId,
    assetId: asset.id,
    assetLabel: asset.label,
    projectionIds: asset.projectionIds,
    buyerSyndicateId: syndicate.id,
    price: roundCurrency(input.price),
    createdAt
  };

  session.purchases.push(purchase);
  session.liveState = {
    ...session.liveState,
    currentBid: 0,
    nominatedAssetId: null,
    nominatedTeamId: null,
    soldAssetIds: [...(session.liveState.soldAssetIds ?? []), asset.id],
    soldTeamIds: [...new Set([...session.liveState.soldTeamIds, ...asset.projectionIds])],
    lastUpdatedAt: createdAt
  };
  session.syndicates = recalculateSyndicateValues(session);
  session.updatedAt = createdAt;
  return purchase;
}

function undoPurchaseMutation(session: StoredAuctionSession, purchaseId?: string) {
  const purchase = session.purchases[session.purchases.length - 1];
  if (!purchase) {
    throw new Error("No purchase is available to undo.");
  }

  if (purchaseId && purchase.id !== purchaseId) {
    throw new Error("Only the most recent purchase can be undone.");
  }

  const updatedAt = new Date().toISOString();
  const restoredProjectionIds =
    purchase.projectionIds && purchase.projectionIds.length > 0
      ? purchase.projectionIds
      : [purchase.teamId];
  const restoredTeamId =
    restoredProjectionIds.find((teamId) =>
      session.projections.some((projection) => projection.id === teamId)
    ) ?? null;
  const restoredAssetId = purchase.assetId ?? purchase.teamId;
  session.purchases = session.purchases.filter((candidate) => candidate.id !== purchase.id);
  session.liveState = {
    ...session.liveState,
    nominatedAssetId: restoredAssetId,
    nominatedTeamId: restoredTeamId,
    currentBid: purchase.price,
    soldAssetIds: (session.liveState.soldAssetIds ?? []).filter(
      (assetId) => assetId !== restoredAssetId
    ),
    soldTeamIds: session.liveState.soldTeamIds.filter(
      (teamId) => !restoredProjectionIds.includes(teamId)
    ),
    lastUpdatedAt: updatedAt
  };
  session.syndicates = recalculateSyndicateValues(session);
  session.updatedAt = updatedAt;
  return purchase;
}

function applyPayoutRulesMutation(session: StoredAuctionSession, payoutRules: PayoutRules) {
  session.payoutRules = normalizePayoutRules(payoutRules);
  recalculateSessionState(session, session.simulationSnapshot?.iterations);
}

function applyMothershipFundingMutation(
  session: StoredAuctionSession,
  mothershipFunding: MothershipFundingModel
) {
  const legacyBudgetSeed = deriveLegacyBudgetSeed(
    session.payoutRules.projectedPot,
    session.syndicates.length
  );
  session.mothershipFunding = normalizeMothershipFunding(mothershipFunding, legacyBudgetSeed);
  recalculateSessionState(session, session.simulationSnapshot?.iterations);
}

function applyProjectionOverrideMutation(
  session: StoredAuctionSession,
  teamId: string,
  input: ProjectionOverrideInput
) {
  const team = session.baseProjections.find((projection) => projection.id === teamId);
  if (!team) {
    throw new Error("Projection override team not found.");
  }

  const hasAnyValue = Object.values(input).some((value) => value !== undefined);
  if (!hasAnyValue) {
    throw new Error("At least one override value is required.");
  }

  session.projectionOverrides[teamId] = {
    teamId,
    rating: input.rating,
    offense: input.offense,
    defense: input.defense,
    tempo: input.tempo,
    updatedAt: new Date().toISOString()
  };
  recalculateSessionState(session, session.simulationSnapshot?.iterations);
}

function clearProjectionOverrideMutation(session: StoredAuctionSession, teamId: string) {
  if (!session.baseProjections.some((projection) => projection.id === teamId)) {
    throw new Error("Projection override team not found.");
  }

  delete session.projectionOverrides[teamId];
  recalculateSessionState(session, session.simulationSnapshot?.iterations);
}

function applyTeamClassificationMutation(
  session: StoredAuctionSession,
  teamId: string,
  input: TeamClassificationInput
) {
  if (!session.baseProjections.some((projection) => projection.id === teamId)) {
    throw new Error("Team classification team not found.");
  }

  const updatedAt = new Date().toISOString();
  session.teamClassifications[teamId] = {
    teamId,
    classification: input.classification,
    updatedAt
  };
  session.updatedAt = updatedAt;
}

function clearTeamClassificationMutation(session: StoredAuctionSession, teamId: string) {
  if (!session.baseProjections.some((projection) => projection.id === teamId)) {
    throw new Error("Team classification team not found.");
  }

  delete session.teamClassifications[teamId];
  session.updatedAt = new Date().toISOString();
}

function applyTeamNoteMutation(
  session: StoredAuctionSession,
  teamId: string,
  input: TeamNoteInput
) {
  if (!session.baseProjections.some((projection) => projection.id === teamId)) {
    throw new Error("Team note team not found.");
  }

  const parsed = saveTeamNoteSchema.parse(input);
  const updatedAt = new Date().toISOString();
  session.teamNotes[teamId] = {
    teamId,
    note: parsed.note,
    updatedAt
  };
  session.updatedAt = updatedAt;
}

function clearTeamNoteMutation(session: StoredAuctionSession, teamId: string) {
  if (!session.baseProjections.some((projection) => projection.id === teamId)) {
    throw new Error("Team note team not found.");
  }

  delete session.teamNotes[teamId];
  session.updatedAt = new Date().toISOString();
}

function recalculateSyndicateValues(session: StoredAuctionSession): Syndicate[] {
  const mothership = requireSessionFocusSyndicate(session);
  return session.syndicates.map((syndicate) => {
    const ownedPurchases = session.purchases.filter(
      (purchase) => purchase.buyerSyndicateId === syndicate.id
    );
    const spend = ownedPurchases.reduce((total, purchase) => total + purchase.price, 0);
    const ownedTeamIds = [...new Set(
      ownedPurchases.flatMap((purchase) => purchase.projectionIds ?? [purchase.teamId])
    )];
    const portfolioExpectedValue = ownedTeamIds.reduce(
      (total, teamId) =>
        total + (session.simulationSnapshot?.teamResults[teamId]?.expectedGrossPayout ?? 0),
      0
    );
    const isMothership = syndicate.id === mothership.id;
    const normalizedEstimate = normalizeSyndicateEstimate(
      syndicate,
      deriveLegacyBudgetSeed(session.payoutRules.projectedPot, session.syndicates.length)
    );
    const estimatedBudget = isMothership
      ? roundCurrency(session.mothershipFunding.budgetBase)
      : normalizedEstimate.estimatedBudget;
    const estimateState = deriveSyndicateEstimateState(estimatedBudget, spend);

    return {
      ...syndicate,
      spend: roundCurrency(spend),
      remainingBankroll: estimateState.estimatedRemainingBudget,
      estimatedBudget,
      budgetConfidence: isMothership ? "high" : normalizedEstimate.budgetConfidence,
      budgetNotes: normalizedEstimate.budgetNotes,
      estimatedRemainingBudget: estimateState.estimatedRemainingBudget,
      estimateExceeded: isMothership ? false : estimateState.estimateExceeded,
      ownedTeamIds,
      portfolioExpectedValue: roundCurrency(portfolioExpectedValue)
    };
  });
}

function buildInitialSessionSyndicates(
  catalog: SyndicateCatalogEntry[],
  catalogIds: string[],
  projectedPot: number
) {
  const selectedCatalogEntries = catalog
    .filter((entry) => catalogIds.includes(entry.id))
    .sort(sortByName);
  const syndicateBudget = deriveLegacyBudgetSeed(projectedPot, selectedCatalogEntries.length);

  const syndicates = selectedCatalogEntries.map((entry) => ({
      id: createId("syn"),
      name: entry.name,
      color: entry.color,
      spend: 0,
      remainingBankroll: syndicateBudget,
      estimatedBudget: syndicateBudget,
      budgetConfidence: "medium" as const,
      budgetNotes: "",
      estimatedRemainingBudget: syndicateBudget,
      estimateExceeded: false,
      ownedTeamIds: [],
      portfolioExpectedValue: 0,
      catalogEntryId: entry.id,
      sessionOnly: false
    }));

  if (syndicates.length < 2) {
    throw new Error("At least two participating syndicates are required.");
  }

  return syndicates;
}

function rebuildSessionSyndicates(
  session: StoredAuctionSession,
  catalog: SyndicateCatalogEntry[],
  catalogIds: string[]
) {
  const selectedCatalogEntries = catalog.filter((entry) => catalogIds.includes(entry.id));
  const nextEntries = selectedCatalogEntries.map((entry) => ({
    catalogEntryId: entry.id,
    sessionOnly: false,
    name: entry.name,
    color: entry.color
  }));

  const nextSyndicates = nextEntries.map((entry) => {
    const existing =
      session.syndicates.find(
        (candidate) =>
          candidate.catalogEntryId === entry.catalogEntryId
      ) ?? null;

    return {
      id: existing?.id ?? createId("syn"),
      name: entry.name,
      color: entry.color,
      spend: existing?.spend ?? 0,
      remainingBankroll:
        existing?.remainingBankroll ??
        deriveLegacyBudgetSeed(session.payoutRules.projectedPot, nextEntries.length),
      estimatedBudget:
        existing?.estimatedBudget ??
        deriveLegacyBudgetSeed(session.payoutRules.projectedPot, nextEntries.length),
      budgetConfidence: existing?.budgetConfidence ?? "medium",
      budgetNotes: existing?.budgetNotes ?? "",
      estimatedRemainingBudget:
        existing?.estimatedRemainingBudget ??
        deriveLegacyBudgetSeed(session.payoutRules.projectedPot, nextEntries.length),
      estimateExceeded: existing?.estimateExceeded ?? false,
      ownedTeamIds: existing?.ownedTeamIds ?? [],
      portfolioExpectedValue: existing?.portfolioExpectedValue ?? 0,
      catalogEntryId: entry.catalogEntryId,
      sessionOnly: entry.sessionOnly
    } satisfies Syndicate;
  });

  const removed = session.syndicates.filter(
    (candidate) => !nextSyndicates.some((next) => next.id === candidate.id)
  );
  if (
    removed.some((candidate) =>
      session.purchases.some((purchase) => purchase.buyerSyndicateId === candidate.id)
    )
  ) {
    throw new Error("Cannot remove a syndicate that already owns purchased teams.");
  }

  if (nextSyndicates.length < 2) {
    throw new Error("At least two participating syndicates are required.");
  }

  return nextSyndicates;
}

function requireMothershipSyndicate(syndicates: Syndicate[]) {
  const mothershipName = getConfiguredMothershipSyndicateName().trim().toLowerCase();
  const mothership =
    syndicates.find((syndicate) => syndicate.name.trim().toLowerCase() === mothershipName) ?? null;

  if (!mothership) {
    throw new Error(
      `${getConfiguredMothershipSyndicateName()} must be included in participating syndicates.`
    );
  }

  return mothership;
}

function requireSessionFocusSyndicate(
  session: Pick<StoredAuctionSession, "focusSyndicateId" | "syndicates">
) {
  const persistedFocus =
    session.syndicates.find((syndicate) => syndicate.id === session.focusSyndicateId) ?? null;

  if (persistedFocus) {
    return persistedFocus;
  }

  return requireMothershipSyndicate(session.syndicates);
}

function buildAccessMembers(
  assignments: Array<{ platformUserId: string; role: SessionRole; active?: boolean }>,
  platformUsers: PlatformUser[],
  existingMembers: AccessMember[] = []
) {
  const uniqueAssignments = ensureUniqueAccessAssignments(assignments);
  if (!uniqueAssignments.some((assignment) => assignment.role === "admin" && assignment.active)) {
    throw new Error("At least one active admin is required.");
  }

  return uniqueAssignments.map((assignment) => {
    const user = platformUsers.find((candidate) => candidate.id === assignment.platformUserId);
    if (!user) {
      throw new Error("Assigned user was not found.");
    }

    const existing =
      existingMembers.find((member) => member.platformUserId === assignment.platformUserId) ?? null;
    return {
      id: existing?.id ?? createId("member"),
      platformUserId: user.id,
      name: user.name,
      email: user.email,
      role: assignment.role,
      active: assignment.active ?? true,
      createdAt: existing?.createdAt ?? new Date().toISOString()
    } satisfies AccessMember;
  });
}

function ensureUniqueAccessAssignments(
  assignments: Array<{ platformUserId: string; role: SessionRole; active?: boolean }>
) {
  const normalized = assignments.map((assignment) => ({
    platformUserId: assignment.platformUserId,
    role: assignment.role,
    active: assignment.active ?? true
  }));

  const duplicates = normalized.filter(
    (assignment, index) =>
      normalized.findIndex(
        (candidate) => candidate.platformUserId === assignment.platformUserId
      ) !== index
  );

  if (duplicates.length > 0) {
    throw new Error("Duplicate session user assignments are not allowed.");
  }

  return normalized;
}

function ensureUniquePlatformUserEmail(
  users: PlatformUser[],
  email: string,
  excludeId?: string
) {
  const normalized = email.trim().toLowerCase();
  if (
    users.some(
      (candidate) =>
        candidate.id !== excludeId && candidate.email.trim().toLowerCase() === normalized
    )
  ) {
    throw new Error("Duplicate user emails are not allowed.");
  }
}

function ensureUniqueSessionSharedCode(
  sessions: StoredAuctionSession[],
  sharedAccessCode: string,
  excludeSessionId?: string
) {
  const normalized = sharedAccessCode.trim();
  if (
    sessions.some(
      (candidate) =>
        candidate.id !== excludeSessionId &&
        getStoredSharedAccessCode(candidate)?.trim() === normalized
    )
  ) {
    throw new Error(
      "Shared code is already in use by another session. Use a different code, or permanently delete the archived session that already uses it."
    );
  }
}

function getStoredSharedAccessCode(session: StoredAuctionSession) {
  if (session.sharedAccessCodePlaintext.trim()) {
    return session.sharedAccessCodePlaintext.trim();
  }

  if (session.sharedAccessCodeCiphertext) {
    return decryptSharedCode(session.sharedAccessCodeCiphertext);
  }

  return null;
}

function doesSharedCodeMatch(session: StoredAuctionSession, sharedCode: string) {
  const normalized = sharedCode.trim();
  const plaintext = getStoredSharedAccessCode(session);
  if (plaintext) {
    return plaintext === normalized;
  }

  return (
    session.sharedAccessCodeLookup === createSharedCodeLookup(sharedCode) &&
    verifySharedCode(sharedCode, session.sharedAccessCodeHash)
  );
}

function setStoredSharedAccessCode(session: StoredAuctionSession, sharedAccessCode: string) {
  const normalized = sharedAccessCode.trim();
  session.sharedAccessCodePlaintext = normalized;
  session.sharedAccessCodeHash = hashSharedCode(normalized);
  session.sharedAccessCodeLookup = createSharedCodeLookup(normalized);
  session.sharedAccessCodeCiphertext = encryptSharedCode(normalized);
}

function ensureUniqueCatalogSyndicateName(
  entries: SyndicateCatalogEntry[],
  name: string,
  excludeId?: string
) {
  const normalized = name.trim().toLowerCase();
  if (
    entries.some(
      (candidate) => candidate.id !== excludeId && candidate.name.trim().toLowerCase() === normalized
    )
  ) {
    throw new Error("Duplicate syndicate names are not allowed.");
  }
}

function resolveDataSourceRef(sourceKey: string, dataSources: DataSource[]): SessionDataSourceRef {
  if (sourceKey === builtinMockSource.key) {
    return builtinMockSource;
  }

  const id = sourceKey.replace(/^data-source:/, "");
  const source = dataSources.find((candidate) => candidate.id === id);
  if (!source) {
    throw new Error("Selected data source was not found.");
  }

  return {
    key: `data-source:${source.id}`,
    name: source.name,
    kind: source.kind
  };
}

function resolveManagedDataSource(
  sourceKey: string,
  purpose: DataSourcePurpose,
  dataSources: DataSource[]
) {
  const source = dataSources.find((candidate) => `data-source:${candidate.id}` === sourceKey) ?? null;
  if (!source) {
    throw new Error("Selected data source was not found.");
  }
  if (!source.active) {
    throw new Error("Selected data source is unavailable.");
  }
  if (source.kind !== "csv") {
    throw new Error("Selected data source is not supported for session-managed imports.");
  }
  if (source.purpose !== purpose) {
    throw new Error(
      purpose === "bracket"
        ? "Selected data source is not available for bracket imports."
        : "Selected data source is not available for analysis imports."
    );
  }

  return source;
}

function resolveSessionImportSelection(
  selection: SessionSourceSelection | undefined,
  purpose: "bracket",
  dataSources: DataSource[]
): SessionBracketImport | null;
function resolveSessionImportSelection(
  selection: SessionSourceSelection | undefined,
  purpose: "analysis",
  dataSources: DataSource[]
): SessionAnalysisImport | null;
function resolveSessionImportSelection(
  selection: SessionSourceSelection | undefined,
  purpose: DataSourcePurpose,
  dataSources: DataSource[]
) {
  if (!selection) {
    return null;
  }

  if (selection.mode === "saved-source") {
    const source = resolveManagedDataSource(selection.sourceKey, purpose, dataSources);
    return parseSessionImportFromSource(source);
  }

  return purpose === "bracket"
    ? parseSessionBracketImport(selection.csvContent, selection.sourceName, selection.fileName)
    : parseSessionAnalysisImport(selection.csvContent, selection.sourceName, selection.fileName);
}

function parseSessionImportFromSource(source: DataSource) {
  const config = source.config as { csvContent: string; fileName: string | null };
  return source.purpose === "bracket"
    ? parseSessionBracketImport(config.csvContent, source.name, config.fileName)
    : parseSessionAnalysisImport(config.csvContent, source.name, config.fileName);
}

function createImportRun(
  sessionId: string,
  source: SessionDataSourceRef,
  status: DataImportRun["status"],
  message: string
) {
  return {
    id: createId("import"),
    sessionId,
    sourceKey: source.key,
    sourceName: source.name,
    status,
    message,
    createdAt: new Date().toISOString()
  } satisfies DataImportRun;
}

function buildAdminSessionSummary(session: StoredAuctionSession): AdminSessionSummary {
  const activeMembers = session.accessMembers.filter((member) => member.active);
  return {
    id: session.id,
    name: session.name,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    isArchived: Boolean(session.archivedAt),
    archivedAt: session.archivedAt,
    projectionProvider: session.projectionProvider,
    bracketSourceName: session.bracketImport?.sourceName ?? null,
    analysisSourceName: session.analysisImport?.sourceName ?? null,
    importReadinessStatus: session.importReadiness.status,
    importReadinessSummary: session.importReadiness.summary,
    purchaseCount: session.purchases.length,
    syndicateCount: session.syndicates.length,
    overrideCount: Object.keys(session.projectionOverrides).length,
    adminCount: activeMembers.filter((member) => member.role === "admin").length,
    viewerCount: activeMembers.filter((member) => member.role === "viewer").length
  };
}

function buildSessionAdminConfig(session: StoredAuctionSession, refs: ReferenceData): SessionAdminConfig {
  return {
    session,
    currentSharedAccessCode: getStoredSharedAccessCode(session),
    accessMembers: session.accessMembers,
    platformUsers: refs.platformUsers,
    syndicateCatalog: refs.syndicateCatalog,
    dataSources: refs.dataSources,
    importRuns: (refs.dataImportRuns ?? [])
      .filter((run) => run.sessionId === session.id)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
  };
}

function syncSessionMembersForPlatformUser(
  sessions: StoredAuctionSession[],
  user: PlatformUser
) {
  sessions.forEach((session) => {
    session.accessMembers = session.accessMembers.map((member) =>
      member.platformUserId === user.id
        ? {
            ...member,
            name: user.name,
            email: user.email
          }
        : member
    );
  });
}

function syncSessionSyndicatesForCatalogEntry(
  sessions: StoredAuctionSession[],
  entry: SyndicateCatalogEntry
) {
  sessions.forEach((session) => {
    session.syndicates = session.syndicates.map((syndicate) =>
      syndicate.catalogEntryId === entry.id
        ? {
            ...syndicate,
            name: entry.name,
            color: getSyndicateBrandColor(entry.name)
          }
        : syndicate
    );
  });
}

function syncSessionActiveDataSource(
  sessions: StoredAuctionSession[],
  source: DataSource
) {
  sessions.forEach((session) => {
    if (session.activeDataSource.key === `data-source:${source.id}`) {
      session.activeDataSource = {
        key: `data-source:${source.id}`,
        name: source.name,
        kind: source.kind
      };
    }
  });
}

function buildAdminImportReadinessFromSummaryData(args: {
  bracketImport: SessionBracketImport | null | undefined;
  analysisImport: SessionAnalysisImport | null | undefined;
  projectionCount: number;
}) {
  const bracketImport = normalizeBracketImport(args.bracketImport);
  const analysisImport = normalizeAnalysisImport(args.analysisImport);
  const baseProjections =
    args.projectionCount > 0 ? buildPlaceholderProjections(args.projectionCount) : [];

  return buildSessionImportReadiness({
    bracketImport,
    analysisImport,
    baseProjections,
    simulationSnapshot:
      args.projectionCount > 0
        ? ({} as NonNullable<StoredAuctionSession["simulationSnapshot"]>)
        : null
  });
}

function normalizeStoreShape(store: SessionStore) {
  return {
    sessions: (store.sessions ?? []).map(normalizeSessionShape),
    platformUsers: (store.platformUsers ?? []).map((user) => ({
      ...user,
      email: user.email.trim().toLowerCase()
    })),
    syndicateCatalog: store.syndicateCatalog ?? [],
    dataSources: (store.dataSources ?? []).map((source) => ({
      ...source,
      purpose: (source.purpose === "bracket" ? "bracket" : "analysis") as DataSourcePurpose
    })),
    dataImportRuns: store.dataImportRuns ?? [],
    csvAnalysisPortfolios: (store.csvAnalysisPortfolios ?? []).map((portfolio) => ({
      sessionId: String(portfolio.sessionId),
      memberId: String(portfolio.memberId),
      entries: sanitizeCsvPortfolioEntries(portfolio.entries),
      updatedAt: String(portfolio.updatedAt ?? new Date(0).toISOString())
    }))
  };
}

function buildPlaceholderProjections(count: number): TeamProjection[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `summary-${index}`,
    name: `Summary Team ${index + 1}`,
    shortName: `S${index + 1}`,
    region: "East",
    seed: 1,
    rating: 0,
    offense: 0,
    defense: 0,
    tempo: 0,
    source: "summary"
  }));
}

function normalizeBracketImport(
  input: SessionBracketImport | null | undefined
): SessionBracketImport | null {
  if (!input) {
    return null;
  }

  return {
    sourceName: String(input.sourceName),
    fileName: input.fileName ? String(input.fileName) : null,
    importedAt: String(input.importedAt),
    teamCount: Number(input.teamCount ?? input.teams.length),
    teams: (input.teams ?? []).map((team) => ({
      id: String(team.id),
      name: String(team.name),
      shortName: String(team.shortName),
      region: String(team.region),
      seed: Number(team.seed),
      regionSlot: String(team.regionSlot ?? `${team.region}-${team.seed}`),
      site: team.site ? String(team.site) : null,
      subregion: team.subregion ? String(team.subregion) : null,
      isPlayIn: Boolean(team.isPlayIn),
      playInGroup: team.playInGroup ? String(team.playInGroup) : null,
      playInSeed: typeof team.playInSeed === "number" ? Number(team.playInSeed) : null
    }))
  };
}

function normalizeAnalysisImport(
  input: SessionAnalysisImport | null | undefined
): SessionAnalysisImport | null {
  if (!input) {
    return null;
  }

  return {
    sourceName: String(input.sourceName),
    fileName: input.fileName ? String(input.fileName) : null,
    importedAt: String(input.importedAt),
    teamCount: Number(input.teamCount ?? input.teams.length),
    teams: (input.teams ?? []).map((team) => ({
      teamId: team.teamId ? String(team.teamId) : null,
      name: String(team.name),
      shortName: String(team.shortName),
      rating: Number(team.rating),
      offense: Number(team.offense),
      defense: Number(team.defense),
      tempo: Number(team.tempo),
      scouting: team.scouting
    }))
  };
}

function normalizeSessionShape(
  session: Omit<
    StoredAuctionSession,
    "mothershipFunding" | "bracketImport" | "analysisImport" | "importReadiness"
  > & {
    mothershipFunding?: Partial<MothershipFundingModel>;
    bracketImport?: SessionBracketImport | null;
    analysisImport?: SessionAnalysisImport | null;
    importReadiness?: SessionImportReadiness;
  }
): StoredAuctionSession {
  const seedBudget = deriveLegacyBudgetSeed(
    typeof session.payoutRules?.projectedPot === "number"
      ? session.payoutRules.projectedPot
      : typeof (session.payoutRules as { startingBankroll?: number } | undefined)?.startingBankroll ===
            "number"
        ? ((session.payoutRules as { startingBankroll?: number }).startingBankroll ?? 0) *
          Math.max(1, session.syndicates?.length ?? 0)
        : getDefaultPayoutRules().projectedPot,
    session.syndicates?.length ?? 0
  );
  const payoutRules = normalizePayoutRules(
    (session.payoutRules ?? {}) as Partial<PayoutRules> & {
      titleGame?: number;
      startingBankroll?: number;
    },
    session.syndicates?.length ?? 0
  );
  const mothershipFunding = normalizeMothershipFunding(session.mothershipFunding, seedBudget);
  const projectionOverrides = session.projectionOverrides ?? {};
  const teamClassifications = filterTeamClassificationsForProjectionSet(
    session.teamClassifications ?? {},
    session.baseProjections ?? session.projections ?? []
  );
  const teamNotes = filterTeamNotesForProjectionSet(
    session.teamNotes ?? {},
    session.baseProjections ?? session.projections ?? []
  );
  const bracketState = normalizeBracketState(session.bracketState);
  const baseProjections = sortProjections(session.baseProjections ?? session.projections ?? []);
  const projections =
    session.projections && session.baseProjections
      ? sortProjections(session.projections)
      : applyProjectionOverrides(baseProjections, projectionOverrides);
  const bracketImport = normalizeBracketImport(session.bracketImport);
  const analysisImport = normalizeAnalysisImport(session.analysisImport);
  const auctionAssets = buildAuctionAssets({
    baseProjections,
    bracketImport
  });
  const liveState = normalizeLiveState(
    session.liveState,
    auctionAssets,
    projections,
    session.purchases
  );
  const normalizedSyndicates: Syndicate[] = (session.syndicates ?? []).map((syndicate) => {
    const estimate = normalizeSyndicateEstimate(syndicate, seedBudget);
    const estimateState = deriveSyndicateEstimateState(estimate.estimatedBudget, syndicate.spend ?? 0);
    return {
      ...syndicate,
      spend: roundCurrency(syndicate.spend ?? 0),
      remainingBankroll:
        typeof syndicate.remainingBankroll === "number"
          ? roundCurrency(syndicate.remainingBankroll)
          : estimateState.estimatedRemainingBudget,
      estimatedBudget: estimate.estimatedBudget,
      budgetConfidence: estimate.budgetConfidence,
      budgetNotes: estimate.budgetNotes,
      estimatedRemainingBudget:
        typeof syndicate.estimatedRemainingBudget === "number"
          ? roundCurrency(syndicate.estimatedRemainingBudget)
          : estimateState.estimatedRemainingBudget,
      estimateExceeded:
        typeof syndicate.estimateExceeded === "boolean"
          ? syndicate.estimateExceeded
          : estimateState.estimateExceeded,
      ownedTeamIds: syndicate.ownedTeamIds ?? [],
      portfolioExpectedValue: roundCurrency(syndicate.portfolioExpectedValue ?? 0)
    } satisfies Syndicate;
  });
  const mothershipId =
    normalizedSyndicates.find((syndicate) => syndicate.id === session.focusSyndicateId)?.id ??
    normalizedSyndicates.find(
      (syndicate) =>
        syndicate.name.trim().toLowerCase() ===
        getConfiguredMothershipSyndicateName().trim().toLowerCase()
    )?.id;
  const syndicates: Syndicate[] = normalizedSyndicates.map((syndicate) => {
    if (syndicate.id !== mothershipId) {
      return syndicate;
    }

    const estimateState = deriveSyndicateEstimateState(
      mothershipFunding.budgetBase,
      syndicate.spend
    );

    return {
      ...syndicate,
      remainingBankroll: estimateState.estimatedRemainingBudget,
      estimatedBudget: mothershipFunding.budgetBase,
      budgetConfidence: "high",
      estimatedRemainingBudget: estimateState.estimatedRemainingBudget,
      estimateExceeded: false
    };
  });

  return {
    ...session,
    eventAccess: {
      sharedCodeConfigured: true
    },
    sharedAccessCodePlaintext: session.sharedAccessCodePlaintext ?? "",
    archivedAt: session.archivedAt ?? null,
    archivedByName: session.archivedByName ?? null,
    archivedByEmail: session.archivedByEmail ?? null,
    sharedAccessCodeHash: session.sharedAccessCodeHash ?? "",
    sharedAccessCodeLookup: session.sharedAccessCodeLookup ?? "",
    sharedAccessCodeCiphertext: session.sharedAccessCodeCiphertext ?? "",
    accessMembers: session.accessMembers ?? [],
    payoutRules,
    analysisSettings: normalizeAnalysisSettings(session.analysisSettings),
    mothershipFunding,
    syndicates,
    baseProjections,
    projections,
    projectionOverrides,
    activeDataSource: session.activeDataSource ?? builtinMockSource,
    bracketImport,
    analysisImport,
    importReadiness: buildSessionImportReadiness({
      bracketImport,
      analysisImport,
      baseProjections,
      simulationSnapshot: session.simulationSnapshot ?? null
    }),
    auctionAssets,
    liveState,
    teamClassifications,
    teamNotes,
    bracketState
  };
}

function sortProjections(projections: TeamProjection[]) {
  return [...projections].sort((left, right) => {
    if (left.region === right.region) {
      return left.seed - right.seed;
    }
    return left.region.localeCompare(right.region);
  });
}

function normalizeLiveState(
  liveState: StoredAuctionSession["liveState"] | undefined,
  auctionAssets: NonNullable<StoredAuctionSession["auctionAssets"]>,
  projections: TeamProjection[],
  purchases: PurchaseRecord[]
) {
  const purchasedAssetIds = purchases
    .map((purchase) => purchase.assetId ?? purchase.teamId)
    .filter((assetId) => auctionAssets.some((asset) => asset.id === assetId));
  const purchasedProjectionIds = purchases.flatMap(
    (purchase) => purchase.projectionIds ?? [purchase.teamId]
  );
  const normalized = {
    nominatedAssetId: liveState?.nominatedAssetId ?? null,
    nominatedTeamId: liveState?.nominatedTeamId ?? null,
    currentBid: liveState?.currentBid ?? 0,
    soldAssetIds: [...new Set([...(liveState?.soldAssetIds ?? []), ...purchasedAssetIds])],
    soldTeamIds: [...new Set([...(liveState?.soldTeamIds ?? []), ...purchasedProjectionIds])],
    lastUpdatedAt: liveState?.lastUpdatedAt ?? new Date(0).toISOString()
  };

  if (
    normalized.nominatedAssetId &&
    !auctionAssets.some((asset) => asset.id === normalized.nominatedAssetId)
  ) {
    normalized.nominatedAssetId = null;
  }

  if (normalized.nominatedAssetId) {
    const asset = auctionAssets.find((candidate) => candidate.id === normalized.nominatedAssetId) ?? null;
    normalized.nominatedTeamId = asset
      ? resolveRepresentativeProjectionId(asset, projections)
      : null;
  } else if (normalized.nominatedTeamId) {
    const matchingAsset =
      auctionAssets.find((asset) => asset.projectionIds.includes(normalized.nominatedTeamId!)) ?? null;
    normalized.nominatedAssetId = matchingAsset?.id ?? null;
  } else {
    normalized.nominatedAssetId = auctionAssets[0]?.id ?? null;
    normalized.nominatedTeamId = auctionAssets[0]
      ? resolveRepresentativeProjectionId(auctionAssets[0], projections)
      : null;
  }

  normalized.soldAssetIds = normalized.soldAssetIds.filter((assetId) =>
    auctionAssets.some((asset) => asset.id === assetId)
  );
  normalized.soldTeamIds = normalized.soldTeamIds.filter((teamId) =>
    projections.some((projection) => projection.id === teamId)
  );

  return normalized;
}

function resolveRepresentativeProjectionId(
  asset: AuctionAsset,
  projections: TeamProjection[]
) {
  const directProjection = asset.projectionIds.find((projectionId) =>
    projections.some((projection) => projection.id === projectionId)
  );
  if (directProjection) {
    return directProjection;
  }

  const matchingTeamId = asset.memberTeamIds.find((teamId) =>
    projections.some((projection) => projection.id === teamId)
  );
  if (matchingTeamId) {
    return matchingTeamId;
  }

  if (asset.seedRange) {
    return (
      projections.find(
        (projection) =>
          projection.region === asset.region &&
          projection.seed >= asset.seedRange![0] &&
          projection.seed <= asset.seedRange![1]
      )?.id ?? null
    );
  }

  if (asset.seed !== null) {
    return (
      projections.find(
        (projection) => projection.region === asset.region && projection.seed === asset.seed
      )?.id ?? null
    );
  }

  return null;
}

function normalizePayoutRules(
  payoutRules: Partial<PayoutRules> & {
    titleGame?: number;
    startingBankroll?: number;
    houseTakePct?: number;
  } = {},
  syndicateCount = 4
): PayoutRules {
  const defaults = getDefaultPayoutRules();

  return {
    roundOf64:
      typeof payoutRules.roundOf64 === "number" ? payoutRules.roundOf64 : defaults.roundOf64,
    roundOf32:
      typeof payoutRules.roundOf32 === "number" ? payoutRules.roundOf32 : defaults.roundOf32,
    sweet16:
      typeof payoutRules.sweet16 === "number" ? payoutRules.sweet16 : defaults.sweet16,
    elite8: typeof payoutRules.elite8 === "number" ? payoutRules.elite8 : defaults.elite8,
    finalFour:
      typeof payoutRules.finalFour === "number" ? payoutRules.finalFour : defaults.finalFour,
    champion:
      typeof payoutRules.champion === "number" ? payoutRules.champion : defaults.champion,
    projectedPot:
      typeof payoutRules.projectedPot === "number"
        ? payoutRules.projectedPot
        : typeof payoutRules.startingBankroll === "number"
          ? payoutRules.startingBankroll * Math.max(1, syndicateCount)
          : defaults.projectedPot
  };
}

function defaultAnalysisSettings(): AnalysisSettings {
  return {};
}

function normalizeAnalysisSettings(
  analysisSettings: Partial<AnalysisSettings> | undefined
): AnalysisSettings {
  void analysisSettings;
  return defaultAnalysisSettings();
}

function applySyndicateFundingUpdates(
  session: StoredAuctionSession,
  syndicates: Syndicate[],
  updates: SessionSyndicateFundingInput[]
) {
  const updateLookup = new Map(updates.map((update) => [update.catalogEntryId, update]));
  const mothershipName = getConfiguredMothershipSyndicateName().trim().toLowerCase();
  const seedBudget = deriveLegacyBudgetSeed(session.payoutRules.projectedPot, syndicates.length);

  return syndicates.map((syndicate) => {
    if (
      syndicate.name.trim().toLowerCase() === mothershipName ||
      !syndicate.catalogEntryId
    ) {
      return syndicate;
    }

    const update = updateLookup.get(syndicate.catalogEntryId);
    const normalized = normalizeSyndicateEstimate(update ?? syndicate, seedBudget);
    const estimateState = deriveSyndicateEstimateState(normalized.estimatedBudget, syndicate.spend);

    return {
      ...syndicate,
      estimatedBudget: normalized.estimatedBudget,
      budgetConfidence: normalized.budgetConfidence,
      budgetNotes: normalized.budgetNotes,
      remainingBankroll: estimateState.estimatedRemainingBudget,
      estimatedRemainingBudget: estimateState.estimatedRemainingBudget,
      estimateExceeded: estimateState.estimateExceeded
    };
  });
}

function filterOverridesForProjectionSet(
  overrides: Record<string, ProjectionOverride>,
  baseProjections: TeamProjection[]
) {
  const validIds = new Set(baseProjections.map((projection) => projection.id));
  return Object.fromEntries(
    Object.entries(overrides).filter(([teamId]) => validIds.has(teamId))
  );
}

function filterTeamClassificationsForProjectionSet(
  classifications: Record<string, TeamClassificationTag>,
  baseProjections: TeamProjection[]
) {
  const validIds = new Set(baseProjections.map((projection) => projection.id));
  return Object.fromEntries(
    Object.entries(classifications).filter(([teamId]) => validIds.has(teamId))
  );
}

function filterTeamNotesForProjectionSet(
  notes: Record<string, TeamNoteTag>,
  baseProjections: TeamProjection[]
) {
  const validIds = new Set(baseProjections.map((projection) => projection.id));
  return Object.fromEntries(Object.entries(notes).filter(([teamId]) => validIds.has(teamId)));
}

function findSession(sessions: StoredAuctionSession[], sessionId: string) {
  const session = sessions.find((candidate) => candidate.id === sessionId);
  if (!session) {
    throw new Error("Auction session not found.");
  }
  return session;
}

function findById<T extends { id: string }>(rows: T[], id: string, message: string) {
  const row = rows.find((candidate) => candidate.id === id);
  if (!row) {
    throw new Error(message);
  }
  return row;
}

function sortByName<T extends { name: string }>(left: T, right: T) {
  return left.name.localeCompare(right.name);
}

function requireSupabaseClient() {
  return createServerSupabaseClient();
}

function mapPlatformUsers(rows: Array<Record<string, unknown>> | null | undefined) {
  return (((rows ?? []).map((row) => ({
    id: String(row.id),
    name: String(row.name),
    email: String(row.email).trim().toLowerCase(),
    active: Boolean(row.active),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  })) as PlatformUser[]) ?? []);
}

function mapSyndicateCatalog(rows: Array<Record<string, unknown>> | null | undefined) {
  return (((rows ?? []).map((row) => ({
    id: String(row.id),
    name: String(row.name),
    color: getSyndicateBrandColor(String(row.name)),
    active: Boolean(row.active),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  })) as SyndicateCatalogEntry[]) ?? []);
}

function mapDataSources(rows: Array<Record<string, unknown>> | null | undefined) {
  return (((rows ?? []).map((row) => ({
    id: String(row.id),
    name: String(row.name),
    kind: String(row.kind) as DataSource["kind"],
    purpose:
      String(row.purpose ?? "").toLowerCase() === "bracket" ? "bracket" : "analysis",
    active: Boolean(row.active),
    config: row.config as DataSource["config"],
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    lastTestedAt: row.last_tested_at ? String(row.last_tested_at) : null
  })) as DataSource[]) ?? []);
}

function mapAccessMembers(
  rows: Array<Record<string, unknown>>,
  platformUsers: PlatformUser[]
) {
  return rows.map((row) => {
    const platformUserId = row.platform_user_id ? String(row.platform_user_id) : null;
    const platformUser =
      platformUserId
        ? platformUsers.find((candidate) => candidate.id === platformUserId) ?? null
        : null;
    return {
      id: String(row.id),
      platformUserId,
      name: platformUser?.name ?? String(row.name),
      email: platformUser?.email ?? String(row.email),
      role: String(row.role) as AccessMember["role"],
      active: Boolean(row.active),
      createdAt: String(row.created_at)
    } satisfies AccessMember;
  });
}

function mapTeamProjectionRow(row: Record<string, unknown>): TeamProjection {
  const scouting = {
    netRank: numberOrUndefined(row.net_rank),
    kenpomRank: numberOrUndefined(row.kenpom_rank),
    threePointPct: numberOrUndefined(row.three_point_pct),
    rankedWins: numberOrUndefined(row.ranked_wins),
    quadWins:
      row.quad1_wins !== null ||
      row.quad2_wins !== null ||
      row.quad3_wins !== null ||
      row.quad4_wins !== null
        ? {
            q1: Number(row.quad1_wins ?? 0),
            q2: Number(row.quad2_wins ?? 0),
            q3: Number(row.quad3_wins ?? 0),
            q4: Number(row.quad4_wins ?? 0)
          }
        : undefined,
    ats:
      row.ats_wins !== null || row.ats_losses !== null || row.ats_pushes !== null
        ? {
            wins: Number(row.ats_wins ?? 0),
            losses: Number(row.ats_losses ?? 0),
            pushes: Number(row.ats_pushes ?? 0)
          }
        : undefined,
    offenseStyle: String(row.offense_style ?? "").trim() || undefined,
    defenseStyle: String(row.defense_style ?? "").trim() || undefined
  };

  return {
    id: String(row.id),
    name: String(row.name),
    shortName: String(row.short_name),
    region: String(row.region),
    seed: Number(row.seed),
    rating: Number(row.rating),
    offense: Number(row.offense),
    defense: Number(row.defense),
    tempo: Number(row.tempo),
    source: String(row.source),
    scouting: Object.values(scouting).some((value) => value !== undefined) ? scouting : undefined
  };
}

function serializeTeamProjectionRow(sessionId: string, team: TeamProjection) {
  return {
    id: team.id,
    session_id: sessionId,
    name: team.name,
    short_name: team.shortName,
    region: team.region,
    seed: team.seed,
    rating: team.rating,
    offense: team.offense,
    defense: team.defense,
    tempo: team.tempo,
    net_rank: team.scouting?.netRank ?? null,
    kenpom_rank: team.scouting?.kenpomRank ?? null,
    three_point_pct: team.scouting?.threePointPct ?? null,
    ranked_wins: team.scouting?.rankedWins ?? null,
    quad1_wins: team.scouting?.quadWins?.q1 ?? null,
    quad2_wins: team.scouting?.quadWins?.q2 ?? null,
    quad3_wins: team.scouting?.quadWins?.q3 ?? null,
    quad4_wins: team.scouting?.quadWins?.q4 ?? null,
    ats_wins: team.scouting?.ats?.wins ?? null,
    ats_losses: team.scouting?.ats?.losses ?? null,
    ats_pushes: team.scouting?.ats?.pushes ?? null,
    offense_style: team.scouting?.offenseStyle ?? null,
    defense_style: team.scouting?.defenseStyle ?? null,
    source: team.source
  };
}

function mapSessionSyndicates(rows: Array<Record<string, unknown>> | null | undefined) {
  return (((rows ?? []).map((row) => ({
    id: String(row.id),
    name: String(row.name),
    color: getSyndicateBrandColor(String(row.name)),
    spend: Number(row.spend),
    remainingBankroll: Number(row.remaining_bankroll),
    estimatedBudget:
      row.estimated_budget === null || row.estimated_budget === undefined
        ? undefined
        : Number(row.estimated_budget),
    budgetConfidence: String(row.budget_confidence ?? "medium") as Syndicate["budgetConfidence"],
    budgetNotes: String(row.budget_notes ?? ""),
    estimatedRemainingBudget: Number(row.remaining_bankroll ?? 0),
    estimateExceeded: false,
    ownedTeamIds: ((row.owned_team_ids as string[]) ?? []).map(String),
    portfolioExpectedValue: Number(row.portfolio_expected_value),
    catalogEntryId: row.catalog_entry_id ? String(row.catalog_entry_id) : null,
    sessionOnly: Boolean(row.session_only)
  })) as Syndicate[]) ?? []);
}

function countRowsBySession(rows: Array<Record<string, unknown>>) {
  return rows.reduce((counts, row) => {
    const sessionId = String(row.session_id);
    counts.set(sessionId, (counts.get(sessionId) ?? 0) + 1);
    return counts;
  }, new Map<string, number>());
}

function countMembersBySession(rows: Array<Record<string, unknown>>) {
  return rows.reduce((counts, row) => {
    if (!Boolean(row.active)) {
      return counts;
    }

    const sessionId = String(row.session_id);
    const current = counts.get(sessionId) ?? { adminCount: 0, viewerCount: 0 };
    const role = String(row.role);
    if (role === "admin") {
      current.adminCount += 1;
    } else if (role === "viewer") {
      current.viewerCount += 1;
    }
    counts.set(sessionId, current);
    return counts;
  }, new Map<string, { adminCount: number; viewerCount: number }>());
}

async function replaceRows(
  client: ReturnType<typeof createServerSupabaseClient>,
  table: string,
  key: string,
  value: string,
  rows: Record<string, unknown>[]
) {
  const deleteResult = await client.from(table).delete().eq(key, value);
  throwOnSupabaseError(deleteResult.error);

  if (rows.length > 0) {
    const insertResult = await client.from(table).insert(rows);
    throwOnSupabaseError(insertResult.error);
  }
}

async function upsertAuctionSessionRow(
  client: ReturnType<typeof createServerSupabaseClient>,
  payload: Record<string, unknown>
) {
  const result = await client.from("auction_sessions").upsert(payload);
  if (result.error && isMissingSharedCodePlaintextColumnError(result.error)) {
    const fallbackResult = await client
      .from("auction_sessions")
      .upsert(stripSharedCodePlaintext(payload));
    throwOnSupabaseError(fallbackResult.error);
    return;
  }

  throwOnSupabaseError(result.error);
}

async function updateAuctionSessionRow(
  client: ReturnType<typeof createServerSupabaseClient>,
  payload: Record<string, unknown>,
  sessionId: string
) {
  const result = await client.from("auction_sessions").update(payload).eq("id", sessionId);
  if (result.error && isMissingSharedCodePlaintextColumnError(result.error)) {
    const fallbackResult = await client
      .from("auction_sessions")
      .update(stripSharedCodePlaintext(payload))
      .eq("id", sessionId);
    throwOnSupabaseError(fallbackResult.error);
    return;
  }

  throwOnSupabaseError(result.error);
}

function stripSharedCodePlaintext(payload: Record<string, unknown>) {
  const nextPayload = { ...payload };
  delete nextPayload.shared_code_plaintext;
  return nextPayload;
}

function throwOnSupabaseError(
  error: { message?: string; code?: string; details?: string | null } | null
) {
  if (error) {
    if (isSharedCodeLookupConflict(error)) {
      throw new Error(
        "Shared code is already in use by another session. Use a different code, or permanently delete the archived session that already uses it."
      );
    }

    if (isMissingUndoPurchaseFunctionError(error)) {
      throw new Error(
        "Undo purchase requires the latest Supabase schema update. Apply the SQL changes in supabase/schema.sql, then try again."
      );
    }

    throw new Error(error.message ?? "Supabase request failed.");
  }
}

function isSharedCodeLookupConflict(error: {
  message?: string;
  code?: string;
  details?: string | null;
}) {
  const rawText = [error.message, error.details, error.code]
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .join(" ")
    .toLowerCase();

  return (
    rawText.includes("auction_sessions_shared_code_lookup_idx") ||
    rawText.includes("auction_sessions_shared_code_plaintext_idx") ||
    (rawText.includes("shared_code_lookup") && rawText.includes("duplicate key value")) ||
    (rawText.includes("shared_code_plaintext") && rawText.includes("duplicate key value"))
  );
}

function isMissingSharedCodePlaintextColumnError(error: {
  message?: string;
  code?: string;
  details?: string | null;
}) {
  const rawText = [error.message, error.details, error.code]
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .join(" ")
    .toLowerCase();

  return (
    rawText.includes("shared_code_plaintext") &&
    (rawText.includes("schema cache") ||
      rawText.includes("column") ||
      rawText.includes("does not exist"))
  );
}

function isMissingUndoPurchaseFunctionError(error: {
  message?: string;
  code?: string;
  details?: string | null;
}) {
  const rawText = [error.message, error.details, error.code]
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .join(" ")
    .toLowerCase();

  return (
    rawText.includes("undo_purchase_transaction") &&
    (rawText.includes("schema cache") ||
      rawText.includes("function") ||
      rawText.includes("does not exist"))
  );
}

function numberOrUndefined(value: unknown) {
  if (value === null || value === undefined) {
    return undefined;
  }
  return Number(value);
}

function sanitizeCsvPortfolioEntries(
  entries: Array<{ teamId: string; paidPrice: number }> | null | undefined
) {
  const deduped = new Map<string, number>();
  for (const entry of entries ?? []) {
    const teamId = String(entry.teamId ?? "").trim();
    if (!teamId) {
      continue;
    }
    const paidPrice = Number(entry.paidPrice ?? 0);
    deduped.set(teamId, Number.isFinite(paidPrice) ? Math.max(0, paidPrice) : 0);
  }

  return [...deduped.entries()].map(([teamId, paidPrice]) => ({
    teamId,
    paidPrice
  }));
}

type ReferenceData = Pick<
  SessionStore,
  "platformUsers" | "syndicateCatalog" | "dataSources"
> & {
  dataImportRuns?: DataImportRun[];
};

const localRepository = new LocalSessionRepository();

export function getSessionRepository(): SessionRepository {
  return getConfiguredStorageBackend() === "supabase"
    ? new SupabaseSessionRepository()
    : localRepository;
}
