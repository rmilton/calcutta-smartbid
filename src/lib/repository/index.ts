import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  getConfiguredMothershipSyndicateName,
  getConfiguredStorageBackend
} from "@/lib/config";
import { buildDashboard } from "@/lib/dashboard";
import { simulateAuctionField } from "@/lib/engine/simulation";
import { getDefaultFinalFourPairings, getDefaultPayoutRules } from "@/lib/sample-data";
import {
  createSharedCodeLookup,
  decryptSharedCode,
  encryptSharedCode,
  hashSharedCode,
  verifySharedCode
} from "@/lib/session-security";
import {
  applyProjectionOverrides,
  loadProjectionProvider,
  loadProjectionsFromSource,
  testDataSourceConnection
} from "@/lib/providers/projections";
import { getSyndicateBrandColor } from "@/lib/syndicate-colors";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  AccessMember,
  AnalysisSettings,
  AdminCenterData,
  AdminSessionSummary,
  AuthenticatedMember,
  AuctionDashboard,
  AuctionSession,
  CsvAnalysisPortfolio,
  DataImportRun,
  DataSource,
  PlatformUser,
  ProjectionOverride,
  PayoutRules,
  SessionAdminConfig,
  SessionDataSourceRef,
  SessionRole,
  StoredAuctionSession,
  StorageBackend,
  Syndicate,
  SyndicateCatalogEntry,
  TeamProjection,
  createDataSourceSchema,
  createPlatformUserSchema,
  createSessionSchema,
  createSyndicateCatalogSchema,
  updateDataSourceSchema,
  updatePlatformUserSchema,
  updateSyndicateCatalogSchema
} from "@/lib/types";
import { clamp, createId, roundCurrency } from "@/lib/utils";

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
  dataSourceKey: string;
  simulationIterations: number;
}

