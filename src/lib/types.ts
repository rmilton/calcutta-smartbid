import { z } from "zod";

export const stageSchema = z.enum([
  "roundOf64",
  "roundOf32",
  "sweet16",
  "elite8",
  "finalFour",
  "champion"
]);

export type Stage = z.infer<typeof stageSchema>;
export type Stoplight = "buy" | "caution" | "pass";
export type SessionRole = "admin" | "viewer";
export type AuthScope = "platform" | "session";
export type StorageBackend = "local" | "supabase";
export type DataSourceKind = "csv" | "api";
export type SessionDataSourceKind = "builtin" | DataSourceKind;
export type DataImportStatus = "success" | "failed";
export type BudgetConfidence = "low" | "medium" | "high";
export type FundingStatus = "safe" | "stretch" | "above-plan";

export interface PayoutRules {
  roundOf64: number;
  roundOf32: number;
  sweet16: number;
  elite8: number;
  finalFour: number;
  champion: number;
  projectedPot: number;
}

export interface AnalysisSettings {
  targetTeamCount: number;
  maxSingleTeamPct: number;
}

export interface MothershipFundingModel {
  targetSharePrice: number;
  allowHalfShares: boolean;
  fullSharesSold: number;
  halfSharesSold: number;
  budgetLow: number;
  budgetBase: number;
  budgetStretch: number;
}

export interface MothershipFundingSnapshot extends MothershipFundingModel {
  equivalentShares: number;
  committedCash: number;
  impliedSharePrice: number | null;
  lowBidRoom: number;
  baseBidRoom: number;
  stretchBidRoom: number;
}

export interface Syndicate {
  id: string;
  name: string;
  color: string;
  spend: number;
  remainingBankroll: number;
  estimatedBudget: number;
  budgetConfidence: BudgetConfidence;
  budgetNotes: string;
  estimatedRemainingBudget: number;
  estimateExceeded: boolean;
  ownedTeamIds: string[];
  portfolioExpectedValue: number;
  catalogEntryId?: string | null;
  sessionOnly?: boolean;
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
  scouting?: TeamScoutingProfile;
}

export interface TeamQuadWins {
  q1: number;
  q2: number;
  q3: number;
  q4: number;
}

export interface TeamAtsRecord {
  wins: number;
  losses: number;
  pushes: number;
}

export interface TeamScoutingProfile {
  netRank?: number;
  kenpomRank?: number;
  threePointPct?: number;
  rankedWins?: number;
  quadWins?: TeamQuadWins;
  ats?: TeamAtsRecord;
  offenseStyle?: string;
  defenseStyle?: string;
}

export interface CsvAnalysisPortfolioEntry {
  teamId: string;
  paidPrice: number;
}

