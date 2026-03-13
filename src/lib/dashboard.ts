import { getConfiguredMothershipSyndicateName } from "@/lib/config";
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
    eventAccess: session.eventAccess,
    payoutRules: session.payoutRules,
    analysisSettings: session.analysisSettings,
    mothershipFunding: session.mothershipFunding,
    syndicates: session.syndicates,
    baseProjections: session.baseProjections,
    projections: session.projections,
    projectionOverrides: session.projectionOverrides,
    projectionProvider: session.projectionProvider,
    activeDataSource: session.activeDataSource,
    finalFourPairings: session.finalFourPairings,
    liveState: session.liveState,
    purchases: session.purchases,
    simulationSnapshot: session.simulationSnapshot
  };
}

export function buildDashboard(session: AuctionSession | StoredAuctionSession, storageBackend: StorageBackend): AuctionDashboard {
  const publicSession = sanitizeSessionForClient(session);
  const nominatedTeam = publicSession.projections.find((projection) => projection.id === publicSession.liveState.nominatedTeamId) ?? null;
  const soldLookup = new Map(publicSession.purchases.map((purchase) => [purchase.teamId, purchase]));
  const availableTeams = publicSession.projections.filter((projection) => !soldLookup.has(projection.id));
  const soldTeams = publicSession.purchases
    .map((purchase) => {
      const team = publicSession.projections.find((projection) => projection.id === purchase.teamId);
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

  const focusSyndicate = requireMothershipPerspective(publicSession);
  const analysis = buildSessionAnalysisSnapshot(publicSession, focusSyndicate);

  return {
    session: publicSession,
    focusSyndicate,
    nominatedTeam,
    availableTeams,
    soldTeams,
    ledger: publicSession.syndicates,
    analysis,
    recommendation: buildBidRecommendation(publicSession, nominatedTeam, focusSyndicate, analysis),
    lastPurchase: publicSession.purchases[publicSession.purchases.length - 1] ?? null,
    projectionOverrideCount: Object.keys(publicSession.projectionOverrides).length,
    storageBackend
  };
}
