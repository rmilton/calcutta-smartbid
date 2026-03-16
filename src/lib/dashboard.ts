import { getConfiguredMothershipSyndicateName } from "@/lib/config";
import { buildAuctionAssets } from "@/lib/auction-assets";
import { buildBracketView, normalizeBracketState } from "@/lib/bracket";
import { buildBidRecommendation } from "@/lib/engine/recommendations";
import { buildSessionAnalysisSnapshot } from "@/lib/session-analysis";
import { AuctionDashboard, AuctionSession, StorageBackend, StoredAuctionSession } from "@/lib/types";

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

export function buildDashboard(session: AuctionSession | StoredAuctionSession, storageBackend: StorageBackend): AuctionDashboard {
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
    publicSession.purchases.map((purchase) => [purchase.assetId ?? purchase.teamId, purchase])
  );
  const availableAssets = auctionAssets.filter((asset) => !soldAssetLookup.has(asset.id));
  const soldAssets = publicSession.purchases
    .map((purchase) => {
      const asset = auctionAssets.find((candidate) => candidate.id === (purchase.assetId ?? purchase.teamId));
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

  return {
    session: publicSession,
    focusSyndicate,
    nominatedAsset,
    nominatedTeam,
    availableAssets,
    soldAssets,
    availableTeams,
    soldTeams,
    ledger: publicSession.syndicates,
    analysis,
    bracket: buildBracketView(publicSession),
    recommendation: buildBidRecommendation(
      publicSession,
      nominatedTeam,
      focusSyndicate,
      analysis,
      nominatedAsset
    ),
    lastPurchase: publicSession.purchases[publicSession.purchases.length - 1] ?? null,
    projectionOverrideCount: Object.keys(publicSession.projectionOverrides).length,
    storageBackend
  };
}