export interface CsvAnalysisPortfolio {
  sessionId: string;
  memberId: string;
  entries: CsvAnalysisPortfolioEntry[];
  updatedAt: string;
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

export interface AnalysisRankingRow {
  teamId: string;
  teamName: string;
  shortName: string;
  seed: number;
  region: string;
  compositeScore: number;
  percentile: number;
  scoutingCoverage: number;
  q1Wins: number | null;
  q2Wins: number | null;
  q3Wins: number | null;
  q4Wins: number | null;
  rankedWins: number | null;
  threePointPct: number | null;
  kenpomRank: number | null;
  atsRecord: string | null;
  atsWinPct: number | null;
  offenseStyle: string | null;
  defenseStyle: string | null;
  strengths: string[];
  risks: string[];
}

export interface AnalysisFieldAverages {
  q1Wins: number | null;
  q2Wins: number | null;
  q3Wins: number | null;
  q4Wins: number | null;
  rankedWins: number | null;
  threePointPct: number | null;
  kenpomRank: number | null;
  atsWinPct: number | null;
}

export interface AnalysisBudgetRow {
  teamId: string;
  teamName: string;
  rank: number;
  percentile: number;
  convictionScore: number;
  investableShare: number;
  openingBid: number;
  targetBid: number;
  maxBid: number;
  tier: "core" | "flex" | "depth";
}

export interface AnalysisOwnedTeamSummary {
  teamId: string;
  paidPrice: number;
  targetBid: number | null;
  maxBid: number | null;
}

export interface SessionAnalysisSnapshot {
  ranking: AnalysisRankingRow[];
  fieldAverages: AnalysisFieldAverages;
  budgetRows: AnalysisBudgetRow[];
  ownedTeams: AnalysisOwnedTeamSummary[];
  funding: MothershipFundingSnapshot;
  investableCash: number;
  actualPaidSpend: number;
  remainingBankroll: number;
  targetTeamCount: number;
  maxSingleTeamPct: number;
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

export interface PlatformUser {
  id: string;
  name: string;
  email: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AccessMember {
  id: string;
  platformUserId?: string | null;
  name: string;
  email: string;
  role: SessionRole;
  active: boolean;
  createdAt: string;
}

export interface SyndicateCatalogEntry {
  id: string;
  name: string;
  color: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CsvDataSourceConfig {
  csvContent: string;
  fileName: string | null;
}

export interface ApiDataSourceConfig {
  url: string;
  bearerToken: string;
}

export interface DataSource {
  id: string;
  name: string;
  kind: DataSourceKind;
  active: boolean;
  config: CsvDataSourceConfig | ApiDataSourceConfig;
  createdAt: string;
  updatedAt: string;
  lastTestedAt: string | null;
}

export interface SessionDataSourceRef {
  key: string;
  name: string;
  kind: SessionDataSourceKind;
}

export interface DataImportRun {
  id: string;
  sessionId: string;
  sourceKey: string;
  sourceName: string;
  status: DataImportStatus;
  message: string;
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

export interface SessionLifecycleState {
  archivedAt: string | null;
  archivedByName: string | null;
  archivedByEmail: string | null;
}

export interface AuctionSession {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
  archivedByName: string | null;
  archivedByEmail: string | null;
  focusSyndicateId: string;
  eventAccess: EventAccess;
  payoutRules: PayoutRules;
  analysisSettings: AnalysisSettings;
  mothershipFunding: MothershipFundingModel;
  syndicates: Syndicate[];
  baseProjections: TeamProjection[];
  projections: TeamProjection[];
  projectionOverrides: Record<string, ProjectionOverride>;
  projectionProvider: string;
  activeDataSource: SessionDataSourceRef;
  finalFourPairings: [string, string][];
  liveState: TeamMarketState;
  purchases: PurchaseRecord[];
  simulationSnapshot: SimulationSnapshot | null;
}

export interface StoredAuctionSession extends AuctionSession {
  sharedAccessCodePlaintext: string;
  sharedAccessCodeHash: string;
  sharedAccessCodeLookup: string;
  sharedAccessCodeCiphertext: string;
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
  openingBid: number;
  targetBid: number;
  maxBid: number;
  expectedGrossPayout: number;
  expectedNetValue: number;
  valueGap: number;
  confidenceBand: [number, number];
  stoplight: Stoplight;
  ownershipPenalty: number;
  bankrollHeadroom: number;
  baseBudgetHeadroom: number;
  stretchBudgetHeadroom: number;
  fundingStatus: FundingStatus;
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
  analysis: SessionAnalysisSnapshot;
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
  isArchived: boolean;
  archivedAt: string | null;
  projectionProvider: string;
  activeDataSourceName: string;
  purchaseCount: number;
  syndicateCount: number;
  overrideCount: number;
  adminCount: number;
  viewerCount: number;
}

export interface AdminCenterData {
  sessions: AdminSessionSummary[];
  platformUsers: PlatformUser[];
  syndicateCatalog: SyndicateCatalogEntry[];
  dataSources: DataSource[];
}

export interface SessionAccessAssignmentInput {
  platformUserId: string;
  role: SessionRole;
  active?: boolean;
}

export interface SessionSyndicateInput {
  name: string;
}

export interface SessionAdminConfig {
  session: AuctionSession;
  currentSharedAccessCode: string | null;
  accessMembers: AccessMember[];
  platformUsers: PlatformUser[];
  syndicateCatalog: SyndicateCatalogEntry[];
  dataSources: DataSource[];
  importRuns: DataImportRun[];
}

export interface RemoteProjectionFeed {
  provider: string;
  teams: Array<{
    id: string;
    name: string;
    shortName: string;
    region: string;
    seed: number;
    rating: number;
    offense: number;
    defense: number;
    tempo: number;
  }>;
}

export interface SessionSyndicateFundingInput {
  catalogEntryId: string;
  estimatedBudget?: number | null;
  budgetConfidence: BudgetConfidence;
  budgetNotes: string;
}

export const payoutRulesSchema = z.object({
  roundOf64: z.number().nonnegative(),
  roundOf32: z.number().nonnegative(),
  sweet16: z.number().nonnegative(),
  elite8: z.number().nonnegative(),
  finalFour: z.number().nonnegative(),
  champion: z.number().nonnegative(),
  projectedPot: z.number().positive()
});

export const budgetConfidenceSchema = z.enum(["low", "medium", "high"]);

export const mothershipFundingSchema = z
  .object({
    targetSharePrice: z.number().positive(),
    allowHalfShares: z.boolean().default(true),
    fullSharesSold: z.number().int().nonnegative(),
    halfSharesSold: z.number().int().nonnegative(),
    budgetLow: z.number().nonnegative(),
    budgetBase: z.number().nonnegative(),
    budgetStretch: z.number().nonnegative()
  })
  .superRefine((value, context) => {
    if (value.budgetLow > value.budgetBase) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["budgetLow"],
        message: "Low budget must be less than or equal to base budget."
      });
    }

    if (value.budgetBase > value.budgetStretch) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["budgetStretch"],
        message: "Stretch budget must be greater than or equal to base budget."
      });
    }
  });

export const createPlatformUserSchema = z.object({
  name: z.string().min(2).max(60),
  email: z.string().email(),
  active: z.boolean().default(true)
});

export const updatePlatformUserSchema = createPlatformUserSchema.partial();

export const createSyndicateCatalogSchema = z.object({
  name: z.string().min(2).max(40),
  active: z.boolean().default(true)
});