interface ProjectionOverrideInput {
  rating?: number;
  offense?: number;
  defense?: number;
  tempo?: number;
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
    kind: "csv" | "api";
    active?: boolean;
    csvContent?: string;
    fileName?: string | null;
    url?: string;
    bearerToken?: string;
  }): Promise<DataSource>;
  updateDataSource(
    sourceId: string,
    input: Partial<{
      name: string;
      active: boolean;
      csvContent: string;
      fileName: string | null;
      url: string;
      bearerToken: string;
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
    }
  ): Promise<SessionAdminConfig>;
  setSessionDataSource(sessionId: string, sourceKey: string): Promise<SessionAdminConfig>;
  runSessionImport(sessionId: string, sourceKey?: string): Promise<SessionAdminConfig>;
  importProjections(sessionId: string, provider: "mock" | "remote"): Promise<AuctionDashboard>;
  rebuildSimulation(sessionId: string, iterations?: number): Promise<AuctionDashboard>;
  updateLiveState(
    sessionId: string,
    patch: { nominatedTeamId?: string | null; currentBid?: number }
  ): Promise<AuctionDashboard>;
  recordPurchase(
    sessionId: string,
    input: { teamId?: string; buyerSyndicateId: string; price: number }
  ): Promise<AuctionDashboard>;
  saveProjectionOverride(
    sessionId: string,
    teamId: string,
    input: ProjectionOverrideInput
  ): Promise<AuctionDashboard>;
  clearProjectionOverride(sessionId: string, teamId: string): Promise<AuctionDashboard>;
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
    const lookup = createSharedCodeLookup(sharedCode);
    const session = store.sessions.find(
      (candidate) =>
        candidate.sharedAccessCodeLookup === lookup &&
        verifySharedCode(sharedCode, candidate.sharedAccessCodeHash)
    );

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
    kind: "csv" | "api";
    active?: boolean;
    csvContent?: string;
    fileName?: string | null;
    url?: string;
    bearerToken?: string;
  }) {
    const store = await this.readStore();
    const parsed = createDataSourceSchema.parse(input);
    const now = new Date().toISOString();
    const source: DataSource =
      parsed.kind === "csv"
        ? {
            id: createId("source"),
            name: parsed.name.trim(),
            kind: "csv",
            active: parsed.active,
            config: {
              csvContent: parsed.csvContent,
              fileName: parsed.fileName ?? null
            },
            createdAt: now,
            updatedAt: now,
            lastTestedAt: null
          }
        : {
            id: createId("source"),
            name: parsed.name.trim(),
            kind: "api",
            active: parsed.active,
            config: {
              url: parsed.url,
              bearerToken: parsed.bearerToken ?? ""
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
      url: string;
      bearerToken: string;
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
        fileName: parsed.fileName ?? (source.config as { fileName: string | null }).fileName ?? null
      };
    } else {
      source.config = {
        url: parsed.url ?? (source.config as { url: string }).url,
        bearerToken:
          parsed.bearerToken ?? (source.config as { bearerToken?: string }).bearerToken ?? ""
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
    session.sharedAccessCodeHash = hashSharedCode(sharedAccessCode);
    session.sharedAccessCodeLookup = createSharedCodeLookup(sharedAccessCode);
    session.sharedAccessCodeCiphertext = encryptSharedCode(sharedAccessCode);
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
    }
  ) {
    const store = await this.readStore();
    const session = findSession(store.sessions, sessionId);
    session.syndicates = rebuildSessionSyndicates(
      session,
      store.syndicateCatalog,
      input.catalogSyndicateIds
    );
    session.focusSyndicateId = requireSessionFocusSyndicate(session).id;
    session.syndicates = recalculateSyndicateValues(session);
    session.updatedAt = new Date().toISOString();
    await this.writeStore(store);
    return buildSessionAdminConfig(session, store);
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
    patch: { nominatedTeamId?: string | null; currentBid?: number }
  ) {
    const store = await this.readStore();
    const session = findSession(store.sessions, sessionId);
    applyLiveStatePatch(session, patch);
    await this.writeStore(store);
    return buildDashboard(session, this.backend);
  }

  async recordPurchase(
    sessionId: string,
    input: { teamId?: string; buyerSyndicateId: string; price: number }
  ) {
    const store = await this.readStore();
    const session = findSession(store.sessions, sessionId);
    applyPurchaseMutation(session, input);
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
      overridesResult,
      membersResult,
      usersResult,
      catalogResult,
      sourcesResult
    ] = await Promise.all([
      client
        .from("auction_sessions")
        .select(
          "id, name, created_at, updated_at, archived_at, projection_provider, active_data_source_name"
        )
        .order("updated_at", { ascending: false }),
      client.from("syndicates").select("session_id"),
      client.from("purchase_records").select("session_id"),
      client.from("projection_overrides").select("session_id"),
      client.from("session_members").select("session_id, role, active"),
      client.from("platform_users").select("*").order("name", { ascending: true }),
      client.from("syndicate_catalog").select("*").order("name", { ascending: true }),
      client.from("data_sources").select("*").order("name", { ascending: true })
    ]);

    throwOnSupabaseError(sessionsResult.error);
    throwOnSupabaseError(syndicatesResult.error);
    throwOnSupabaseError(purchasesResult.error);
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

          return {
            id: sessionId,
            name: String(row.name),
            createdAt: String(row.created_at),
            updatedAt: String(row.updated_at),
            isArchived: row.archived_at !== null,
            archivedAt: row.archived_at ? String(row.archived_at) : null,
            projectionProvider: String(row.projection_provider),
            activeDataSourceName: String(row.active_data_source_name ?? "Built-in Mock Field"),
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
      currentSharedAccessCode: session.sharedAccessCodeCiphertext
        ? decryptSharedCode(session.sharedAccessCodeCiphertext)
        : null,
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
      client.from("session_members").select("*").eq("session_id", sessionId),
      client.from("platform_users").select("*")
    ]);

    throwOnSupabaseError(sessionResult.error);
    throwOnSupabaseError(syndicatesResult.error);
    throwOnSupabaseError(projectionsResult.error);
    throwOnSupabaseError(purchasesResult.error);
    throwOnSupabaseError(snapshotResult.error);
    throwOnSupabaseError(overridesResult.error);
    throwOnSupabaseError(membersResult.error);
    throwOnSupabaseError(usersResult.error);

    if (!sessionResult.data) {
      return null;
    }

    const platformUsers = mapPlatformUsers(usersResult.data);
    const baseProjections = sortProjections(
      (((projectionsResult.data as Array<Record<string, unknown>> | null) ?? []).map((row) => ({
        id: String(row.id),
        name: String(row.name),
        shortName: String(row.short_name),
        region: String(row.region),
        seed: Number(row.seed),
        rating: Number(row.rating),
        offense: Number(row.offense),
        defense: Number(row.defense),
        tempo: Number(row.tempo),
        source: String(row.source)
      })) as TeamProjection[])
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
      syndicates: mapSessionSyndicates(syndicatesResult.data),
      baseProjections,
      projections: applyProjectionOverrides(baseProjections, overrides),
      projectionOverrides: overrides,
      projectionProvider: String(sessionResult.data.projection_provider),
      activeDataSource: {
        key: String(sessionResult.data.active_data_source_key ?? builtinMockSource.key),
        name: String(sessionResult.data.active_data_source_name ?? builtinMockSource.name),
        kind: String(
          sessionResult.data.active_data_source_kind ?? builtinMockSource.kind
        ) as SessionDataSourceRef["kind"]
      },
      finalFourPairings: sessionResult.data.final_four_pairings as [string, string][],
      liveState: sessionResult.data.live_state as AuctionSession["liveState"],
      purchases: (((purchasesResult.data as Array<Record<string, unknown>> | null) ?? []).map(
        (row) => ({
          id: String(row.id),
          sessionId: String(row.session_id),
          teamId: String(row.team_id),
          buyerSyndicateId: String(row.buyer_syndicate_id),
          price: Number(row.price),
          createdAt: String(row.created_at)
        })
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
    const lookup = createSharedCodeLookup(sharedCode);
    const sessionResult = await client
      .from("auction_sessions")
      .select("id, shared_code_hash")
      .eq("shared_code_lookup", lookup)
      .maybeSingle();

    throwOnSupabaseError(sessionResult.error);

    if (!sessionResult.data) {
      throw new Error("Email or shared code is invalid.");
    }

    if (!verifySharedCode(sharedCode, String(sessionResult.data.shared_code_hash))) {
      throw new Error("Email or shared code is invalid.");
    }

    const session = await this.requireSession(String(sessionResult.data.id));
    const normalizedEmail = email.trim().toLowerCase();
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
    kind: "csv" | "api";
    active?: boolean;
    csvContent?: string;
    fileName?: string | null;
    url?: string;
    bearerToken?: string;
  }) {
    const parsed = createDataSourceSchema.parse(input);
    const now = new Date().toISOString();
    const config =
      parsed.kind === "csv"
        ? {
            csvContent: parsed.csvContent,
            fileName: parsed.fileName ?? null
          }
        : {
            url: parsed.url,
            bearerToken: parsed.bearerToken ?? ""
          };
    const client = requireSupabaseClient();
    const result = await client
      .from("data_sources")
      .insert({
        id: createId("source"),
        name: parsed.name.trim(),
        kind: parsed.kind,
        active: parsed.active,
        config,
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
      url: string;
      bearerToken: string;
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
        : {
            url: parsed.url ?? (current.config as { url: string }).url,
            bearerToken:
              parsed.bearerToken ??
              (current.config as { bearerToken?: string }).bearerToken ??
              ""
          };

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
    session.sharedAccessCodeHash = hashSharedCode(sharedAccessCode);
    session.sharedAccessCodeLookup = createSharedCodeLookup(sharedAccessCode);
    session.sharedAccessCodeCiphertext = encryptSharedCode(sharedAccessCode);
    session.updatedAt = new Date().toISOString();
    const client = requireSupabaseClient();
    const result = await client
      .from("auction_sessions")
      .update({
        shared_code_hash: session.sharedAccessCodeHash,
        shared_code_lookup: session.sharedAccessCodeLookup,
        shared_code_ciphertext: session.sharedAccessCodeCiphertext,
        updated_at: session.updatedAt
      })
      .eq("id", sessionId);
    throwOnSupabaseError(result.error);
    return this.getSessionAdminConfig(sessionId);
  }

  async updateSessionPayoutRules(sessionId: string, payoutRules: PayoutRules) {
    const session = await this.requireSession(sessionId);
    applyPayoutRulesMutation(session, payoutRules);
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
    }
  ) {
    const refs = await this.readReferenceData();
    const session = await this.requireSession(sessionId);
    session.syndicates = rebuildSessionSyndicates(
      session,
      refs.syndicateCatalog,
      input.catalogSyndicateIds
    );
    session.focusSyndicateId = requireSessionFocusSyndicate(session).id;
    session.syndicates = recalculateSyndicateValues(session);
    session.updatedAt = new Date().toISOString();
    await this.persistSessionMeta(session);
    await this.persistSessionSyndicates(session);
    return this.getSessionAdminConfig(sessionId);
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
    patch: { nominatedTeamId?: string | null; currentBid?: number }
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
    input: { teamId?: string; buyerSyndicateId: string; price: number }
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
    const client = requireSupabaseClient();
    const result = await client.from("auction_sessions").upsert({
      id: session.id,
      name: session.name,
      focus_syndicate_id: session.focusSyndicateId,
      operator_passcode: "legacy-admin",
      viewer_passcode: "legacy-viewer",
      shared_code_hash: session.sharedAccessCodeHash,
      shared_code_lookup: session.sharedAccessCodeLookup,
      shared_code_ciphertext: session.sharedAccessCodeCiphertext,
      archived_at: session.archivedAt,
      archived_by_name: session.archivedByName,
      archived_by_email: session.archivedByEmail,
      payout_rules: session.payoutRules,
      analysis_settings: session.analysisSettings,
      projection_provider: session.projectionProvider,
      active_data_source_key: session.activeDataSource.key,
      active_data_source_name: session.activeDataSource.name,
      active_data_source_kind: session.activeDataSource.kind,
      final_four_pairings: session.finalFourPairings,
      live_state: session.liveState,
      created_at: session.createdAt,
      updated_at: session.updatedAt
    });
    throwOnSupabaseError(result.error);
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
      session.baseProjections.map((team) => ({
        id: team.id,
        session_id: session.id,
        name: team.name,
        short_name: team.shortName,
        region: team.region,
        seed: team.seed,
        rating: team.rating,
        offense: team.offense,
        defense: team.defense,
        tempo: team.tempo,
        source: team.source
      }))
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
}

async function createSessionModel(input: CreateSessionInput, refs: ReferenceData) {
  const parsed = createSessionSchema.parse(input);
  const accessMembers = buildAccessMembers(parsed.accessAssignments, refs.platformUsers);
  const dataSource = resolveDataSourceRef(parsed.dataSourceKey, refs.dataSources);
  const projectionFeed = await loadProjectionsFromSource(dataSource, refs.dataSources);
  const timestamp = new Date().toISOString();
  const sessionId = createId("session");
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
    sharedAccessCodeHash: hashSharedCode(parsed.sharedAccessCode),
    sharedAccessCodeLookup: createSharedCodeLookup(parsed.sharedAccessCode),
    sharedAccessCodeCiphertext: encryptSharedCode(parsed.sharedAccessCode),
    accessMembers,
    payoutRules: parsed.payoutRules,
    analysisSettings: normalizeAnalysisSettings(parsed.analysisSettings),
    syndicates,
    baseProjections: projectionFeed.teams,
    projections: projectionFeed.teams,
    projectionOverrides: {},
    projectionProvider: projectionFeed.provider,
    activeDataSource: dataSource,
    finalFourPairings: getDefaultFinalFourPairings(),
    liveState: {
      nominatedTeamId: projectionFeed.teams[0]?.id ?? null,
      currentBid: 0,
      soldTeamIds: [],
      lastUpdatedAt: timestamp
    },
    purchases: [],
    simulationSnapshot: null
  });

  recalculateSessionState(session, parsed.simulationIterations);
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
  session.baseProjections = sortProjections(projectionFeed.teams);
  session.projectionProvider = projectionFeed.provider;
  session.activeDataSource = dataSource;
  session.projectionOverrides = filterOverridesForProjectionSet(
    session.projectionOverrides,
    session.baseProjections
  );
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
  recalculateSessionState(session, session.simulationSnapshot?.iterations);
}

