import { getConfiguredMothershipSyndicateName } from "@/lib/config";
import { buildAuctionAssets, findAuctionAssetForPurchase } from "@/lib/auction-assets";
import { buildBracketView, normalizeBracketState } from "@/lib/bracket";
import { buildBidRecommendation, computeOwnershipExposure } from "@/lib/engine/recommendations";
import { getBreakEvenStage } from "@/lib/payouts";
import { buildSessionAnalysisSnapshot } from "@/lib/session-analysis";
import {
  deriveAuctionMatchups,
  deriveProjectedFinalPot,
  filterRecommendationRationale
} from "@/lib/live-room";
import { computeMothershipPortfolioResults } from "@/lib/results";
import {
  AuctionDashboard,
  AuctionSession,
  DashboardAudience,
  StorageBackend,
  StoredAuctionSession,
  ViewerDashboard
} from "@/lib/types";

function requireMothershipPerspective(session: AuctionSession) {
  const persistedFocus =
    session.syndicates.find((syndicate) => syndicate.id === session.focusSyndicateId) ?? null;

  if (persistedFocus) {
    return persistedFocus;
  }

  const mothershipName = getConfiguredMothershipSyndicateName().trim().toLowerCase();
  const mothership =
    session.syndicates.find((syndicate) => syndicate.name.trim().toLowerCase() === mothershipName) ??
    null;

  if (!mothership) {
    throw new Error(
      `${getConfiguredMothershipSyndicateName()} must be included in participating syndicates before opening the live room.`
    );
  }

  return mothership;
}

function sanitizeSessionForClient(session: AuctionSession | StoredAuctionSession): AuctionSession {
  const mothership = requireMothershipPerspective(session);

  return {
    id: session.id,
    name: session.name,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    archivedAt: session.archivedAt,
    archivedByName: session.archivedByName,
    archivedByEmail: null,
    auctionStatus: session.auctionStatus,
    auctionCompletedAt: session.auctionCompletedAt,
    auctionCompletedByName: session.auctionCompletedByName,
    auctionCompletedByEmail: null,
    focusSyndicateId: mothership.id,
    bracketState: normalizeBracketState(session.bracketState),
    eventAccess: session.eventAccess,
    payoutRules: session.payoutRules,
    analysisSettings: session.analysisSettings,
    mothershipFunding: session.mothershipFunding,
    syndicates: session.syndicates,
    baseProjections: session.baseProjections,
    projections: session.projections,
    projectionOverrides: session.projectionOverrides,
    teamClassifications: session.teamClassifications,
    teamNotes: session.teamNotes,
    projectionProvider: session.projectionProvider,
    activeDataSource: session.activeDataSource,
    finalFourPairings: session.finalFourPairings,
    bracketImport: session.bracketImport,
    analysisImport: session.analysisImport,
    importReadiness:
      session.importReadiness ??
      {
        mode: "legacy",
        status: "ready",
        summary: "Using the active data source.",
        issues: [],
        warnings: [],
        hasBracket: false,
        hasAnalysis: false,
        mergedProjectionCount: session.projections.length,
        lastBracketImportAt: null,
        lastAnalysisImportAt: null
      },
    auctionAssets:
      session.auctionAssets ??
      buildAuctionAssets({
        baseProjections: session.baseProjections,
        bracketImport: session.bracketImport
      }),
    liveState: session.liveState,
    purchases: session.purchases,
    simulationSnapshot: session.simulationSnapshot
  };
}

