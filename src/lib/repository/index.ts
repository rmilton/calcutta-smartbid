import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { buildDashboard } from "@/lib/dashboard";
import { simulateAuctionField } from "@/lib/engine/simulation";
import { getDefaultFinalFourPairings } from "@/lib/sample-data";
import { applyProjectionOverrides, loadProjectionProvider } from "@/lib/providers/projections";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  AuctionDashboard,
  AuctionSession,
  ProjectionOverride,
  PayoutRules,
  StorageBackend,
  Syndicate,
  TeamProjection,
  createSessionSchema
} from "@/lib/types";
import { createId, roundCurrency } from "@/lib/utils";

interface SessionStore {
  sessions: AuctionSession[];
}

interface CreateSessionInput {
  name: string;
  focusSyndicateName: string;
  syndicates: Array<{ name: string; color?: string }>;
  payoutRules: PayoutRules;
  projectionProvider: "mock" | "remote";
  simulationIterations: number;
}

interface ProjectionOverrideInput {
  rating?: number;
  offense?: number;
  defense?: number;
  tempo?: number;
}

export interface SessionRepository {
  backend: StorageBackend;
  createSession(input: CreateSessionInput): Promise<AuctionSession>;
  getSession(sessionId: string): Promise<AuctionSession | null>;
  getDashboard(sessionId: string): Promise<AuctionDashboard>;
  importProjections(sessionId: string, provider: "mock" | "remote"): Promise<AuctionDashboard>;
  rebuildSimulation(sessionId: string, iterations?: number): Promise<AuctionDashboard>;
  updateLiveState(
    sessionId: string,
    patch: { nominatedTeamId?: string | null; currentBid?: number; likelyBidderIds?: string[] }
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
}

const fallbackColors = [
  "#ff6b57",
  "#0a7ea4",
  "#f1a208",
  "#4b7f52",
  "#7b4fff",
  "#ab3428",
  "#1f6feb",
  "#4a4e69"
];

const storeFile =
  process.env.CALCUTTA_STORE_FILE ?? path.join(os.tmpdir(), "calcutta-smartbid-store.json");

class LocalSessionRepository implements SessionRepository {
  readonly backend = "local" as const;

  async createSession(input: CreateSessionInput) {
    const session = await createSessionModel(input);
    const store = await this.readStore();
    store.sessions.push(session);
    await this.writeStore(store);
    return session;
  }

  async getSession(sessionId: string) {
    const store = await this.readStore();
    return store.sessions.find((session) => session.id === sessionId) ?? null;
  }

  async getDashboard(sessionId: string) {
    const session = await this.requireSession(sessionId);
    return buildDashboard(session, this.backend);
  }