async function applyProjectionImportLegacy(session: StoredAuctionSession, provider: "mock" | "remote") {
  if (session.purchases.length > 0) {
    throw new Error("Cannot replace projections after purchases have been recorded.");
  }

  const projectionFeed = await loadProjectionProvider(provider);
  session.baseProjections = sortProjections(projectionFeed.teams);
  session.projectionProvider = projectionFeed.provider;
  session.activeDataSource = provider === "mock" ? builtinMockSource : session.activeDataSource;
  session.projectionOverrides = filterOverridesForProjectionSet(
    session.projectionOverrides,
    session.baseProjections
  );
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
  recalculateSessionState(session, session.simulationSnapshot?.iterations);
}

function recalculateSessionState(session: StoredAuctionSession, iterations?: number) {
  session.projections = applyProjectionOverrides(
    session.baseProjections,
    session.projectionOverrides
  );
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
}

function applyLiveStatePatch(
  session: StoredAuctionSession,
  patch: { nominatedTeamId?: string | null; currentBid?: number }
) {
  const nextState = {
    ...session.liveState,
    ...patch,
    lastUpdatedAt: new Date().toISOString()
  };

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
    patch.nominatedTeamId !== undefined &&
    patch.nominatedTeamId !== session.liveState.nominatedTeamId &&
    patch.currentBid === undefined
  ) {
    nextState.currentBid = 0;
  }

  session.liveState = nextState;
  session.updatedAt = nextState.lastUpdatedAt;
}

