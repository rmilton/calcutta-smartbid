import React, { useEffect, useRef, useState } from "react";
import { RoundMatchup, ViewerOwnershipGroup } from "@/lib/live-room";
import {
  AuctionDashboard,
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
  NateSilverDecisionBoard,
  formatAssetMembers,
  formatAssetMembersCompact,
  formatAssetSubtitle
} from "@/components/dashboard-shell/shared";
import { AssetLogo, TeamLogo } from "@/components/team-logo";
import { TeamClassificationBadge } from "@/components/team-classification-badge";

interface ViewerAuctionWorkspaceProps {
  dashboard: AuctionDashboard;
  currentBid: number;
  breakEvenStage: Stage | "negativeReturn" | null;
  nominatedMatchup: RoundMatchup | null;
  likelyRound2Matchup: RoundMatchup | null;
  hasOwnedRoundOneOpponent: boolean;
  hasOwnedLikelyRoundTwoOpponent: boolean;
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
  currentBid,
  breakEvenStage,
  nominatedMatchup,
  likelyRound2Matchup,
  hasOwnedRoundOneOpponent,
  hasOwnedLikelyRoundTwoOpponent,
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
  const leftColumnRef = useRef<HTMLDivElement | null>(null);
  const [salesCardHeight, setSalesCardHeight] = useState<number | null>(null);
  const availableAssets = dashboard.availableAssets ?? [];
  const nominatedAsset = dashboard.nominatedAsset;
  const nominatedTeam = dashboard.nominatedTeam;
  const nominatedTeamClassification =
    (nominatedTeam && dashboard.session.teamClassifications[nominatedTeam.id]?.classification) ||
    null;
  const nominatedTeamNote =
    (nominatedTeam && dashboard.session.teamNotes[nominatedTeam.id]?.note) || null;
  const remainingTeamsLabel = `${availableAssets.length} ${
    availableAssets.length === 1 ? "Team" : "Teams"
  } Remaining`;
  const shouldStackHeroStat = Boolean(
    nominatedAsset &&
      (nominatedAsset.type === "seed_bundle" ||
        nominatedAsset.type === "play_in_slot" ||
        nominatedAsset.label.length > 24)
  );

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const desktopQuery = window.matchMedia("(min-width: 1181px)");
    const observedElement = leftColumnRef.current;
    if (!observedElement) {
      return undefined;
    }

    const syncSalesHeight = () => {
      if (!desktopQuery.matches) {
        setSalesCardHeight(null);
        return;
      }

      setSalesCardHeight(observedElement.getBoundingClientRect().height);
    };

    syncSalesHeight();

    const resizeObserver = new ResizeObserver(() => {
      syncSalesHeight();
    });
    resizeObserver.observe(observedElement);
    desktopQuery.addEventListener("change", syncSalesHeight);
    window.addEventListener("resize", syncSalesHeight);

