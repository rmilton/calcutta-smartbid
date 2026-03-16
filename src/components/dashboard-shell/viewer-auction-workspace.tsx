import React from "react";
import { RoundMatchup, ViewerOwnershipGroup } from "@/lib/live-room";
import {
  AuctionDashboard,
  BidRecommendation,
  MatchupConflict,
  SoldAssetSummary,
  Stage,
  Syndicate,
  TeamProjection
} from "@/lib/types";
import { cn, formatCurrency, formatPercent } from "@/lib/utils";
import {
  AssetSaleRow,
  ConflictRow,
  MetricCard,
  formatAssetMembers,
  formatAssetMembersCompact,
  formatAssetSubtitle,
  formatBreakEvenStage
} from "@/components/dashboard-shell/shared";
import { TeamClassificationBadge } from "@/components/team-classification-badge";

interface ViewerAuctionWorkspaceProps {
  dashboard: AuctionDashboard;
  recommendation: BidRecommendation | null;
  signalLabel: string | null;
  currentBid: number;
  nominatedMatchup: RoundMatchup | null;
  likelyRound2Matchup: RoundMatchup | null;
  hasOwnedRoundOneOpponent: boolean;
  hasOwnedLikelyRoundTwoOpponent: boolean;
  callHeadline: string;
  callSupportText: string;
  callDetailText: string | null;
  breakEvenStage: Stage | "negativeReturn" | null;
  targetBidDisplay: string;
  maxBidDisplay: string;
  filteredRationale: string[];
  ownershipConflicts: MatchupConflict[];
  teamLookup: Map<string, TeamProjection>;
  forcedPassConflictTeamId: string | null;
  ownershipSearch: string;
  onOwnershipSearchChange: (value: string) => void;
  ownershipGroups: ViewerOwnershipGroup[];
  soldFeed: SoldAssetSummary[];
  syndicateLookup: Map<string, Syndicate>;
}

