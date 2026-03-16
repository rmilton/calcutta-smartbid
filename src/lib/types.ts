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
export type DataSourcePurpose = "bracket" | "analysis";
export type SessionDataSourceKind = "builtin" | DataSourceKind;
export type DataImportStatus = "success" | "failed";
export type BudgetConfidence = "low" | "medium" | "high";
export type FundingStatus = "safe" | "stretch" | "above-plan";
export type BracketRoundKey =
  | "roundOf64"
  | "roundOf32"
  | "sweet16"
  | "elite8"
  | "finalFour"
  | "championship";
export type SessionImportMode = "legacy" | "session-imports";
export type SessionImportStatus = "ready" | "attention";
export type SessionPresenceView = "auction" | "analysis" | "bracket" | "overrides";
export type TeamClassificationValue =
  | "must-have"
  | "love-at-right-price"
  | "caution"
  | "nuclear-disaster";
export type AuctionAssetType = "single_team" | "play_in_slot" | "seed_bundle";
export type AuctionAssetMemberType = "team" | "play_in_slot";

export interface PayoutRules {
  roundOf64: number;
  roundOf32: number;
  sweet16: number;
  elite8: number;
  finalFour: number;
  champion: number;
  projectedPot: number;
}

export type AnalysisSettings = Record<string, never>;

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

export interface BracketImportTeam {
  id: string;
  name: string;
  shortName: string;
  region: string;
  seed: number;
  regionSlot: string;
  site: string | null;
  subregion: string | null;
  isPlayIn: boolean;
  playInGroup: string | null;
  playInSeed: number | null;
}

export interface SessionBracketImport {
  sourceName: string;
  fileName: string | null;
  importedAt: string;
  teamCount: number;
  teams: BracketImportTeam[];
}

export interface AnalysisImportTeam {
  teamId: string | null;
  name: string;
  shortName: string;
  rating: number;
  offense: number;
  defense: number;
  tempo: number;
  scouting?: TeamScoutingProfile;
}

export interface SessionAnalysisImport {
  sourceName: string;
  fileName: string | null;
  importedAt: string;
  teamCount: number;
  teams: AnalysisImportTeam[];
}

export interface SessionImportReadiness {
  mode: SessionImportMode;
  status: SessionImportStatus;
  summary: string;
  issues: string[];
  warnings: string[];
  hasBracket: boolean;
  hasAnalysis: boolean;
  mergedProjectionCount: number;
  lastBracketImportAt: string | null;
  lastAnalysisImportAt: string | null;
}

export interface AuctionAssetMember {
  id: string;
  type: AuctionAssetMemberType;
  label: string;
  region: string;
  seed: number;
  regionSlot: string | null;
  teamIds: string[];
  projectionIds: string[];
  unresolved: boolean;
}