    return () => {
      resizeObserver.disconnect();
      desktopQuery.removeEventListener("change", syncSalesHeight);
      window.removeEventListener("resize", syncSalesHeight);
    };
  }, [filteredRationale.length, ownershipConflicts.length, soldFeed.length]);

  return (
    <section className="viewer-layout">
      <section className="viewer-auction-grid">
        <div ref={leftColumnRef} className="viewer-auction-grid__main">
          <article className="surface-card decision-panel decision-panel--combined">
            <div className="decision-panel__header">
              <div className="decision-panel__header-copy">
                <p className="eyebrow">Live Decision Board</p>
                <span className="status-pill status-pill--muted">{remainingTeamsLabel}</span>
              </div>
            </div>

            <div
              className={cn(
                "decision-panel__hero",
                nominatedAsset ? "decision-panel__hero--active" : "decision-panel__hero--waiting"
              )}
            >
              <div
                className={cn(
                  "decision-panel__hero-topline",
                  shouldStackHeroStat && "decision-panel__hero-topline--stacked"
                )}
              >
                <div className="decision-panel__hero-content">
                  <div className="decision-panel__hero-pulse">
                    <span className={cn("pulse-dot", !nominatedAsset && "pulse-dot--muted")} />
                    <span>{nominatedAsset ? "Active team" : "Awaiting selection"}</span>
                    {nominatedTeamClassification ? (
                      <div className="decision-panel__classification">
                        <TeamClassificationBadge classification={nominatedTeamClassification} />
                      </div>
                    ) : null}
                  </div>
                  <div className="team-title-lockup">
                    {nominatedAsset ? (
                      <AssetLogo
                        asset={nominatedAsset}
                        teamLookup={teamLookup}
                        size="lg"
                        decorative
                        className="team-title-lockup__logo"
                      />
                    ) : null}
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
                      {nominatedAsset ? nominatedAsset.label : "Waiting for selection"}
                    </h2>
                  </div>
                  {nominatedAsset && nominatedAsset.type !== "single_team" ? (
                    <p className="decision-panel__note">
                      {formatAssetMembersCompact(nominatedAsset, { includeParens: false })}
                    </p>
                  ) : (
                    <p className="decision-panel__subcopy">
                      {nominatedAsset
                        ? formatAssetSubtitle(nominatedAsset, nominatedTeam)
                        : "The next active team will take over this board when the operator makes a selection."}
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
                  <span>Round 1 Matchup:</span>
                  <span className="decision-panel__matchup-team">
                    <TeamLogo
                      teamId={nominatedMatchup.opponent.teamId}
                      teamName={nominatedMatchup.opponent.name}
                      size="xs"
                      decorative
                    />
                    <span>
                      {nominatedMatchup.opponent.seed}-seed {nominatedMatchup.opponent.name}
                    </span>
                  </span>
                  {hasOwnedRoundOneOpponent ? (
                    <span className="decision-panel__matchup-owned">you own</span>
                  ) : null}
                </p>
              ) : null}
              {likelyRound2Matchup ? (
                <p className="decision-panel__path">
                  <span>Most likely Round 2:</span>
                  <span className="decision-panel__matchup-team">
                    <TeamLogo
                      teamId={likelyRound2Matchup.opponent.teamId}
                      teamName={likelyRound2Matchup.opponent.name}
                      size="xs"
                      decorative
                    />
                    <span>
                      {likelyRound2Matchup.opponent.seed}-seed{" "}
                      {likelyRound2Matchup.opponent.name}
                    </span>
                  </span>
                  <span>({formatPercent(likelyRound2Matchup.probability ?? 0)})</span>
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

            <NateSilverDecisionBoard
              nominatedAsset={nominatedAsset}
              nominatedTeam={nominatedTeam}
              currentBid={currentBid}
              breakEvenStage={breakEvenStage}
              payoutRules={dashboard.session.payoutRules}
            />
          </article>

          <article className="surface-card decision-context viewer-auction-grid__context">
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

        <aside className="viewer-auction-grid__sales">
          <article
            className="surface-card viewer-layout__sales-card"
            style={salesCardHeight ? { height: `${Math.round(salesCardHeight)}px` } : undefined}
          >
            <div className="section-headline">
              <div>
                <p className="eyebrow">Recent Sales</p>
                <h3>Latest auction activity</h3>
              </div>
            </div>
            {soldFeed.length ? (
              <div className="viewer-layout__sales-list list-stack">
                {soldFeed.map((sale) => (
                  <AssetSaleRow
                    key={`${sale.asset.id}-${sale.price}-${sale.buyerSyndicateId}`}
                    sale={sale}
                    syndicateLookup={syndicateLookup}
                    teamLookup={teamLookup}
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
                teamLookup={teamLookup}
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
  teamLookup,
  isMothership,
  hasActiveSearch
}: {
  group: { syndicate: Syndicate; sales: SoldAssetSummary[] };
  teamLookup: Map<string, TeamProjection>;
  isMothership: boolean;
  hasActiveSearch: boolean;
}) {
  const [isExpanded, setIsExpanded] = useState(true);

  return (
    <article
      className={cn("viewer-ledger-group", isMothership && "viewer-ledger-group--focus")}
    >
      <button
        type="button"
        className="viewer-ledger-group__header viewer-ledger-group__toggle"
        aria-expanded={isExpanded}
        onClick={() => setIsExpanded((current) => !current)}
      >
        <div className="viewer-ledger-group__title">
          <span className="syndicate-dot" style={{ backgroundColor: group.syndicate.color }} />
          <div>
            <strong>{group.syndicate.name}</strong>
          </div>
        </div>
        <div className="viewer-ledger-group__total">
          <span>{isExpanded ? "Hide" : "Show"}</span>
          <strong>
            {group.sales.length}{" "}
            {group.sales.length === 1 ? "team" : "teams"}
          </strong>
        </div>
      </button>
      {isExpanded ? group.sales.length ? (
        <div className="viewer-ledger-group__rows">
          {group.sales.map((sale) => (
            <div
              key={`${group.syndicate.id}-${sale.asset.id}-${sale.price}`}
              className="viewer-ledger-row"
            >
              <div className="viewer-ledger-row__team">
                <div className="team-label">
                  <AssetLogo asset={sale.asset} teamLookup={teamLookup} size="sm" decorative />
                  <div className="team-label__copy">
                    <strong>{sale.asset.label}</strong>
                    <span>{formatAssetSubtitle(sale.asset, null)}</span>
                    <span>{formatAssetMembers(sale.asset)}</span>
                  </div>
                </div>
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
      ) : null}
    </article>
  );
}