function applyPurchaseMutation(
  session: StoredAuctionSession,
  input: { teamId?: string; buyerSyndicateId: string; price: number }
) {
  if (input.price <= 0) {
    throw new Error("Enter a bid greater than $0 before recording a purchase.");
  }

  const teamId = input.teamId ?? session.liveState.nominatedTeamId;
  if (!teamId) {
    throw new Error("No team is currently nominated.");
  }

  const team = session.projections.find((projection) => projection.id === teamId);
  if (!team) {
    throw new Error("The nominated team is missing from projections.");
  }

  if (session.purchases.some((purchase) => purchase.teamId === teamId)) {
    throw new Error("That team has already been sold.");
  }

  const syndicate = session.syndicates.find(
    (candidate) => candidate.id === input.buyerSyndicateId
  );
  if (!syndicate) {
    throw new Error("Unknown buyer syndicate.");
  }

  if (input.price > syndicate.remainingBankroll) {
    throw new Error("Purchase exceeds the syndicate's remaining bankroll.");
  }

  const createdAt = new Date().toISOString();
  const purchase = {
    id: createId("purchase"),
    sessionId: session.id,
    teamId,
    buyerSyndicateId: syndicate.id,
    price: roundCurrency(input.price),
    createdAt
  };

  session.purchases.push(purchase);
  session.liveState = {
    ...session.liveState,
    currentBid: 0,
    nominatedTeamId: null,
    soldTeamIds: [...session.liveState.soldTeamIds, teamId],
    lastUpdatedAt: createdAt
  };
  session.syndicates = recalculateSyndicateValues(session);
  session.updatedAt = createdAt;
  return purchase;
}