export interface AuctionAsset {
  id: string;
  label: string;
  type: AuctionAssetType;
  region: string;
  seed: number | null;
  seedRange: [number, number] | null;
  memberTeamIds: string[];
  projectionIds: string[];
  members: AuctionAssetMember[];
  unresolved: boolean;
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

export interface TeamClassificationTag {
  teamId: string;
  classification: TeamClassificationValue;
  updatedAt: string;
}

export interface TeamNoteTag {
  teamId: string;
  note: string;
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
  classification: TeamClassificationValue | null;
  note: string | null;
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
  classification: TeamClassificationValue | null;
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
  nominatedAssetId?: string | null;
  nominatedTeamId: string | null;
  soldAssetIds?: string[];
  currentBid: number;
  soldTeamIds: string[];
  lastUpdatedAt: string;
}

export interface BracketState {
  winnersByGameId: Record<string, string | null>;
}

export interface BracketGameTeam {
  teamId: string;
  name: string;
  shortName: string;
  seed: number;
  region: string;
  buyerSyndicateId: string | null;
  buyerSyndicateName: string | null;
  buyerColor: string | null;
}

export interface BracketGame {
  id: string;
  round: BracketRoundKey;
  label: string;
  region: string | null;
  slot: number;
  sourceGameIds: [string | null, string | null];
  entrants: [BracketGameTeam | null, BracketGameTeam | null];
  winnerTeamId: string | null;
}

export interface BracketRound {
  key: BracketRoundKey;
  label: string;
  region: string | null;
  games: BracketGame[];
}

export interface BracketRegion {
  name: string;
  rounds: BracketRound[];
}

export interface BracketViewModel {
  isSupported: boolean;
  unsupportedReason: string | null;
  regions: BracketRegion[];
  finals: BracketRound[];
}

export interface PurchaseRecord {
  id: string;
  sessionId: string;
  teamId: string;
  assetId?: string;
  assetLabel?: string;
  projectionIds?: string[];
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

export interface SessionViewerPresence {
  sessionId: string;
  memberId: string;
  currentView: SessionPresenceView;
  lastSeenAt: string;
}

export interface ActiveSessionViewer {
  memberId: string;
  name: string;
  email: string;
  role: SessionRole;
  currentView: SessionPresenceView;
  lastSeenAt: string;
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
  purpose: DataSourcePurpose;
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
  teamClassifications: Record<string, TeamClassificationTag>;
  teamNotes: Record<string, TeamNoteTag>;
  projectionProvider: string;
  activeDataSource: SessionDataSourceRef;
  finalFourPairings: [string, string][];
  bracketImport: SessionBracketImport | null;
  analysisImport: SessionAnalysisImport | null;
  importReadiness: SessionImportReadiness;
  auctionAssets?: AuctionAsset[];
  liveState: TeamMarketState;
  bracketState: BracketState;
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
  assetId?: string;
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
  forcedPassConflictTeamId: string | null;
  forcedPassReason: string | null;
  drivers: RecommendationDriver[];
  rationale: string[];
}

export interface SoldTeamSummary {
  team: TeamProjection;
  price: number;
  buyerSyndicateId: string;
}

export interface SoldAssetSummary {
  asset: AuctionAsset;
  price: number;
  buyerSyndicateId: string;
}

export interface AuctionDashboard {
  session: AuctionSession;
  focusSyndicate: Syndicate;
  nominatedAsset: AuctionAsset | null;
  nominatedTeam: TeamProjection | null;
  availableAssets: AuctionAsset[];
  soldAssets: SoldAssetSummary[];
  availableTeams: TeamProjection[];
  soldTeams: SoldTeamSummary[];
  ledger: Syndicate[];
  analysis: SessionAnalysisSnapshot;
  bracket: BracketViewModel;
  recommendation: BidRecommendation | null;
  lastPurchase: PurchaseRecord | null;
  projectionOverrideCount: number;
  storageBackend: StorageBackend;
}

export interface SessionImportResult {
  config: SessionAdminConfig;
  readiness: SessionImportReadiness;
}

export interface AdminSessionSummary {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  isArchived: boolean;
  archivedAt: string | null;
  projectionProvider: string;
  bracketSourceName: string | null;
  analysisSourceName: string | null;
  importReadinessStatus: SessionImportStatus;
  importReadinessSummary: string;
  purchaseCount: number;
  syndicateCount: number;
  overrideCount: number;
  adminCount: number;
  viewerCount: number;
  activeViewerCount: number;
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
  activeViewers: ActiveSessionViewer[];
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

export const createDataSourceSchema = z.object({
  name: z.string().min(2).max(80),
  kind: z.literal("csv").default("csv"),
  purpose: z.enum(["bracket", "analysis"]),
  active: z.boolean().default(true),
  csvContent: z.string().min(1),
  fileName: z.string().nullable().optional()
});

export const updateDataSourceSchema = z
  .object({
    name: z.string().min(2).max(80).optional(),
    active: z.boolean().optional(),
    csvContent: z.string().min(1).optional(),
    fileName: z.string().nullable().optional()
  })
  .refine(
    (value) =>
      Object.keys(value).length > 0,
    "At least one field is required."
  );

export const sessionSourceSelectionSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("saved-source"),
    sourceKey: z.string()
  }),
  z.object({
    mode: z.literal("upload"),
    sourceName: z.string().min(2).max(120),
    fileName: z.string().nullable().optional(),
    csvContent: z.string().min(1)
  })
]);

export type SessionSourceSelection = z.infer<typeof sessionSourceSelectionSchema>;

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
  analysisSettings: z.object({}).default({}),
  bracketSelection: sessionSourceSelectionSchema.optional(),
  analysisSelection: sessionSourceSelectionSchema.optional(),
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
  nominatedAssetId: z.string().nullable().optional(),
  nominatedTeamId: z.string().nullable().optional(),
  currentBid: z.number().nonnegative().optional()
});

export const updateBracketGameSchema = z.object({
  winnerTeamId: z.string().nullable()
});

export const createPurchaseSchema = z.object({
  assetId: z.string().optional(),
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

export const teamClassificationValueSchema = z.enum([
  "must-have",
  "love-at-right-price",
  "caution",
  "nuclear-disaster"
]);

export const saveTeamClassificationSchema = z.object({
  classification: teamClassificationValueSchema
});

export const saveTeamNoteSchema = z.object({
  note: z
    .string()
    .trim()
    .min(1, "Team note is required.")
    .max(80, "Team note must be 80 characters or fewer.")
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

export const sessionPresenceHeartbeatSchema = z.object({
  currentView: z.enum(["auction", "analysis", "bracket", "overrides"])
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

export const importSessionBracketSchema = z.object({
  selection: sessionSourceSelectionSchema
});

export const importSessionAnalysisSchema = z.object({
  selection: sessionSourceSelectionSchema
});

export const updateSessionPayoutRulesSchema = z.object({
  payoutRules: payoutRulesSchema
});

export const updateSessionAnalysisSettingsSchema = z.object({
  analysisSettings: z.object({}).default({})
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
