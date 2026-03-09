import { z } from "zod";

export const stageSchema = z.enum([
  "sweet16",
  "elite8",
  "finalFour",
  "titleGame",
  "champion"
]);

export type Stage = z.infer<typeof stageSchema>;
export type Stoplight = "buy" | "caution" | "pass";
export type SessionRole = "admin" | "viewer";
export type AuthScope = "platform" | "session";
export type StorageBackend = "local" | "supabase";

export interface PayoutRules {
  sweet16: number;
  elite8: number;
  finalFour: number;
  titleGame: number;
  champion: number;
  houseTakePct: number;
  startingBankroll: number;
}

export interface Syndicate {
  id: string;
  name: string;
  color: string;
  spend: number;
  remainingBankroll: number;
  ownedTeamIds: string[];
  portfolioExpectedValue: number;
}

export interface TeamProjection {
  id: string;
  name: string;
  shortName: string;
  region: string;
  seed: number;
  rating: number;
  offense: number;
  defense: number;
  tempo: number;
  source: string;
}

export interface ProjectionOverride {
  teamId: string;
  rating?: number;
  offense?: number;
  defense?: number;
  tempo?: number;
  updatedAt: string;
}

export type TeamRoundProbabilities = Record<Stage, number>;

export interface MatchupConflict {
  opponentId: string;
  probability: number;
  earliestRound: Stage;
}

export interface OwnershipExposure {
  overlapScore: number;
  concentrationScore: number;
  likelyConflicts: MatchupConflict[];
}

export interface TeamSimulationResult {
  teamId: string;
  roundProbabilities: TeamRoundProbabilities;
  expectedGrossPayout: number;
  confidenceBand: [number, number];
  likelyConflicts: MatchupConflict[];
}

export interface SimulationSnapshot {
  id: string;
  sessionId: string;
  provider: string;
  iterations: number;
  generatedAt: string;
  teamResults: Record<string, TeamSimulationResult>;
  matchupMatrix: Record<string, Record<string, number>>;
}

export interface TeamMarketState {
  nominatedTeamId: string | null;
  currentBid: number;
  soldTeamIds: string[];
  lastUpdatedAt: string;
}

export interface PurchaseRecord {
  id: string;
  sessionId: string;
  teamId: string;
  buyerSyndicateId: string;
  price: number;
  createdAt: string;
}

export interface EventAccess {
  sharedCodeConfigured: boolean;
}

export interface AccessMember {
  id: string;
  name: string;
  email: string;
  role: SessionRole;
  active: boolean;
  createdAt: string;
}

export interface AuthenticatedMember {
  scope: AuthScope;
  sessionId: string | null;
  memberId: string | null;
  name: string;
  email: string;
  role: "admin" | SessionRole;
}

export interface AuctionSession {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  focusSyndicateId: string;
  eventAccess: EventAccess;
  payoutRules: PayoutRules;
  syndicates: Syndicate[];
  baseProjections: TeamProjection[];
  projections: TeamProjection[];
  projectionOverrides: Record<string, ProjectionOverride>;
  projectionProvider: string;
  finalFourPairings: [string, string][];
  liveState: TeamMarketState;
  purchases: PurchaseRecord[];
  simulationSnapshot: SimulationSnapshot | null;
}

export interface StoredAuctionSession extends AuctionSession {
  sharedAccessCodeHash: string;
  sharedAccessCodeLookup: string;
  accessMembers: AccessMember[];
}

export interface RecommendationDriver {
  label: string;
  value: string;
  tone: "positive" | "neutral" | "negative";
}

export interface BidRecommendation {
  teamId: string;
  currentBid: number;
  recommendedMaxBid: number;
  expectedGrossPayout: number;
  expectedNetValue: number;
  valueGap: number;
  confidenceBand: [number, number];
  stoplight: Stoplight;
  ownershipPenalty: number;
  bankrollHeadroom: number;
  concentrationScore: number;
  drivers: RecommendationDriver[];
  rationale: string[];
}

export interface SoldTeamSummary {
  team: TeamProjection;
  price: number;
  buyerSyndicateId: string;
}

export interface AuctionDashboard {
  session: AuctionSession;
  focusSyndicate: Syndicate;
  nominatedTeam: TeamProjection | null;
  availableTeams: TeamProjection[];
  soldTeams: SoldTeamSummary[];
  ledger: Syndicate[];
  recommendation: BidRecommendation | null;
  lastPurchase: PurchaseRecord | null;
  projectionOverrideCount: number;
  storageBackend: StorageBackend;
}

export interface AdminSessionSummary {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  projectionProvider: string;
  purchaseCount: number;
  syndicateCount: number;
  overrideCount: number;
  adminCount: number;
  viewerCount: number;
}

export const payoutRulesSchema = z.object({
  sweet16: z.number().nonnegative(),
  elite8: z.number().nonnegative(),
  finalFour: z.number().nonnegative(),
  titleGame: z.number().nonnegative(),
  champion: z.number().nonnegative(),
  houseTakePct: z.number().min(0).max(100),
  startingBankroll: z.number().positive()
});

export const createSessionSchema = z.object({
  name: z.string().min(3).max(80),
  focusSyndicateName: z.string().min(2).max(40),
  sharedAccessCode: z.string().min(4).max(64),
  accessMembers: z
    .array(
      z.object({
        name: z.string().min(2).max(60),
        email: z.string().email(),
        role: z.enum(["admin", "viewer"])
      })
    )
    .min(1)
    .max(40),
  syndicates: z
    .array(
      z.object({
        name: z.string().min(2).max(40),
        color: z.string().optional()
      })
    )
    .min(2)
    .max(16),
  payoutRules: payoutRulesSchema,
  projectionProvider: z.enum(["mock", "remote"]).default("mock"),
  simulationIterations: z.number().int().min(1000).max(50000).default(4000)
});

export const importProjectionsSchema = z.object({
  provider: z.enum(["mock", "remote"]).default("mock")
});

export const rebuildSimulationSchema = z.object({
  iterations: z.number().int().min(1000).max(50000).optional()
});

export const updateLiveStateSchema = z.object({
  nominatedTeamId: z.string().nullable().optional(),
  currentBid: z.number().nonnegative().optional()
});

export const createPurchaseSchema = z.object({
  teamId: z.string().optional(),
  buyerSyndicateId: z.string(),
  price: z.number().positive()
});

export const saveProjectionOverrideSchema = z.object({
  rating: z.number().positive().optional(),
  offense: z.number().positive().optional(),
  defense: z.number().positive().optional(),
  tempo: z.number().positive().optional()
});

export const loginSchema = z.object({
  email: z.string().email(),
  sharedCode: z.string().min(4).max(64)
});

export interface RemoteProjectionFeed {
  provider: string;
  teams: TeamProjection[];
}