function buildDashboardContext(
  session: AuctionSession | StoredAuctionSession,
  storageBackend: StorageBackend
) {
  const publicSession = sanitizeSessionForClient(session);
  if (
    publicSession.importReadiness.mode === "session-imports" &&
    publicSession.importReadiness.status !== "ready"
  ) {
    throw new Error(publicSession.importReadiness.summary);
  }
  const auctionAssets = publicSession.auctionAssets ?? [];
  const nominatedAsset =
    auctionAssets.find((asset) => asset.id === publicSession.liveState.nominatedAssetId) ?? null;
  const nominatedTeam =
    publicSession.projections.find(
      (projection) => projection.id === (nominatedAsset?.projectionIds[0] ?? publicSession.liveState.nominatedTeamId)
    ) ?? null;
  const soldAssetLookup = new Map(
    publicSession.purchases
      .map((purchase) => {
        const asset = findAuctionAssetForPurchase(auctionAssets, purchase);
        return asset ? ([asset.id, purchase] as const) : null;
      })
      .filter((entry): entry is readonly [string, (typeof publicSession.purchases)[number]] => entry !== null)
  );
  const availableAssets = auctionAssets.filter((asset) => !soldAssetLookup.has(asset.id));
  const soldAssets = publicSession.purchases
    .map((purchase) => {
      const asset = findAuctionAssetForPurchase(auctionAssets, purchase);
      if (!asset) {
        return null;
      }
      return {
        asset,
        price: purchase.price,
        buyerSyndicateId: purchase.buyerSyndicateId
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);
  const soldProjectionIds = new Set(
    publicSession.purchases.flatMap((purchase) => purchase.projectionIds ?? [purchase.teamId])
  );
  const availableTeams = publicSession.projections.filter((projection) => !soldProjectionIds.has(projection.id));
  const soldTeams = publicSession.purchases.flatMap((purchase) => {
    const projectionIds = purchase.projectionIds ?? [purchase.teamId];
    return projectionIds
      .map((projectionId) => {
        const team = publicSession.projections.find((projection) => projection.id === projectionId);
        if (!team) {
          return null;
        }
        return {
          team,
          price: purchase.price,
          buyerSyndicateId: purchase.buyerSyndicateId
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);
  });

  const focusSyndicate = requireMothershipPerspective(publicSession);
  const analysis = buildSessionAnalysisSnapshot(publicSession, focusSyndicate);
  const bracket = buildBracketView(publicSession);
  const recommendation = buildBidRecommendation(
    publicSession,
    nominatedTeam,
    focusSyndicate,
    analysis,
    nominatedAsset
  );
  const portfolioResults =
    publicSession.auctionStatus === "tournament_active"
      ? computeMothershipPortfolioResults(publicSession, bracket, focusSyndicate.id)
      : null;

  return {
    publicSession,
    focusSyndicate,
    nominatedAsset,
    nominatedTeam,
    availableAssets,
    soldAssets,
    availableTeams,
    soldTeams,
    analysis,
    bracket,
    recommendation,
    portfolioResults,
    storageBackend
  };
}

function buildViewerDashboardFromContext(
  context: ReturnType<typeof buildDashboardContext>
): ViewerDashboard {
  const {
    publicSession,
    focusSyndicate,
    nominatedAsset,
    nominatedTeam,
    availableAssets,
    soldAssets,
    analysis,
    bracket,
    recommendation,
    storageBackend
  } = context;
  const ownershipConflicts = computeOwnershipExposure(
    publicSession,
    nominatedAsset?.projectionIds ?? (nominatedTeam ? [nominatedTeam.id] : []),
    focusSyndicate
  ).likelyConflicts;
  const breakEvenStage = nominatedTeam
    ? getBreakEvenStage(publicSession.liveState.currentBid, publicSession.payoutRules)
    : null;
  const matchupSummary = deriveAuctionMatchups({
    bracket,
    snapshot: publicSession.simulationSnapshot,
    nominatedTeam,
    ownedTeamIds: focusSyndicate.ownedTeamIds
  });
  const nominatedTeamClassification =
    (nominatedTeam && publicSession.teamClassifications[nominatedTeam.id]?.classification) || null;
  const nominatedTeamNote =
    (nominatedTeam && publicSession.teamNotes[nominatedTeam.id]?.note) || null;

  return {
    session: {
      id: publicSession.id,
      name: publicSession.name,
      auctionStatus: publicSession.auctionStatus,
      auctionCompletedAt: publicSession.auctionCompletedAt,
      auctionCompletedByName: publicSession.auctionCompletedByName,
      auctionCompletedByEmail: publicSession.auctionCompletedByEmail,
      payoutRules: publicSession.payoutRules,
      projections: publicSession.projections,
      teamClassifications: publicSession.teamClassifications,
      teamNotes: publicSession.teamNotes,
      auctionAssets: publicSession.auctionAssets,
      liveState: publicSession.liveState
    },
    focusSyndicate,
    nominatedAsset,
    nominatedTeam,
    availableAssets,
    soldAssets,
    ledger: publicSession.syndicates,
    bracket,
    portfolioResults: context.portfolioResults,
    viewerAuction: {
      projectedFinalPot: deriveProjectedFinalPot({
        ledger: publicSession.syndicates,
        availableAssets,
        budgetRows: analysis.budgetRows,
        liveAssetId: publicSession.liveState.nominatedAssetId ?? "",
        liveBid: publicSession.liveState.currentBid
      }),
      breakEvenStage,
      filteredRationale: filterRecommendationRationale(
        recommendation?.rationale,
        recommendation?.forcedPassConflictTeamId
      ),
      ownershipConflicts,
      forcedPassConflictTeamId: recommendation?.forcedPassConflictTeamId ?? null,
      matchupSummary,
      nominatedTeamClassification,
      nominatedTeamNote
    },
    storageBackend
  };
}

export function buildDashboard(
  session: AuctionSession | StoredAuctionSession,
  storageBackend: StorageBackend
): AuctionDashboard;
export function buildDashboard(
  session: AuctionSession | StoredAuctionSession,
  storageBackend: StorageBackend,
  options: { audience: "operator" }
): AuctionDashboard;
export function buildDashboard(
  session: AuctionSession | StoredAuctionSession,
  storageBackend: StorageBackend,
  options: { audience: "viewer" }
): ViewerDashboard;
export function buildDashboard(
  session: AuctionSession | StoredAuctionSession,
  storageBackend: StorageBackend,
  options?: { audience?: DashboardAudience }
): AuctionDashboard | ViewerDashboard {
  const context = buildDashboardContext(session, storageBackend);

  if (options?.audience === "viewer") {
    return buildViewerDashboardFromContext(context);
  }

  return {
    session: context.publicSession,
    focusSyndicate: context.focusSyndicate,
    nominatedAsset: context.nominatedAsset,
    nominatedTeam: context.nominatedTeam,
    availableAssets: context.availableAssets,
    soldAssets: context.soldAssets,
    availableTeams: context.availableTeams,
    soldTeams: context.soldTeams,
    ledger: context.publicSession.syndicates,
    analysis: context.analysis,
    bracket: context.bracket,
    recommendation: context.recommendation,
    lastPurchase:
      context.publicSession.purchases[context.publicSession.purchases.length - 1] ?? null,
    projectionOverrideCount: Object.keys(context.publicSession.projectionOverrides).length,
    storageBackend: context.storageBackend,
    portfolioResults: context.portfolioResults
  };
}