function applyPayoutRulesMutation(session: StoredAuctionSession, payoutRules: PayoutRules) {
  const normalized = normalizePayoutRules(payoutRules);
  const syndicateBudget = deriveSyndicateBudget(
    normalized.projectedPot,
    session.syndicates.length
  );
  const overspentSyndicate = session.syndicates.find(
    (syndicate) => syndicate.spend > syndicateBudget
  );

  if (overspentSyndicate) {
    throw new Error(
      `Projected pot cannot imply a per-syndicate budget lower than ${overspentSyndicate.name}'s existing spend.`
    );
  }

  session.payoutRules = normalized;
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

function recalculateSyndicateValues(session: StoredAuctionSession): Syndicate[] {
  const syndicateBudget = deriveSyndicateBudget(
    session.payoutRules.projectedPot,
    session.syndicates.length
  );
  return session.syndicates.map((syndicate) => {
    const ownedPurchases = session.purchases.filter(
      (purchase) => purchase.buyerSyndicateId === syndicate.id
    );
    const spend = ownedPurchases.reduce((total, purchase) => total + purchase.price, 0);
    const ownedTeamIds = ownedPurchases.map((purchase) => purchase.teamId);
    const portfolioExpectedValue = ownedTeamIds.reduce(
      (total, teamId) =>
        total + (session.simulationSnapshot?.teamResults[teamId]?.expectedGrossPayout ?? 0),
      0
    );

    return {
      ...syndicate,
      spend: roundCurrency(spend),
      remainingBankroll: roundCurrency(syndicateBudget - spend),
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
  const syndicateBudget = deriveSyndicateBudget(projectedPot, selectedCatalogEntries.length);

  const syndicates = selectedCatalogEntries.map((entry) => ({
      id: createId("syn"),
      name: entry.name,
      color: entry.color,
      spend: 0,
      remainingBankroll: syndicateBudget,
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
        deriveSyndicateBudget(session.payoutRules.projectedPot, nextEntries.length),
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
    activeDataSourceName: session.activeDataSource?.name ?? builtinMockSource.name,
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
    currentSharedAccessCode: session.sharedAccessCodeCiphertext
      ? decryptSharedCode(session.sharedAccessCodeCiphertext)
      : null,
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

function normalizeStoreShape(store: SessionStore) {
  return {
    sessions: (store.sessions ?? []).map(normalizeSessionShape),
    platformUsers: (store.platformUsers ?? []).map((user) => ({
      ...user,
      email: user.email.trim().toLowerCase()
    })),
    syndicateCatalog: store.syndicateCatalog ?? [],
    dataSources: store.dataSources ?? [],
    dataImportRuns: store.dataImportRuns ?? [],
    csvAnalysisPortfolios: (store.csvAnalysisPortfolios ?? []).map((portfolio) => ({
      sessionId: String(portfolio.sessionId),
      memberId: String(portfolio.memberId),
      entries: sanitizeCsvPortfolioEntries(portfolio.entries),
      updatedAt: String(portfolio.updatedAt ?? new Date(0).toISOString())
    }))
  };
}

function normalizeSessionShape(session: StoredAuctionSession) {
  const payoutRules = normalizePayoutRules(
    (session.payoutRules ?? {}) as Partial<PayoutRules> & {
      titleGame?: number;
      startingBankroll?: number;
    },
    session.syndicates?.length ?? 0
  );
  const projectionOverrides = session.projectionOverrides ?? {};
  const baseProjections = sortProjections(session.baseProjections ?? session.projections ?? []);
  const projections =
    session.projections && session.baseProjections
      ? sortProjections(session.projections)
      : applyProjectionOverrides(baseProjections, projectionOverrides);

  return {
    ...session,
    eventAccess: {
      sharedCodeConfigured: true
    },
    archivedAt: session.archivedAt ?? null,
    archivedByName: session.archivedByName ?? null,
    archivedByEmail: session.archivedByEmail ?? null,
    sharedAccessCodeHash: session.sharedAccessCodeHash ?? "",
    sharedAccessCodeLookup: session.sharedAccessCodeLookup ?? "",
    sharedAccessCodeCiphertext: session.sharedAccessCodeCiphertext ?? "",
    accessMembers: session.accessMembers ?? [],
    payoutRules,
    analysisSettings: normalizeAnalysisSettings(session.analysisSettings),
    baseProjections,
    projections,
    projectionOverrides,
    activeDataSource: session.activeDataSource ?? builtinMockSource
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
  return {
    targetTeamCount: 8,
    maxSingleTeamPct: 22
  };
}

function normalizeAnalysisSettings(
  analysisSettings: Partial<AnalysisSettings> | undefined
): AnalysisSettings {
  const defaults = defaultAnalysisSettings();

  return {
    targetTeamCount:
      typeof analysisSettings?.targetTeamCount === "number"
        ? clamp(Math.round(analysisSettings.targetTeamCount), 2, 24)
        : defaults.targetTeamCount,
    maxSingleTeamPct:
      typeof analysisSettings?.maxSingleTeamPct === "number"
        ? clamp(analysisSettings.maxSingleTeamPct, 8, 45)
        : defaults.maxSingleTeamPct
  };
}

function deriveSyndicateBudget(projectedPot: number, syndicateCount: number) {
  return roundCurrency(projectedPot / Math.max(1, syndicateCount));
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

function mapSessionSyndicates(rows: Array<Record<string, unknown>> | null | undefined) {
  return (((rows ?? []).map((row) => ({
    id: String(row.id),
    name: String(row.name),
    color: getSyndicateBrandColor(String(row.name)),
    spend: Number(row.spend),
    remainingBankroll: Number(row.remaining_bankroll),
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

function throwOnSupabaseError(
  error: { message?: string; code?: string; details?: string | null } | null
) {
  if (error) {
    if (isSharedCodeLookupConflict(error)) {
      throw new Error(
        "Shared code is already in use by another session. Use a different code, or permanently delete the archived session that already uses it."
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
    (rawText.includes("shared_code_lookup") && rawText.includes("duplicate key value"))
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