export function ViewerAuctionWorkspace({
  dashboard,
  recommendation,
  signalLabel,
  currentBid,
  nominatedMatchup,
  likelyRound2Matchup,
  hasOwnedRoundOneOpponent,
  hasOwnedLikelyRoundTwoOpponent,
  callHeadline,
  callSupportText,
  callDetailText,
  breakEvenStage,
  targetBidDisplay,
  maxBidDisplay,
  filteredRationale,
  ownershipConflicts,
  teamLookup,
  forcedPassConflictTeamId,
  ownershipSearch,
  onOwnershipSearchChange,
  ownershipGroups,
  soldFeed,
  syndicateLookup
}: ViewerAuctionWorkspaceProps) {
  const nominatedAsset = dashboard.nominatedAsset;
  const nominatedTeam = dashboard.nominatedTeam;
  const nominatedTeamClassification =
    (nominatedTeam && dashboard.session.teamClassifications[nominatedTeam.id]?.classification) ||
    null;
  const nominatedTeamNote =
    (nominatedTeam && dashboard.session.teamNotes[nominatedTeam.id]?.note) || null;

  return (
    <section className="viewer-layout">
      <section className="operator-board-layout">
        <div className="operator-board-layout__main">
          <article className="surface-card decision-panel decision-panel--combined">
            <div className="decision-panel__header">
              <p className="eyebrow">Live Decision Board</p>
              {signalLabel ? (
                <div
                  className={cn(
                    "signal-pill",
                    recommendation && `signal-pill--${recommendation.stoplight}`
                  )}
                >
                  {signalLabel}
                </div>
              ) : null}
            </div>

            <div
              className={cn(
                "decision-panel__hero",
                nominatedAsset
                  ? "decision-panel__hero--active"
                  : "decision-panel__hero--waiting"
              )}
            >
              <div className="decision-panel__hero-topline">
                <div className="decision-panel__hero-content">
                  <div className="decision-panel__hero-pulse">
                    <span className={cn("pulse-dot", !nominatedAsset && "pulse-dot--muted")} />
                    <span>{nominatedAsset ? "Active team" : "Awaiting nomination"}</span>
                    {nominatedTeamClassification ? (
                      <div className="decision-panel__classification">
                        <TeamClassificationBadge classification={nominatedTeamClassification} />
                      </div>
                    ) : null}
                  </div>
                  <h2
                    className={cn(
                      "decision-panel__hero-title",
                      nominatedAsset &&
                        nominatedAsset.type === "seed_bundle" &&
                        "decision-panel__hero-title--bundle",
                      nominatedAsset &&
                        (nominatedAsset.type === "play_in_slot" ||
                          nominatedAsset.label.length > 24) &&
                        "decision-panel__hero-title--long",
                      !nominatedAsset && "decision-panel__hero-title--waiting"
                    )}
                  >
                    {nominatedAsset ? nominatedAsset.label : "Waiting for nomination"}
                  </h2>
                  {nominatedAsset && nominatedAsset.type !== "single_team" ? (
                    <p className="decision-panel__note">
                      {formatAssetMembersCompact(nominatedAsset, { includeParens: false })}
                    </p>
                  ) : (
                    <p className="decision-panel__subcopy">
                      {nominatedAsset
                        ? formatAssetSubtitle(nominatedAsset, nominatedTeam)
                        : "The next active team will take over this board when the operator makes a nomination."}
                    </p>
                  )}
                </div>
                <div className="decision-panel__hero-stat">
                  <span className="insight-label">
                    Current bid
                    <button
                      type="button"
                      className="tooltip-hint"
                      aria-label="Current bid explanation"
                    >
                      ?
                      <span className="tooltip-content">
                        The live price currently on the board for this team. Break-even, bid range,
                        and recommendation context all update against this number.
                      </span>
                    </button>
                  </span>
                  <strong>{formatCurrency(currentBid)}</strong>
                </div>
              </div>
              {nominatedMatchup ? (
                <p className="decision-panel__matchup">
                  Round 1 Matchup: {nominatedMatchup.opponent.seed}-seed{" "}
                  {nominatedMatchup.opponent.name}
                  {hasOwnedRoundOneOpponent ? (
                    <span className="decision-panel__matchup-owned">you own</span>
                  ) : null}
                </p>
              ) : null}
              {likelyRound2Matchup ? (
                <p className="decision-panel__path">
                  Most likely Round 2: {likelyRound2Matchup.opponent.seed}-seed{" "}
                  {likelyRound2Matchup.opponent.name} (
                  {formatPercent(likelyRound2Matchup.probability ?? 0)})
                  {hasOwnedLikelyRoundTwoOpponent ? (
                    <span className="decision-panel__matchup-owned">you own</span>
                  ) : null}
                </p>
              ) : null}
              {nominatedTeamNote ? (
                <div className="decision-panel__annotation">
                  <span className="decision-panel__note">{nominatedTeamNote}</span>
                </div>
              ) : null}
            </div>
          </article>

          <article className="surface-card decision-context">
            <div className="decision-context__overview">
              <div className="decision-panel__callout decision-context__callout">
                <p className="eyebrow">Call</p>
                <h3>{callHeadline}</h3>
                <p>{callSupportText}</p>
                {callDetailText ? <p className="call-conflict">{callDetailText}</p> : null}
              </div>

              <div className="decision-context__summary-grid">
                <MetricCard
                  label="Break-even round"
                  value={formatBreakEvenStage(breakEvenStage)}
                  compact
                  tooltip="The minimum tournament round this team needs to reach for the modeled payout to cover the current bid."
                />
                <MetricCard
                  label="Simulated net"
                  value={recommendation ? formatCurrency(recommendation.expectedNetValue) : "--"}
                  compact
                  tooltip="Expected gross payout minus the current bid and any portfolio-overlap penalty from teams Mothership already owns."
                />
                <MetricCard
                  label="Target bid"
                  value={targetBidDisplay}
                  compact
                  tooltip="The model's normal buy price for this team based on conviction and Mothership's remaining buying room."
                />
                <MetricCard
                  label="Max bid"
                  value={maxBidDisplay}
                  compact
                  tooltip="The highest bid the model can justify after funding room and portfolio overlap penalties are applied."
                />
              </div>
            </div>

            <div className="decision-context__columns">
              <section className="decision-context__section">
                <div className="section-headline section-headline--compact">
                  <div>
                    <p className="eyebrow">Rationale</p>
                  </div>
                </div>
                {filteredRationale.length ? (
                  <div className="list-stack">
                    {filteredRationale.map((line) => (
                      <div key={line} className="list-line">
                        {line}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="empty-copy">Choose a team to unlock simulation-backed rationale.</p>
                )}
              </section>

              <section className="decision-context__section">
                <div className="section-headline section-headline--compact">
                  <div>
                    <p className="eyebrow">Ownership Conflicts</p>
                  </div>
                </div>
                {ownershipConflicts.length ? (
                  <div className="list-stack">
                    {ownershipConflicts.slice(0, 4).map((conflict) => (
                      <ConflictRow
                        key={conflict.opponentId}
                        conflict={conflict}
                        teamLookup={teamLookup}
                        isOwned
                        isCritical={conflict.opponentId === forcedPassConflictTeamId}
                      />
                    ))}
                  </div>
                ) : (
                  <p className="empty-copy">No immediate portfolio collision flags.</p>
                )}
              </section>
            </div>
          </article>
        </div>

        <aside className="operator-board-layout__side viewer-layout__side">
          <article className="surface-card">
            <div className="section-headline">
              <div>
                <p className="eyebrow">Recent Sales</p>
                <h3>Latest auction activity</h3>
              </div>
            </div>
            {soldFeed.length ? (
              <div className="list-stack">
                {soldFeed.map((sale) => (
                  <AssetSaleRow
                    key={`${sale.asset.id}-${sale.price}-${sale.buyerSyndicateId}`}
                    sale={sale}
                    syndicateLookup={syndicateLookup}
                  />
                ))}
              </div>
            ) : (
              <p className="empty-copy">No sales have been recorded yet.</p>
            )}
          </article>
        </aside>
      </section>

      <article className="surface-card">
        <div className="section-headline">
          <div>
            <p className="eyebrow">Ownership Ledger</p>
            <h3>Syndicate Holdings</h3>
          </div>
          <div className="viewer-ledger-search">
            <input
              type="search"
              value={ownershipSearch}
              onChange={(event) => onOwnershipSearchChange(event.target.value)}
              placeholder="Filter by team name"
            />
          </div>
        </div>
        {ownershipGroups.length ? (
          <div className="viewer-ledger">
            {ownershipGroups.map((group) => (
              <ViewerOwnershipLedgerGroup
                key={group.syndicate.id}
                group={group}
                isMothership={group.highlight}
                hasActiveSearch={ownershipSearch.trim().length > 0}
              />
            ))}
          </div>
        ) : (
          <p className="empty-copy">No matching teams in current syndicate holdings.</p>
        )}
      </article>
    </section>
  );
}

function ViewerOwnershipLedgerGroup({
  group,
  isMothership,
  hasActiveSearch
}: {
  group: { syndicate: Syndicate; sales: SoldAssetSummary[] };
  isMothership: boolean;
  hasActiveSearch: boolean;
}) {
  return (
    <article
      className={cn("viewer-ledger-group", isMothership && "viewer-ledger-group--focus")}
    >
      <div className="viewer-ledger-group__header">
        <div className="viewer-ledger-group__title">
          <span className="syndicate-dot" style={{ backgroundColor: group.syndicate.color }} />
          <div>
            <strong>{group.syndicate.name}</strong>
          </div>
        </div>
        <div className="viewer-ledger-group__total">
          <strong>
            {formatCurrency(group.syndicate.spend)} · {group.sales.length}{" "}
            {group.sales.length === 1 ? "team" : "teams"}
          </strong>
        </div>
      </div>
      {group.sales.length ? (
        <div className="viewer-ledger-group__rows">
          {group.sales.map((sale) => (
            <div
              key={`${group.syndicate.id}-${sale.asset.id}-${sale.price}`}
              className="viewer-ledger-row"
            >
              <div className="viewer-ledger-row__team">
                <strong>{sale.asset.label}</strong>
                <span>{formatAssetSubtitle(sale.asset, null)}</span>
                <span>{formatAssetMembers(sale.asset)}</span>
              </div>
              <div className="viewer-ledger-row__price">
                <strong>{formatCurrency(sale.price)}</strong>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="empty-copy">
          {hasActiveSearch
            ? `No matching teams for ${group.syndicate.name}.`
            : `No purchased teams yet for ${group.syndicate.name}.`}
        </p>
      )}
    </article>
  );
}