  async importProjections(sessionId: string, provider: "mock" | "remote") {
    const store = await this.readStore();
    const session = findSession(store.sessions, sessionId);
    await applyProjectionImport(session, provider);
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
    patch: { nominatedTeamId?: string | null; currentBid?: number; likelyBidderIds?: string[] }
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
      return {
        sessions: (JSON.parse(content) as SessionStore).sessions.map(normalizeSessionShape)
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return { sessions: [] };
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
    const session = await createSessionModel(input);
    await this.persistFullSession(session);
    return session;
  }

  async getSession(sessionId: string) {
    const client = requireSupabaseClient();
    const [sessionResult, syndicatesResult, projectionsResult, purchasesResult, snapshotResult, overridesResult] =
      await Promise.all([
        client.from("auction_sessions").select("*").eq("id", sessionId).maybeSingle(),
        client.from("syndicates").select("*").eq("session_id", sessionId),
        client.from("team_projections").select("*").eq("session_id", sessionId),
        client.from("purchase_records").select("*").eq("session_id", sessionId).order("created_at", { ascending: true }),
        client
          .from("simulation_snapshots")
          .select("*")
          .eq("session_id", sessionId)
          .order("generated_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        client.from("projection_overrides").select("*").eq("session_id", sessionId)
      ]);

    throwOnSupabaseError(sessionResult.error);
    throwOnSupabaseError(syndicatesResult.error);
    throwOnSupabaseError(projectionsResult.error);
    throwOnSupabaseError(purchasesResult.error);
    throwOnSupabaseError(snapshotResult.error);
    throwOnSupabaseError(overridesResult.error);

    if (!sessionResult.data) {
      return null;
    }

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

    const session = normalizeSessionShape({
      id: String(sessionResult.data.id),
      name: String(sessionResult.data.name),
      createdAt: String(sessionResult.data.created_at),
      updatedAt: String(sessionResult.data.updated_at),
      focusSyndicateId: String(sessionResult.data.focus_syndicate_id),
      eventAccess: {
        operatorPasscode: String(sessionResult.data.operator_passcode),
        viewerPasscode: String(sessionResult.data.viewer_passcode)
      },
      payoutRules: sessionResult.data.payout_rules as PayoutRules,
      syndicates: (((syndicatesResult.data as Array<Record<string, unknown>> | null) ?? []).map((row) => ({
        id: String(row.id),
        name: String(row.name),
        color: String(row.color),
        spend: Number(row.spend),
        remainingBankroll: Number(row.remaining_bankroll),
        ownedTeamIds: (row.owned_team_ids as string[]) ?? [],
        portfolioExpectedValue: Number(row.portfolio_expected_value)
      })) as Syndicate[]),
      baseProjections,
      projections: applyProjectionOverrides(baseProjections, overrides),
      projectionOverrides: overrides,
      projectionProvider: String(sessionResult.data.projection_provider),
      finalFourPairings: sessionResult.data.final_four_pairings as [string, string][],
      liveState: sessionResult.data.live_state as AuctionSession["liveState"],
      purchases: (((purchasesResult.data as Array<Record<string, unknown>> | null) ?? []).map((row) => ({
        id: String(row.id),
        sessionId: String(row.session_id),
        teamId: String(row.team_id),
        buyerSyndicateId: String(row.buyer_syndicate_id),
        price: Number(row.price),
        createdAt: String(row.created_at)
      })) as AuctionSession["purchases"]),
      simulationSnapshot: (snapshotResult.data?.payload as AuctionSession["simulationSnapshot"]) ?? null
    });

    return session;
  }

  async getDashboard(sessionId: string) {
    const session = await this.requireSession(sessionId);
    return buildDashboard(session, this.backend);
  }

  async importProjections(sessionId: string, provider: "mock" | "remote") {
    const session = await this.requireSession(sessionId);
    await applyProjectionImport(session, provider);
    await this.persistFullSession(session);
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
    patch: { nominatedTeamId?: string | null; currentBid?: number; likelyBidderIds?: string[] }
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

  private async requireSession(sessionId: string) {
    const session = await this.getSession(sessionId);
    if (!session) {
      throw new Error("Auction session not found.");
    }
    return session;
  }

  private async persistFullSession(session: AuctionSession) {
    const client = requireSupabaseClient();

    const upsertSessionResult = await client.from("auction_sessions").upsert({
      id: session.id,
      name: session.name,
      focus_syndicate_id: session.focusSyndicateId,
      operator_passcode: session.eventAccess.operatorPasscode,
      viewer_passcode: session.eventAccess.viewerPasscode,
      payout_rules: session.payoutRules,
      projection_provider: session.projectionProvider,
      final_four_pairings: session.finalFourPairings,
      live_state: session.liveState,
      created_at: session.createdAt,
      updated_at: session.updatedAt
    });
    throwOnSupabaseError(upsertSessionResult.error);

    await replaceRows(client, "syndicates", "session_id", session.id, session.syndicates.map((syndicate) => ({
      id: syndicate.id,
      session_id: session.id,
      name: syndicate.name,
      color: syndicate.color,
      spend: syndicate.spend,
      remaining_bankroll: syndicate.remainingBankroll,
      owned_team_ids: syndicate.ownedTeamIds,
      portfolio_expected_value: syndicate.portfolioExpectedValue
    })));

    await replaceRows(client, "team_projections", "session_id", session.id, session.baseProjections.map((team) => ({
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
    })));

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

    await replaceRows(client, "purchase_records", "session_id", session.id, session.purchases.map((purchase) => ({
      id: purchase.id,
      session_id: session.id,
      team_id: purchase.teamId,
      buyer_syndicate_id: purchase.buyerSyndicateId,
      price: purchase.price,
      created_at: purchase.createdAt
    })));

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

  private async persistDerivedState(session: AuctionSession) {
    const client = requireSupabaseClient();
    const sessionUpdate = await client
      .from("auction_sessions")
      .update({
        updated_at: session.updatedAt
      })
      .eq("id", session.id);
    throwOnSupabaseError(sessionUpdate.error);

    await replaceRows(client, "syndicates", "session_id", session.id, session.syndicates.map((syndicate) => ({
      id: syndicate.id,
      session_id: session.id,
      name: syndicate.name,
      color: syndicate.color,
      spend: syndicate.spend,
      remaining_bankroll: syndicate.remainingBankroll,
      owned_team_ids: syndicate.ownedTeamIds,
      portfolio_expected_value: syndicate.portfolioExpectedValue
    })));

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
    session: AuctionSession,
    teamId: string,
    cleared = false
  ) {
    const client = requireSupabaseClient();
    const team = session.baseProjections.find((projection) => projection.id === teamId);
    if (!team) {
      throw new Error("Cannot persist override for unknown team.");
    }

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

    const teamResult = await client
      .from("team_projections")
      .update({
        rating: team.rating,
        offense: team.offense,
        defense: team.defense,
        tempo: team.tempo,
        source: team.source
      })
      .eq("session_id", session.id)
      .eq("id", team.id);
    throwOnSupabaseError(teamResult.error);

    await this.persistDerivedState(session);
  }
}

async function createSessionModel(input: CreateSessionInput) {
  const parsed = createSessionSchema.parse(input);
  const uniqueSyndicates = ensureUniqueSyndicateNames(parsed.syndicates.map((item) => item.name));
  const projectionFeed = await loadProjectionProvider(parsed.projectionProvider);
  const timestamp = new Date().toISOString();
  const sessionId = createId("session");
  const focusName = parsed.focusSyndicateName.trim().toLowerCase();
  const syndicates = uniqueSyndicates.map((name, index) => ({
    id: createId("syn"),
    name,
    color: parsed.syndicates[index]?.color ?? fallbackColors[index % fallbackColors.length],
    spend: 0,
    remainingBankroll: parsed.payoutRules.startingBankroll,
    ownedTeamIds: [],
    portfolioExpectedValue: 0
  }));
  const focusSyndicate =
    syndicates.find((syndicate) => syndicate.name.toLowerCase() === focusName) ?? syndicates[0];

  const session: AuctionSession = normalizeSessionShape({
    id: sessionId,
    name: parsed.name,
    createdAt: timestamp,
    updatedAt: timestamp,
    focusSyndicateId: focusSyndicate.id,
    eventAccess: {
      operatorPasscode: generatePasscode(),
      viewerPasscode: generatePasscode()
    },
    payoutRules: parsed.payoutRules,
    syndicates,
    baseProjections: projectionFeed.teams,
    projections: projectionFeed.teams,
    projectionOverrides: {},
    projectionProvider: projectionFeed.provider,
    finalFourPairings: getDefaultFinalFourPairings(),
    liveState: {
      nominatedTeamId: projectionFeed.teams[0]?.id ?? null,
      currentBid: 0,
      likelyBidderIds: [],
      soldTeamIds: [],
      lastUpdatedAt: timestamp
    },
    purchases: [],
    simulationSnapshot: null
  });

  recalculateSessionState(session, parsed.simulationIterations);
  return session;
}

async function applyProjectionImport(session: AuctionSession, provider: "mock" | "remote") {
  if (session.purchases.length > 0) {
    throw new Error("Cannot replace projections after purchases have been recorded.");
  }

  const projectionFeed = await loadProjectionProvider(provider);
  session.baseProjections = sortProjections(projectionFeed.teams);
  session.projectionProvider = projectionFeed.provider;
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
    likelyBidderIds: [],
    soldTeamIds: [],
    lastUpdatedAt: new Date().toISOString()
  };
  recalculateSessionState(session, session.simulationSnapshot?.iterations);
}

function recalculateSessionState(session: AuctionSession, iterations?: number) {
  session.projections = applyProjectionOverrides(session.baseProjections, session.projectionOverrides);
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
  session: AuctionSession,
  patch: { nominatedTeamId?: string | null; currentBid?: number; likelyBidderIds?: string[] }
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

  const validBidderIds = new Set(session.syndicates.map((syndicate) => syndicate.id));
  if (nextState.likelyBidderIds.some((syndicateId) => !validBidderIds.has(syndicateId))) {
    throw new Error("Live state includes an unknown syndicate.");
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
  session: AuctionSession,
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
    likelyBidderIds: [],
    soldTeamIds: [...session.liveState.soldTeamIds, teamId],
    lastUpdatedAt: createdAt
  };
  session.syndicates = recalculateSyndicateValues(session);
  session.updatedAt = createdAt;
  return purchase;
}

function applyProjectionOverrideMutation(
  session: AuctionSession,
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

function clearProjectionOverrideMutation(session: AuctionSession, teamId: string) {
  if (!session.baseProjections.some((projection) => projection.id === teamId)) {
    throw new Error("Projection override team not found.");
  }

  delete session.projectionOverrides[teamId];
  recalculateSessionState(session, session.simulationSnapshot?.iterations);
}

function recalculateSyndicateValues(session: AuctionSession): Syndicate[] {
  return session.syndicates.map((syndicate) => {
    const ownedPurchases = session.purchases.filter(
      (purchase) => purchase.buyerSyndicateId === syndicate.id
    );
    const spend = ownedPurchases.reduce((total, purchase) => total + purchase.price, 0);
    const ownedTeamIds = ownedPurchases.map((purchase) => purchase.teamId);
    const portfolioExpectedValue = ownedTeamIds.reduce(
      (total, teamId) =>
        total +
        (session.simulationSnapshot?.teamResults[teamId]?.expectedGrossPayout ?? 0),
      0
    );

    return {
      ...syndicate,
      spend: roundCurrency(spend),
      remainingBankroll: roundCurrency(session.payoutRules.startingBankroll - spend),
      ownedTeamIds,
      portfolioExpectedValue: roundCurrency(portfolioExpectedValue)
    };
  });
}

function findSession(sessions: AuctionSession[], sessionId: string) {
  const session = sessions.find((candidate) => candidate.id === sessionId);
  if (!session) {
    throw new Error("Auction session not found.");
  }
  return session;
}

function ensureUniqueSyndicateNames(names: string[]) {
  const cleaned = names.map((name) => name.trim()).filter(Boolean);
  const duplicates = cleaned.filter(
    (name, index) =>
      cleaned.findIndex(
        (candidate) => candidate.toLowerCase() === name.toLowerCase()
      ) !== index
  );
  if (duplicates.length > 0) {
    throw new Error("Duplicate syndicate names are not allowed.");
  }
  return cleaned;
}

function generatePasscode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function sortProjections(projections: TeamProjection[]) {
  return [...projections].sort((left, right) => {
    if (left.region === right.region) {
      return left.seed - right.seed;
    }
    return left.region.localeCompare(right.region);
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

function normalizeSessionShape(session: AuctionSession) {
  const projectionOverrides = session.projectionOverrides ?? {};
  const baseProjections = sortProjections(
    session.baseProjections ?? session.projections ?? []
  );
  const projections =
    session.projections && session.baseProjections
      ? sortProjections(session.projections)
      : applyProjectionOverrides(baseProjections, projectionOverrides);

  return {
    ...session,
    baseProjections,
    projections,
    projectionOverrides
  };
}

function getRequestedBackend(): StorageBackend {
  return process.env.CALCUTTA_STORAGE_BACKEND === "supabase"
    ? "supabase"
    : "local";
}

function requireSupabaseClient() {
  const client = createServerSupabaseClient();
  if (!client) {
    throw new Error(
      "Supabase backend requested, but NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are not configured."
    );
  }
  return client;
}

async function replaceRows(
  client: ReturnType<typeof createServerSupabaseClient>,
  table: string,
  key: string,
  value: string,
  rows: Record<string, unknown>[]
) {
  const deleteResult = await client!.from(table).delete().eq(key, value);
  throwOnSupabaseError(deleteResult.error);

  if (rows.length > 0) {
    const insertResult = await client!.from(table).insert(rows);
    throwOnSupabaseError(insertResult.error);
  }
}

function throwOnSupabaseError(error: { message?: string } | null) {
  if (error) {
    throw new Error(error.message ?? "Supabase request failed.");
  }
}

function numberOrUndefined(value: unknown) {
  if (value === null || value === undefined) {
    return undefined;
  }
  return Number(value);
}

const localRepository = new LocalSessionRepository();

export function getSessionRepository(): SessionRepository {
  return getRequestedBackend() === "supabase"
    ? new SupabaseSessionRepository()
    : localRepository;
}