export const updateSyndicateCatalogSchema = createSyndicateCatalogSchema.partial();

export const createDataSourceSchema = z.discriminatedUnion("kind", [
  z.object({
    name: z.string().min(2).max(80),
    kind: z.literal("csv"),
    active: z.boolean().default(true),
    csvContent: z.string().min(1),
    fileName: z.string().nullable().optional()
  }),
  z.object({
    name: z.string().min(2).max(80),
    kind: z.literal("api"),
    active: z.boolean().default(true),
    url: z.string().url(),
    bearerToken: z.string().optional().default("")
  })
]);

export const updateDataSourceSchema = z
  .object({
    name: z.string().min(2).max(80).optional(),
    active: z.boolean().optional(),
    csvContent: z.string().min(1).optional(),
    fileName: z.string().nullable().optional(),
    url: z.string().url().optional(),
    bearerToken: z.string().optional()
  })
  .refine(
    (value) =>
      Object.keys(value).length > 0,
    "At least one field is required."
  );

export const createSessionSchema = z.object({
  name: z.string().min(3).max(80),
  sharedAccessCode: z.string().min(4).max(64),
  accessAssignments: z
    .array(
      z.object({
        platformUserId: z.string(),
        role: z.enum(["admin", "viewer"])
      })
    )
    .min(1)
    .max(40),
  catalogSyndicateIds: z.array(z.string()).max(16).default([]),
  payoutRules: payoutRulesSchema,
  analysisSettings: z
    .object({
      targetTeamCount: z.number().int().min(2).max(24).default(8),
      maxSingleTeamPct: z.number().min(8).max(45).default(22)
    })
    .default({
      targetTeamCount: 8,
      maxSingleTeamPct: 22
    }),
  dataSourceKey: z.string().default("builtin:mock"),
  simulationIterations: z.number().int().min(1000).max(50000).default(4000)
});

export const runSessionImportSchema = z.object({
  sourceKey: z.string().optional()
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
  rating: z.number().optional(),
  offense: z.number().optional(),
  defense: z.number().optional(),
  tempo: z.number().optional()
});

export const teamQuadWinsSchema = z.object({
  q1: z.number().int().nonnegative(),
  q2: z.number().int().nonnegative(),
  q3: z.number().int().nonnegative(),
  q4: z.number().int().nonnegative()
});

export const teamAtsRecordSchema = z.object({
  wins: z.number().int().nonnegative(),
  losses: z.number().int().nonnegative(),
  pushes: z.number().int().nonnegative()
});

export const teamScoutingProfileSchema = z.object({
  netRank: z.number().int().positive().optional(),
  kenpomRank: z.number().int().positive().optional(),
  threePointPct: z.number().min(0).max(100).optional(),
  rankedWins: z.number().int().nonnegative().optional(),
  quadWins: teamQuadWinsSchema.optional(),
  ats: teamAtsRecordSchema.optional(),
  offenseStyle: z.string().trim().min(2).max(80).optional(),
  defenseStyle: z.string().trim().min(2).max(80).optional()
});

export const csvAnalysisPortfolioEntrySchema = z.object({
  teamId: z.string().min(1),
  paidPrice: z.number().min(0)
});

export const saveCsvAnalysisPortfolioSchema = z.object({
  entries: z.array(csvAnalysisPortfolioEntrySchema).max(200)
});
export const loginSchema = z.object({
  email: z.string().email(),
  sharedCode: z.string().min(4).max(64)
});

export const updateSessionAccessSchema = z.object({
  assignments: z
    .array(
      z.object({
        platformUserId: z.string(),
        role: z.enum(["admin", "viewer"]),
        active: z.boolean().default(true)
      })
    )
    .min(1)
    .max(40)
});

export const importSessionAccessCsvSchema = z.object({
  csvContent: z.string().min(1)
});

export const updateSessionSharedCodeSchema = z.object({
  sharedAccessCode: z.string().min(4).max(64)
});

export const updateSessionSyndicatesSchema = z.object({
  catalogSyndicateIds: z.array(z.string()).max(16).default([]),
  syndicateFunding: z
    .array(
      z.object({
        catalogEntryId: z.string(),
        estimatedBudget: z.number().nonnegative().nullable().optional(),
        budgetConfidence: budgetConfidenceSchema.default("medium"),
        budgetNotes: z.string().max(400).default("")
      })
    )
    .max(16)
    .default([])
});

export const updateSessionDataSourceSchema = z.object({
  sourceKey: z.string()
});

export const updateSessionPayoutRulesSchema = z.object({
  payoutRules: payoutRulesSchema
});

export const updateSessionAnalysisSettingsSchema = z.object({
  analysisSettings: z.object({
    targetTeamCount: z.number().int().min(2).max(24),
    maxSingleTeamPct: z.number().min(8).max(45)
  })
});

export const updateSessionFundingSchema = z.object({
  mothershipFunding: mothershipFundingSchema
});

export const archiveSessionSchema = z.object({
  action: z.literal("archive")
});

export const deleteSessionSchema = z.object({
  confirmationName: z.string().min(1).max(120)
});
