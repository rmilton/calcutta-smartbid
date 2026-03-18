import React, { useEffect, useMemo, useRef, useState } from "react";
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
  AuctionCompleteAssetRow,
  AssetSaleRow,
  ConflictRow,
  NateSilverDecisionBoard,
  formatAssetMembersCompact,
  formatAssetMembers,
  formatAssetSubtitle,
  getAssetBestSeed
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
  const nominatedAsset = dashboard.nominatedAsset;
  const nominatedTeam = dashboard.nominatedTeam;
  const nominatedTeamClassification =
    (nominatedTeam && dashboard.session.teamClassifications[nominatedTeam.id]?.classification) ||
    null;
  const nominatedTeamNote =
    (nominatedTeam && dashboard.session.teamNotes[nominatedTeam.id]?.note) || null;
  const allSoldAssets = useMemo(() => dashboard.soldAssets ?? [], [dashboard.soldAssets]);
  const availableAssets = useMemo(() => {
    if (dashboard.availableAssets) {
      return dashboard.availableAssets;
    }

    const soldAssetIds = new Set(allSoldAssets.map((sale) => sale.asset.id));
    return (dashboard.session.auctionAssets ?? []).filter((asset) => !soldAssetIds.has(asset.id));
  }, [allSoldAssets, dashboard.availableAssets, dashboard.session.auctionAssets]);
  const remainingTeamsLabel = `${availableAssets.length} ${
    availableAssets.length === 1 ? "Team" : "Teams"
  } Remaining`;
  const shouldStackHeroStat = Boolean(
    nominatedAsset &&
      (nominatedAsset.type === "seed_bundle" ||
        nominatedAsset.type === "play_in_slot" ||
        nominatedAsset.label.length > 24)
  );
  const totalAuctionAssets = dashboard.session.auctionAssets?.length ?? 0;
  const isAuctionComplete = totalAuctionAssets > 0 && allSoldAssets.length >= totalAuctionAssets;
  const auctionCompleteSummary = useMemo(
    () =>
      isAuctionComplete
        ? buildViewerAuctionCompleteSummary({
            soldAssets: allSoldAssets,
            focusSyndicateId: dashboard.focusSyndicate.id,
            totalAuctionAssets
          })
        : null,
    [allSoldAssets, dashboard.focusSyndicate.id, isAuctionComplete, totalAuctionAssets]
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
                <span className={cn("status-pill", !isAuctionComplete && "status-pill--muted")}>
                  {isAuctionComplete ? "Auction complete" : remainingTeamsLabel}
                </span>
              </div>
            </div>

            <div
              className={cn(
                "decision-panel__hero",
                isAuctionComplete
                  ? "decision-panel__hero--complete"
                  : nominatedAsset
                    ? "decision-panel__hero--active"
                    : "decision-panel__hero--waiting"
              )}
            >
              <div
                className={cn(
                  "decision-panel__hero-topline",
                  (shouldStackHeroStat || isAuctionComplete) &&
                    "decision-panel__hero-topline--stacked"
                )}
              >
                <div className="decision-panel__hero-content">
                  <div className="decision-panel__hero-pulse">
                    <span
                      className={cn(
                        "pulse-dot",
                        isAuctionComplete
                          ? "pulse-dot--complete"
                          : !nominatedAsset && "pulse-dot--muted"
                      )}
                    />
                    <span>
                      {isAuctionComplete
                        ? "Books closed"
                        : nominatedAsset
                          ? "Active team"
                          : "Awaiting selection"}
                    </span>
                    {!isAuctionComplete && nominatedTeamClassification ? (
                      <div className="decision-panel__classification">
                        <TeamClassificationBadge classification={nominatedTeamClassification} />
                      </div>
                    ) : null}
                  </div>
                  <div className="team-title-lockup">
                    {nominatedAsset && !isAuctionComplete ? (
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
                        !nominatedAsset &&
                          !isAuctionComplete &&
                          "decision-panel__hero-title--waiting"
                      )}
                    >
                      {isAuctionComplete
                        ? "Auction Complete"
                        : nominatedAsset
                          ? nominatedAsset.label
                          : "Waiting for selection"}
                    </h2>
                  </div>
                  {isAuctionComplete ? (
                    <p className="decision-panel__subcopy">
                      {auctionCompleteSummary?.ownedAssets.length
                        ? `${dashboard.focusSyndicate.name} finished with ${
                            auctionCompleteSummary.ownedAssets.length
                          } ${
                            auctionCompleteSummary.ownedAssets.length === 1
                              ? "auction team"
                              : "auction teams"
                          }. The auction is over and the board has shifted from bidding to bracket sweat.`
                        : "The auction is over. The room has moved from bidding to bracket sweat."}
                    </p>
                  ) : nominatedAsset && nominatedAsset.type !== "single_team" ? (
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
                  {isAuctionComplete ? (
                    <>
                      <span className="insight-label">Assets sold</span>
                      <strong>
                        {auctionCompleteSummary
                          ? `${auctionCompleteSummary.soldCount}/${auctionCompleteSummary.totalAuctionAssets}`
                          : "--"}
                      </strong>
                    </>
                  ) : (
                    <>
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
                    </>
                  )}
                </div>
              </div>
              {isAuctionComplete ? (
                <div className="decision-panel__complete-grid">
                  <div className="decision-panel__complete-stat">
                    <span>Mothership teams</span>
                    <strong>{auctionCompleteSummary?.ownedAssets.length ?? 0}</strong>
                  </div>
                  <div className="decision-panel__complete-stat">
                    <span>Best seed held</span>
                    <strong>
                      {auctionCompleteSummary?.bestSeed === null ||
                      auctionCompleteSummary?.bestSeed === undefined
                        ? "--"
                        : `#${auctionCompleteSummary.bestSeed}`}
                    </strong>
                  </div>
                  <div className="decision-panel__complete-stat">
                    <span>Region stack</span>
                    <strong>
                      {auctionCompleteSummary?.topRegion
                        ? `${auctionCompleteSummary.topRegion.region} x${auctionCompleteSummary.topRegion.count}`
                        : "--"}
                    </strong>
                  </div>
                  <div className="decision-panel__complete-stat">
                    <span>Sleeper card</span>
                    <strong>{auctionCompleteSummary?.sleeperAsset?.sale.asset.label ?? "--"}</strong>
                  </div>
                </div>
              ) : nominatedMatchup ? (
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
              {!isAuctionComplete && likelyRound2Matchup ? (
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
              {!isAuctionComplete && nominatedTeamNote ? (
                <div className="decision-panel__annotation">
                  <span className="decision-panel__note">{nominatedTeamNote}</span>
                </div>
              ) : null}
            </div>

            {isAuctionComplete ? (
              <ViewerAuctionCompleteBoard
                summary={auctionCompleteSummary}
                teamLookup={teamLookup}
              />
            ) : (
              <NateSilverDecisionBoard
                nominatedAsset={nominatedAsset}
                nominatedTeam={nominatedTeam}
                currentBid={currentBid}
                breakEvenStage={breakEvenStage}
                payoutRules={dashboard.session.payoutRules}
              />
            )}
          </article>

          <article className="surface-card decision-context viewer-auction-grid__context">
            <div className="decision-context__columns">
              <section className="decision-context__section">
                <div className="section-headline section-headline--compact">
                  <div>
                    <p className="eyebrow">
                      {isAuctionComplete ? "Team Highlights" : "Rationale"}
                    </p>
                  </div>
                </div>
                {isAuctionComplete ? (
                  auctionCompleteSummary?.ownedAssets.length ? (
                    <div className="list-stack">
                      {auctionCompleteSummary.favoriteAsset ? (
                        <AuctionCompleteAssetRow
                          label="Lead sweat"
                          asset={auctionCompleteSummary.favoriteAsset.sale.asset}
                          teamLookup={teamLookup}
                          detail={`Best seed on the viewer board`}
                          value={
                            auctionCompleteSummary.favoriteAsset.bestSeed === null
                              ? "--"
                              : `#${auctionCompleteSummary.favoriteAsset.bestSeed}`
                          }
                        />
                      ) : null}
                      {auctionCompleteSummary.sleeperAsset ? (
                        <AuctionCompleteAssetRow
                          label="Sleeper watch"
                          asset={auctionCompleteSummary.sleeperAsset.sale.asset}
                          teamLookup={teamLookup}
                          detail="Highest-seed flyer still worth tracking"
                          value={
                            auctionCompleteSummary.sleeperAsset.bestSeed === null
                              ? "--"
                              : `#${auctionCompleteSummary.sleeperAsset.bestSeed}`
                          }
                        />
                      ) : null}
                      {auctionCompleteSummary.topRegion ? (
                        <div className="list-row">
                          <div className="team-label">
                            <div className="team-label__copy">
                              <strong>Region stack</strong>
                              <span>{auctionCompleteSummary.topRegion.region} region leads the board</span>
                            </div>
                          </div>
                          <strong>
                            {auctionCompleteSummary.topRegion.count}{" "}
                            {auctionCompleteSummary.topRegion.count === 1 ? "team" : "teams"}
                          </strong>
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <p className="empty-copy">
                      Mothership closed the auction without a team to track.
                    </p>
                  )
                ) : filteredRationale.length ? (
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
                    <p className="eyebrow">
                      {isAuctionComplete ? "Rooting Guide" : "Ownership Conflicts"}
                    </p>
                  </div>
                </div>
                {isAuctionComplete ? (
                  auctionCompleteSummary?.ownedAssets.length ? (
                    <div className="list-stack">
                      {auctionCompleteSummary.ownedAssets.slice(0, 3).map((ownedAsset) => (
                        <AuctionCompleteAssetRow
                          key={ownedAsset.sale.asset.id}
                          label="Watch list"
                          asset={ownedAsset.sale.asset}
                          teamLookup={teamLookup}
                          detail={
                            ownedAsset.sale.asset.type === "single_team"
                              ? `${ownedAsset.sale.asset.region} region · ${ownedAsset.sale.asset.seed}-seed`
                              : formatAssetMembersCompact(ownedAsset.sale.asset, {
                                  includeParens: false
                                })
                          }
                        />
                      ))}
                    </div>
                  ) : (
                    <p className="empty-copy">
                      The board is closed, but there is no Mothership rooting guide to surface.
                    </p>
                  )
                ) : ownershipConflicts.length ? (
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

interface ViewerAuctionCompleteAssetSummary {
  sale: SoldAssetSummary;
  bestSeed: number | null;
}

interface ViewerAuctionCompleteSummary {
  totalAuctionAssets: number;
  soldCount: number;
  ownedAssets: ViewerAuctionCompleteAssetSummary[];
  bestSeed: number | null;
  topRegion: { region: string; count: number } | null;
  favoriteAsset: ViewerAuctionCompleteAssetSummary | null;
  sleeperAsset: ViewerAuctionCompleteAssetSummary | null;
}

function ViewerAuctionCompleteBoard({
  summary,
  teamLookup
}: {
  summary: ViewerAuctionCompleteSummary | null;
  teamLookup: Map<string, TeamProjection>;
}) {
  return (
    <section className="nate-silver-panel">
      <div className="nate-silver-panel__header">
        <div>
          <p className="eyebrow">Rooting Guide</p>
          <h3>Who to watch now that the auction board is final</h3>
        </div>
        <div className="nate-silver-panel__meta">
          <span className="status-pill status-pill--muted">
            {summary?.ownedAssets.length ?? 0}/{summary?.totalAuctionAssets ?? 0} teams held
          </span>
        </div>
      </div>

      {summary?.ownedAssets.length ? (
        <div className="list-stack">
          {summary.ownedAssets.slice(0, 3).map((ownedAsset) => (
            <AuctionCompleteAssetRow
              key={ownedAsset.sale.asset.id}
              label="Priority sweat"
              asset={ownedAsset.sale.asset}
              teamLookup={teamLookup}
              detail={
                ownedAsset.sale.asset.type === "single_team"
                  ? `${ownedAsset.sale.asset.region} region · ${ownedAsset.sale.asset.seed}-seed`
                  : formatAssetMembersCompact(ownedAsset.sale.asset, { includeParens: false })
              }
              value={
                ownedAsset.bestSeed === null || ownedAsset.bestSeed === undefined
                  ? undefined
                  : `#${ownedAsset.bestSeed}`
              }
              valueLabel="seed"
            />
          ))}
        </div>
      ) : (
        <p className="empty-copy">
          The auction is complete, but Mothership did not finish with a team on the board.
        </p>
      )}
    </section>
  );
}

function buildViewerAuctionCompleteSummary({
  soldAssets,
  focusSyndicateId,
  totalAuctionAssets
}: {
  soldAssets: SoldAssetSummary[];
  focusSyndicateId: string;
  totalAuctionAssets: number;
}): ViewerAuctionCompleteSummary {
  const ownedAssets = soldAssets
    .filter((sale) => sale.buyerSyndicateId === focusSyndicateId)
    .map((sale) => summarizeViewerOwnedAsset(sale))
    .sort(
      (left, right) =>
        (left.bestSeed ?? Number.MAX_SAFE_INTEGER) - (right.bestSeed ?? Number.MAX_SAFE_INTEGER) ||
        left.sale.asset.label.localeCompare(right.sale.asset.label)
    );
  const bestOwnedSeed = ownedAssets.reduce(
    (best, ownedAsset) => Math.min(best, ownedAsset.bestSeed ?? Number.MAX_SAFE_INTEGER),
    Number.MAX_SAFE_INTEGER
  );
  const regionCounts = ownedAssets.reduce<Map<string, number>>((counts, ownedAsset) => {
    counts.set(
      ownedAsset.sale.asset.region,
      (counts.get(ownedAsset.sale.asset.region) ?? 0) + 1
    );
    return counts;
  }, new Map());
  const topRegionEntry =
    [...regionCounts.entries()].sort(
      (left, right) => right[1] - left[1] || left[0].localeCompare(right[0])
    )[0] ?? null;

  return {
    totalAuctionAssets,
    soldCount: soldAssets.length,
    ownedAssets,
    bestSeed: bestOwnedSeed === Number.MAX_SAFE_INTEGER ? null : bestOwnedSeed,
    topRegion: topRegionEntry
      ? { region: topRegionEntry[0], count: topRegionEntry[1] }
      : null,
    favoriteAsset: ownedAssets[0] ?? null,
    sleeperAsset:
      [...ownedAssets].sort(
        (left, right) =>
          (right.bestSeed ?? Number.MIN_SAFE_INTEGER) - (left.bestSeed ?? Number.MIN_SAFE_INTEGER) ||
          left.sale.asset.label.localeCompare(right.sale.asset.label)
      )[0] ?? null
  };
}

function summarizeViewerOwnedAsset(sale: SoldAssetSummary): ViewerAuctionCompleteAssetSummary {
  return {
    sale,
    bestSeed: getAssetBestSeed(sale.asset)
  };
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
