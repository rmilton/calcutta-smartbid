import { buildBidRecommendation } from "@/lib/engine/recommendations";
import { AuctionDashboard, AuctionSession, StorageBackend, StoredAuctionSession } from "@/lib/types";

function sanitizeSessionForClient(session: AuctionSession | StoredAuctionSession): AuctionSession {
  return {
    id: session.id,
    name: session.name,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    focusSyndicateId: session.focusSyndicateId,
    eventAccess: session.eventAccess,
    payoutRules: session.payoutRules,
    syndicates: session.syndicates,
    baseProjections: session.baseProjections,
    projections: session.projections,
    projectionOverrides: session.projectionOverrides,
    projectionProvider: session.projectionProvider,
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

  const focusSyndicate = publicSession.syndicates.find((syndicate) => syndicate.id === publicSession.focusSyndicateId);
  if (!focusSyndicate) {
    throw new Error("Focus syndicate is missing.");
  }

  return {
    session: publicSession,
    focusSyndicate,
    nominatedTeam,
    availableTeams,
    soldTeams,
    ledger: publicSession.syndicates,
    recommendation: buildBidRecommendation(publicSession, nominatedTeam, focusSyndicate),
    lastPurchase: publicSession.purchases[publicSession.purchases.length - 1] ?? null,
    projectionOverrideCount: Object.keys(publicSession.projectionOverrides).length,
    storageBackend
  };
}
