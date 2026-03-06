import { buildBidRecommendation } from "@/lib/engine/recommendations";
import { AuctionDashboard, AuctionSession, StorageBackend } from "@/lib/types";

export function buildDashboard(session: AuctionSession, storageBackend: StorageBackend): AuctionDashboard {
  const nominatedTeam = session.projections.find((projection) => projection.id === session.liveState.nominatedTeamId) ?? null;
  const soldLookup = new Map(session.purchases.map((purchase) => [purchase.teamId, purchase]));
  const availableTeams = session.projections.filter((projection) => !soldLookup.has(projection.id));
  const soldTeams = session.purchases
    .map((purchase) => {
      const team = session.projections.find((projection) => projection.id === purchase.teamId);
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

  const focusSyndicate = session.syndicates.find((syndicate) => syndicate.id === session.focusSyndicateId);
  if (!focusSyndicate) {
    throw new Error("Focus syndicate is missing.");
  }

  return {
    session,
    focusSyndicate,
    nominatedTeam,
    availableTeams,
    soldTeams,
    ledger: session.syndicates,
    recommendation: buildBidRecommendation(session, nominatedTeam, focusSyndicate),
    lastPurchase: session.purchases[session.purchases.length - 1] ?? null,
    projectionOverrideCount: Object.keys(session.projectionOverrides).length,
    storageBackend
  };
}
