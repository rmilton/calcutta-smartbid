import type { FocusEvent, KeyboardEvent, RefObject } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  buildOwnedAuctionCompleteAssets,
  deriveProjectedFinalPot,
  findLeadingAuctionRegion,
  summarizeAuctionProgress
} from "@/lib/live-room";
import {
  AuctionAsset,
  AuctionDashboard,
  BidRecommendation,
  MatchupConflict,
  MothershipPortfolioResults,
  RoundMatchup,
  SoldAssetSummary,
  Stage,
  Syndicate,
  TeamClassificationValue,
  TeamProjection
} from "@/lib/types";
import { cn, formatCurrency, formatPercent } from "@/lib/utils";
import {
  AuctionCompleteAssetRow,
  AssetSaleRow,
  ConflictRow,
  MetricCard,
  NateSilverDecisionBoard,
  formatAssetMembersCompact,
  formatAssetMembers,
  formatAssetSeed,
  formatAssetSubtitle
} from "@/components/dashboard-shell/shared";
import { AssetLogo, TeamLogo } from "@/components/team-logo";
import { TeamClassificationBadge } from "@/components/team-classification-badge";
import { TournamentTracker } from "@/components/dashboard-shell/tournament-tracker";

interface OperatorAuctionWorkspaceProps {
  dashboard: AuctionDashboard;
  recommendation: BidRecommendation | null;
  notice: string | null;
  error: string | null;
  selectedAssetId: string;
  bidInputValue: string;
  parsedBidInputValue: number;
  buyerId: string;
  currentBid: number;
  isUndoingPurchase: boolean;
  isUpdatingAuctionStatus: boolean;
  isAuctionMarkedComplete: boolean;
  isTournamentActive: boolean;
  portfolioResults: MothershipPortfolioResults | null;
  teamSelectRef: RefObject<HTMLInputElement | null>;
  bidInputRef: RefObject<HTMLInputElement | null>;
  onAssetChange: (nextAssetId: string) => void;
  onBidInputChange: (nextValue: string) => void;
  onBidBlur: (event: FocusEvent<HTMLInputElement>) => void;
  onBidKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  onBuyerChange: (buyerId: string) => void;
  onUndoPurchase: () => void;
  onRecordPurchase: () => void;
  onUpdateAuctionStatus: (action: "complete" | "reopen" | "enter_tournament" | "exit_tournament") => void;
  lastPurchaseTeamName: string | null;
  lastPurchaseBuyerName: string | null;
  signalLabel: string | null;
  nominatedAsset: AuctionAsset | null;
  nominatedTeam: TeamProjection | null;
  nominatedTeamClassification: TeamClassificationValue | null;
  nominatedTeamNote: string | null;
  nominatedMatchup: RoundMatchup | null;
  likelyRound2Matchup: RoundMatchup | null;
  hasOwnedRoundOneOpponent: boolean;
  hasOwnedLikelyRoundTwoOpponent: boolean;
  breakEvenStage: Stage | "negativeReturn" | null;
  targetBidDisplay: string;
  maxBidDisplay: string;
  plannedBudgetAllocationDisplay: string;
  filteredRationale: string[];
  ownershipConflicts: MatchupConflict[];
  teamLookup: Map<string, TeamProjection>;
  forcedPassConflictTeamId: string | null;
  projectedBaseRoom: number;
  projectedStretchRoom: number;
  titleOdds: number;
  operatorSyndicateHoldings: Array<{ syndicate: Syndicate; sales: SoldAssetSummary[] }>;
  expandedSyndicateIds: string[];
  onToggleSyndicate: (syndicateId: string) => void;
  onExpandAll: () => void;
  onCollapseAll: () => void;
  recentSales: SoldAssetSummary[];
  syndicateLookup: Map<string, Syndicate>;
  focusFundingImpliedSharePrice: number | null;
}

export function OperatorAuctionWorkspace(props: OperatorAuctionWorkspaceProps) {
  const {
    dashboard,
    recommendation,
    notice,
    error,
    selectedAssetId,
    bidInputValue,
    parsedBidInputValue,
    buyerId,
    currentBid,
    isUndoingPurchase,
    isUpdatingAuctionStatus,
    isAuctionMarkedComplete,
    isTournamentActive,
    portfolioResults,
    teamSelectRef,
    bidInputRef,
    onAssetChange,
    onBidInputChange,
    onBidBlur,
    onBidKeyDown,
    onBuyerChange,
    onUndoPurchase,
    onRecordPurchase,
    onUpdateAuctionStatus,
    lastPurchaseTeamName,
    lastPurchaseBuyerName,
    signalLabel,
    nominatedAsset,
    nominatedTeam,
    nominatedTeamClassification,
    nominatedTeamNote,
    nominatedMatchup,
    likelyRound2Matchup,
    hasOwnedRoundOneOpponent,
    hasOwnedLikelyRoundTwoOpponent,
    breakEvenStage,
    targetBidDisplay,
    maxBidDisplay,
    plannedBudgetAllocationDisplay,
    filteredRationale,
    ownershipConflicts,
    teamLookup,
    forcedPassConflictTeamId,
    projectedBaseRoom,
    projectedStretchRoom,
    titleOdds,
    operatorSyndicateHoldings,
    expandedSyndicateIds,
    onToggleSyndicate,
    onExpandAll,
    onCollapseAll,
    recentSales,
    syndicateLookup,
    focusFundingImpliedSharePrice
  } = props;
  const auctionProgress = useMemo(() => summarizeAuctionProgress(dashboard), [dashboard]);
  const shouldStackHeroStat = Boolean(
    nominatedAsset &&
      (nominatedAsset.type === "seed_bundle" ||
        nominatedAsset.type === "play_in_slot" ||
        nominatedAsset.label.length > 24)
  );
  const auctionCompleteSummary = useMemo(
    () =>
      auctionProgress.isAuctionComplete
        ? buildAuctionCompleteSummary({
            dashboard
          })
        : null,
    [auctionProgress.isAuctionComplete, dashboard]
  );
  const auctionCompleteRootingGuide = auctionCompleteSummary?.ownedAssets.slice(0, 3) ?? [];
  const auctionCompleteRegionLabel = auctionCompleteSummary?.topRegion
    ? `${auctionCompleteSummary.topRegion.region} x${auctionCompleteSummary.topRegion.count}`
    : "--";
  const auctionCompleteAverageSeed = auctionCompleteSummary?.averageSeed;
  const roomBiggestSaleBuyer = auctionCompleteSummary?.roomBiggestSale
    ? syndicateLookup.get(auctionCompleteSummary.roomBiggestSale.sale.buyerSyndicateId)?.name ??
      auctionCompleteSummary.roomBiggestSale.sale.buyerSyndicateId
    : null;
  const projectedFinalPot = useMemo(
    () =>
      deriveProjectedFinalPot({
        ledger: dashboard.ledger ?? [],
        availableAssets: dashboard.availableAssets ?? [],
        budgetRows: dashboard.analysis?.budgetRows ?? [],
        liveAssetId: selectedAssetId,
        liveBid: currentBid
      }),
    [
      currentBid,
      dashboard.analysis,
      dashboard.availableAssets,
      dashboard.ledger,
      selectedAssetId
    ]
  );
  const showAuctionStatusControl = auctionProgress.isAuctionComplete || isAuctionMarkedComplete;

  return (
    <section className="auction-layout">
      <article className="surface-card control-panel auction-controls">
        {isAuctionMarkedComplete ? (
          <>
            <p className="support-copy">
              {isTournamentActive
                ? "Tournament mode is active. Exit tournament mode to return to the completed auction view."
                : "Auction is marked complete. Reopen it to resume bidding corrections or undo the last sale."}
            </p>
            {showAuctionStatusControl ? (
              <div className="button-row">
                {!isTournamentActive ? (
                  <button
                    type="button"
                    className="button button-secondary button--small"
                    disabled={isUpdatingAuctionStatus}
                    onClick={() => {
                      if (window.confirm("Reopen the auction? This will allow bidding corrections and undo.")) {
                        onUpdateAuctionStatus("reopen");
                      }
                    }}
                  >
                    {isUpdatingAuctionStatus ? "Reopening..." : "Reopen auction"}
                  </button>
                ) : null}
                <button
                  type="button"
                  className="button button-secondary button--small"
                  disabled={isUpdatingAuctionStatus}
                  onClick={() => {
                    const msg = isTournamentActive
                      ? "Exit tournament mode and return to the completed auction view?"
                      : "Enter tournament mode? The auction will remain closed.";
                    if (window.confirm(msg)) {
                      onUpdateAuctionStatus(isTournamentActive ? "exit_tournament" : "enter_tournament");
                    }
                  }}
                >
                  {isUpdatingAuctionStatus
                    ? isTournamentActive
                      ? "Exiting..."
                      : "Entering..."
                    : isTournamentActive
                      ? "Exit tournament mode"
                      : "Enter tournament mode"}
                </button>
              </div>
            ) : null}
          </>
        ) : (
          <>
            <div className="section-headline auction-controls__headline">
              <div>
                <p className="eyebrow">Live Controls</p>
              </div>
              <div className="shortcut-legend">
                <div className="shortcut-legend__row">
                  <kbd>/</kbd>
                  <span>Focus team</span>
                </div>
                <div className="shortcut-legend__row">
                  <kbd>B</kbd>
                  <span>Focus bid</span>
                </div>
                <div className="shortcut-legend__row">
                  <kbd>↵</kbd>
                  <span>Save board</span>
                </div>
              </div>
            </div>

            <div className="auction-controls__bar">
              <label className="field-shell field-shell--accent auction-controls__field auction-controls__field--team">
                <span>Active team</span>
                <AssetCombobox
                  assets={dashboard.availableAssets}
                  soldAssets={dashboard.soldAssets}
                  teamLookup={teamLookup}
                  value={selectedAssetId}
                  inputRef={teamSelectRef}
                  disabled={isAuctionMarkedComplete}
                  onChange={onAssetChange}
                />
              </label>

              <label className="field-shell auction-controls__field auction-controls__field--bid">
                <span>Current bid</span>
                <div className="live-bid-field">
                  <input
                    ref={bidInputRef}
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    value={bidInputValue}
                    onChange={(event) => onBidInputChange(event.target.value)}
                    onBlur={onBidBlur}
                    onKeyDown={onBidKeyDown}
                    onFocus={(event) => event.target.select()}
                    onClick={(event) => event.currentTarget.select()}
                    disabled={isAuctionMarkedComplete}
                  />
                </div>
              </label>

              <div className="auction-controls__field auction-controls__field--winner">
                <span className="auction-controls__label">Winner</span>
                <div className="auction-controls__winner-list" role="group" aria-label="Winner">
                  {dashboard.ledger.map((syndicate) => {
                    const isSelected = buyerId === syndicate.id;
                    return (
                      <button
                        key={syndicate.id}
                        type="button"
                        className={cn(
                          "button button-secondary auction-controls__winner-button",
                          isSelected && "auction-controls__winner-button--selected"
                        )}
                        aria-pressed={isSelected}
                        disabled={isAuctionMarkedComplete}
                        onClick={() => onBuyerChange(syndicate.id)}
                      >
                        {syndicate.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="auction-controls__footer">
              <div className="auction-controls__history">
                {dashboard.lastPurchase ? (
                  <p>
                    Last sale: <strong>{lastPurchaseTeamName ?? dashboard.lastPurchase.teamId}</strong> to{" "}
                    <strong>
                      {lastPurchaseBuyerName ?? dashboard.lastPurchase.buyerSyndicateId}
                    </strong>{" "}
                    for <strong>{formatCurrency(dashboard.lastPurchase.price)}</strong>
                  </p>
                ) : (
                  <p>No purchases recorded yet.</p>
                )}
                <button
                  type="button"
                  className="button button-secondary button--small auction-controls__undo"
                  data-live-bid-blur-ignore="true"
                  disabled={!dashboard.lastPurchase || isUndoingPurchase || isAuctionMarkedComplete}
                  onClick={onUndoPurchase}
                >
                  {isUndoingPurchase ? "Undoing..." : "Undo last purchase"}
                </button>
              </div>

              <button
                type="button"
                className="button button-accent auction-controls__purchase"
                data-live-bid-blur-ignore="true"
                disabled={isAuctionMarkedComplete || parsedBidInputValue <= 0 || !selectedAssetId}
                onClick={onRecordPurchase}
              >
                Record purchase
              </button>
            </div>
            <button
              type="button"
              className="button button-ghost button--small auction-controls__clear-active"
              data-live-bid-blur-ignore="true"
              disabled={!selectedAssetId}
              onClick={() => onAssetChange("")}
            >
              Clear active
            </button>
            {showAuctionStatusControl ? (
              <button
                type="button"
                className="button button-secondary button--small"
                disabled={isUpdatingAuctionStatus}
                onClick={() => {
                  if (window.confirm("Mark the auction complete? Bidding controls will be disabled.")) {
                    onUpdateAuctionStatus("complete");
                  }
                }}
              >
                {isUpdatingAuctionStatus ? "Completing..." : "Mark auction complete"}
              </button>
            ) : null}
          </>
        )}
        {notice ? <p className="notice-text">{notice}</p> : null}
        {error ? <p className="error-text">{error}</p> : null}
      </article>

      {isTournamentActive && portfolioResults ? (
        <TournamentTracker results={portfolioResults} />
      ) : null}

      <section className="operator-board-layout">
        <div className="operator-board-layout__main">
          <article className="surface-card decision-panel decision-panel--combined">
            <div className="decision-panel__header">
              <div className="decision-panel__header-copy">
                <p className="eyebrow">Live Decision Board</p>
                <span
                  className={cn(
                    "status-pill",
                    !auctionProgress.isAuctionComplete && "status-pill--muted"
                  )}
                >
                  {auctionProgress.isAuctionComplete
                    ? "Auction complete"
                    : auctionProgress.remainingAssetsLabel}
                </span>
                {isAuctionMarkedComplete ? (
                  <span className="status-pill status-pill--positive">Marked complete</span>
                ) : null}
              </div>
              {!auctionProgress.isAuctionComplete && signalLabel ? (
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
                auctionProgress.isAuctionComplete
                  ? "decision-panel__hero--complete"
                  : nominatedAsset
                  ? "decision-panel__hero--active"
                  : "decision-panel__hero--waiting"
              )}
            >
              <div
                className={cn(
                  "decision-panel__hero-topline",
                  (shouldStackHeroStat || auctionProgress.isAuctionComplete) &&
                    "decision-panel__hero-topline--stacked"
                )}
              >
                <div className="decision-panel__hero-content">
                  <div className="decision-panel__hero-pulse">
                    <span
                      className={cn(
                        "pulse-dot",
                        auctionProgress.isAuctionComplete
                          ? "pulse-dot--complete"
                          : !nominatedAsset && "pulse-dot--muted"
                      )}
                    />
                    <span>
                      {auctionProgress.isAuctionComplete
                        ? "Books closed"
                        : nominatedAsset
                          ? "Active team"
                          : "Awaiting selection"}
                    </span>
                    {!auctionProgress.isAuctionComplete && nominatedTeamClassification ? (
                      <div className="decision-panel__classification">
                        <TeamClassificationBadge classification={nominatedTeamClassification} />
                      </div>
                    ) : null}
                  </div>
                  <div className="team-title-lockup">
                    {nominatedAsset && !auctionProgress.isAuctionComplete ? (
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
                          !auctionProgress.isAuctionComplete &&
                          "decision-panel__hero-title--waiting"
                      )}
                    >
                      {auctionProgress.isAuctionComplete
                        ? "Auction Complete"
                        : nominatedAsset
                          ? nominatedAsset.label
                          : "Waiting for selection"}
                    </h2>
                  </div>
                  {auctionProgress.isAuctionComplete ? (
                    <p className="decision-panel__subcopy">
                      {auctionCompleteSummary && auctionCompleteSummary.ownedAssets.length
                        ? `Mothership closed with ${auctionCompleteSummary.ownedAssets.length} ${
                            auctionCompleteSummary.ownedAssets.length === 1
                              ? "auction team"
                              : "auction teams"
                          } for ${formatCurrency(auctionCompleteSummary.totalSpend)}.`
                        : "The room is closed. Mothership stayed disciplined and did not record a purchase."}
                    </p>
                  ) : nominatedAsset && nominatedAsset.type !== "single_team" ? (
                    <p className="decision-panel__note">
                      {formatAssetMembersCompact(nominatedAsset, { includeParens: false })}
                    </p>
                  ) : (
                    <p className="decision-panel__subcopy">
                      {nominatedAsset
                        ? formatAssetSubtitle(nominatedAsset, nominatedTeam)
                        : "Set an active team to unlock bid guidance."}
                    </p>
                  )}
                </div>
                <div className="decision-panel__hero-stat">
                  <span className="insight-label">
                    {auctionProgress.isAuctionComplete ? "Final pot" : "Current bid"}
                    {!auctionProgress.isAuctionComplete ? (
                      <button
                        type="button"
                        className="tooltip-hint"
                        aria-label="Current bid explanation"
                      >
                        ?
                        <span className="tooltip-content">
                          The live price currently on the board for this team. Break-even, funding
                          status, and recommendation context all update against this number.
                        </span>
                      </button>
                    ) : null}
                  </span>
                  <strong>
                    {formatCurrency(auctionCompleteSummary?.finalPot ?? currentBid)}
                  </strong>
                </div>
              </div>
              {auctionProgress.isAuctionComplete ? (
                <div className="decision-panel__complete-grid">
                  <div className="decision-panel__complete-stat">
                    <span>Teams won</span>
                    <strong>
                      {auctionCompleteSummary
                        ? `${auctionCompleteSummary.ownedAssets.length}/${auctionCompleteSummary.totalAuctionAssets}`
                        : "--"}
                    </strong>
                  </div>
                  <div className="decision-panel__complete-stat">
                    <span>Title equity</span>
                    <strong>
                      {auctionCompleteSummary
                        ? formatPercent(auctionCompleteSummary.totalTitleOdds)
                        : "--"}
                    </strong>
                  </div>
                  <div className="decision-panel__complete-stat">
                    <span>Final Four equity</span>
                    <strong>
                      {auctionCompleteSummary
                        ? formatPercent(auctionCompleteSummary.totalFinalFourOdds)
                        : "--"}
                    </strong>
                  </div>
                  <div className="decision-panel__complete-stat">
                    <span>Expected gross</span>
                    <strong>
                      {auctionCompleteSummary
                        ? formatCurrency(auctionCompleteSummary.totalExpectedGross)
                        : "--"}
                    </strong>
                  </div>
                </div>
              ) : nominatedAsset ? (
                <div className="decision-panel__hero-meta">
                  <div className="decision-panel__hero-meta-copy">
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
                  <div className="decision-panel__hero-bid-guide" aria-label="Bid guide">
                    <div className="decision-panel__hero-bid-line">
                      <span>Target bid</span>
                      <span className="decision-panel__hero-bid-value">
                        <strong>{targetBidDisplay}</strong>
                        <button
                          type="button"
                          className="tooltip-hint"
                          aria-label="Target bid explanation"
                        >
                          ?
                          <span className="tooltip-content">
                            The model&apos;s normal buy price for this team based on conviction.
                            Funding pressure shows up separately in the budget-room and stoplight
                            signals.
                          </span>
                        </button>
                      </span>
                    </div>
                    <div className="decision-panel__hero-bid-line">
                      <span>Max bid</span>
                      <span className="decision-panel__hero-bid-value">
                        <strong>{maxBidDisplay}</strong>
                        <button type="button" className="tooltip-hint" aria-label="Max bid explanation">
                          ?
                          <span className="tooltip-content">
                            The highest bid the model can justify from its value model after
                            portfolio-overlap penalties. Funding pressure shows up separately in the
                            budget-room and stoplight signals.
                          </span>
                        </button>
                      </span>
                    </div>
                    <div className="decision-panel__hero-bid-line">
                      <span>Planned budget</span>
                      <span className="decision-panel__hero-bid-value">
                        <strong>{plannedBudgetAllocationDisplay}</strong>
                        <button
                          type="button"
                          className="tooltip-hint"
                          aria-label="Planned budget explanation"
                        >
                          ?
                          <span className="tooltip-content">
                            The room-scaled planned close for this team based on syndicate budget
                            expectations. This uses the same planning math as projected final pot.
                          </span>
                        </button>
                      </span>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>

            {auctionProgress.isAuctionComplete ? (
              <AuctionCompleteRootingBoard
                ownedAssets={auctionCompleteRootingGuide}
                totalAuctionAssets={auctionCompleteSummary?.totalAuctionAssets ?? 0}
                teamLookup={teamLookup}
              />
            ) : (
              <NateSilverDecisionBoard
                nominatedAsset={nominatedAsset}
                nominatedTeam={nominatedTeam}
                currentBid={currentBid}
                breakEvenStage={breakEvenStage}
                payoutRules={dashboard.session.payoutRules}
                projectedPot={projectedFinalPot}
              />
            )}
          </article>

          <article className="surface-card decision-context">
            {auctionProgress.isAuctionComplete ? (
              <>
                <div className="decision-context__overview">
                  <div className="decision-panel__callout decision-context__callout">
                    <p className="eyebrow">Closeout</p>
                    <h3>
                      {auctionCompleteSummary && auctionCompleteSummary.ownedAssets.length
                        ? "Portfolio locked in"
                        : "Auction closed without a buy"}
                    </h3>
                    <p>
                      {auctionCompleteSummary && auctionCompleteSummary.ownedAssets.length
                        ? `Mothership spent ${formatCurrency(
                            auctionCompleteSummary.totalSpend
                          )} across ${auctionCompleteSummary.ownedAssets.length} ${
                            auctionCompleteSummary.ownedAssets.length === 1
                              ? "position"
                              : "positions"
                          }. The room finished at ${formatCurrency(
                            auctionCompleteSummary.finalPot
                          )}, and the portfolio now carries ${formatPercent(
                            auctionCompleteSummary.totalTitleOdds
                          )} of the model's title equity.`
                        : `Every asset is sold and the room has moved from bidding to bracket sweat. Final room spend landed at ${formatCurrency(
                            auctionCompleteSummary?.finalPot ?? 0
                          )}.`}
                    </p>
                    {auctionCompleteSummary?.bestBargain ? (
                      <p className="call-conflict">
                        Best bargain: {auctionCompleteSummary.bestBargain.sale.asset.label} at{" "}
                        {formatCurrency(auctionCompleteSummary.bestBargain.sale.price)} for{" "}
                        {formatCurrency(auctionCompleteSummary.bestBargain.netValue)} in modeled net.
                      </p>
                    ) : null}
                  </div>

                  <div className="decision-context__summary-grid">
                    <MetricCard
                      label="Auction teams won"
                      value={
                        auctionCompleteSummary
                          ? `${auctionCompleteSummary.ownedAssets.length}/${auctionCompleteSummary.totalAuctionAssets}`
                          : "--"
                      }
                      compact
                      tooltip="How many auction assets Mothership finished with out of the full room."
                    />
                    <MetricCard
                      label="Average price paid"
                      value={
                        auctionCompleteSummary && auctionCompleteSummary.ownedAssets.length
                          ? formatCurrency(auctionCompleteSummary.averagePricePaid)
                          : "--"
                      }
                      compact
                      tooltip="Average purchase price across the auction assets Mothership won."
                    />
                    <MetricCard
                      label="Average seed held"
                      value={
                        auctionCompleteAverageSeed === null || auctionCompleteAverageSeed === undefined
                          ? "--"
                          : auctionCompleteAverageSeed.toFixed(1)
                      }
                      compact
                      tooltip="Average seed across the teams represented inside Mothership's purchased assets."
                    />
                    <MetricCard
                      label="Strongest region"
                      value={auctionCompleteRegionLabel}
                      compact
                      tooltip="The region where Mothership has the heaviest asset concentration."
                    />
                  </div>
                </div>

                <div className="decision-context__columns">
                  <section className="decision-context__section">
                    <div className="section-headline section-headline--compact">
                      <div>
                        <p className="eyebrow">Portfolio Highlights</p>
                      </div>
                    </div>
                    {auctionCompleteSummary?.ownedAssets.length ? (
                      <div className="list-stack">
                        {auctionCompleteSummary.bestBargain ? (
                          <AuctionCompleteAssetRow
                            label="Best bargain"
                            asset={auctionCompleteSummary.bestBargain.sale.asset}
                            teamLookup={teamLookup}
                            detail={`Modeled net ${formatCurrency(
                              auctionCompleteSummary.bestBargain.netValue
                            )}`}
                            value={formatCurrency(auctionCompleteSummary.bestBargain.sale.price)}
                          />
                        ) : null}
                        {auctionCompleteSummary.crownJewel ? (
                          <AuctionCompleteAssetRow
                            label="Crown jewel"
                            asset={auctionCompleteSummary.crownJewel.sale.asset}
                            teamLookup={teamLookup}
                            detail={`Highest title path on the sheet`}
                            value={formatPercent(auctionCompleteSummary.crownJewel.championProbability)}
                          />
                        ) : null}
                        {auctionCompleteSummary.topRegion ? (
                          <div className="list-row">
                            <div className="team-label">
                              <div className="team-label__copy">
                                <strong>Region stack</strong>
                                <span>{auctionCompleteSummary.topRegion.region} region leads the book</span>
                              </div>
                            </div>
                            <strong>
                              {auctionCompleteSummary.topRegion.count}{" "}
                              {auctionCompleteSummary.topRegion.count === 1 ? "asset" : "assets"}
                            </strong>
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      <p className="empty-copy">
                        No Mothership purchases were recorded in this auction.
                      </p>
                    )}
                  </section>

                  <section className="decision-context__section">
                    <div className="section-headline section-headline--compact">
                      <div>
                        <p className="eyebrow">Rooting Guide</p>
                      </div>
                    </div>
                    {auctionCompleteRootingGuide.length ? (
                      <div className="list-stack">
                        {auctionCompleteRootingGuide.map((ownedAsset) => (
                          <AuctionCompleteAssetRow
                            key={ownedAsset.sale.asset.id}
                            label="Live position"
                            asset={ownedAsset.sale.asset}
                            teamLookup={teamLookup}
                            detail={`${formatCurrency(ownedAsset.expectedGross)} expected gross`}
                            value={formatPercent(ownedAsset.championProbability)}
                            valueLabel="title odds"
                          />
                        ))}
                      </div>
                    ) : (
                      <p className="empty-copy">
                        No rooting guide to surface because Mothership finished without a position.
                      </p>
                    )}
                  </section>
                </div>
              </>
            ) : (
              <>
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
                      <p className="empty-copy">
                        Choose a team to unlock simulation-backed rationale.
                      </p>
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
              </>
            )}
          </article>

          <article className="surface-card">
            <div className="section-headline">
              <div>
                <p className="eyebrow">
                  {auctionProgress.isAuctionComplete ? "Auction Recap" : "Model Drivers"}
                </p>
                <h3>
                  {auctionProgress.isAuctionComplete
                    ? "The final board in one glance"
                    : "Visible metrics that justify the bid call"}
                </h3>
              </div>
            </div>
            <div className="metric-grid">
              {auctionProgress.isAuctionComplete ? (
                <>
                  <MetricCard
                    label="Room spend"
                    value={formatCurrency(auctionCompleteSummary?.finalPot ?? 0)}
                    tooltip="Final recorded spend across all syndicates once the auction closes."
                  />
                  <MetricCard
                    label="Mothership spend"
                    value={formatCurrency(auctionCompleteSummary?.totalSpend ?? 0)}
                    tooltip="How much Mothership committed across all of its final purchases."
                  />
                  <MetricCard
                    label="Modeled net"
                    value={
                      auctionCompleteSummary
                        ? formatCurrency(
                            auctionCompleteSummary.totalExpectedGross -
                              auctionCompleteSummary.totalSpend
                          )
                        : "--"
                    }
                    tooltip="Modeled expected gross payout minus the total amount Mothership paid."
                  />
                  <MetricCard
                    label="Sweet 16 equity"
                    value={
                      auctionCompleteSummary
                        ? formatPercent(auctionCompleteSummary.totalSweet16Odds)
                        : "--"
                    }
                    tooltip="Combined Sweet 16 reach probability across the teams inside Mothership's final portfolio."
                  />
                  <MetricCard
                    label="Crown jewel"
                    value={
                      auctionCompleteSummary?.crownJewel
                        ? auctionCompleteSummary.crownJewel.sale.asset.label
                        : "--"
                    }
                    tooltip="The purchased asset carrying the most title equity."
                  />
                  <MetricCard
                    label="Biggest room sale"
                    value={
                      auctionCompleteSummary?.roomBiggestSale
                        ? `${auctionCompleteSummary.roomBiggestSale.sale.asset.label} ${formatCurrency(
                            auctionCompleteSummary.roomBiggestSale.sale.price
                          )}`
                        : "--"
                    }
                    tooltip="The most expensive asset sold anywhere in the room."
                    longValue={Boolean(auctionCompleteSummary?.roomBiggestSale)}
                  />
                  <MetricCard
                    label="Biggest room buyer"
                    value={roomBiggestSaleBuyer ?? "--"}
                    tooltip="The syndicate that landed the room's highest-priced purchase."
                  />
                  <MetricCard
                    label="Effective share price"
                    value={
                      focusFundingImpliedSharePrice === null
                        ? "--"
                        : formatCurrency(focusFundingImpliedSharePrice)
                    }
                    tooltip="What each equivalent Mothership share implies based on current spend."
                  />
                </>
              ) : (
                <>
                  <MetricCard
                    label="Expected gross"
                    value={recommendation ? formatCurrency(recommendation.expectedGrossPayout) : "--"}
                    tooltip="Average modeled payout for this team across the simulation before subtracting what you would pay for it."
                  />
                  <MetricCard
                    label="Expected net"
                    value={recommendation ? formatCurrency(recommendation.expectedNetValue) : "--"}
                    tooltip="Expected gross minus the current bid and the model's overlap penalty for teams Mothership already owns."
                  />
                  <MetricCard
                    label="Sim confidence"
                    value={
                      recommendation
                        ? `${formatCurrency(recommendation.confidenceBand[0])}-${formatCurrency(
                            recommendation.confidenceBand[1]
                          )}`
                        : "--"
                    }
                    longValue={Boolean(recommendation)}
                    tooltip="The model's typical value range for this team. It is shown as expected payout plus or minus about one standard deviation."
                  />
                  <MetricCard
                    label="Opening bid"
                    value={recommendation ? formatCurrency(recommendation.openingBid) : "--"}
                    tooltip="A conservative first number to put on the board before the bidding settles into the target and max range."
                  />
                  <MetricCard
                    label="Target bid"
                    value={targetBidDisplay}
                    tooltip="The model's normal buy price for this team based on conviction. Funding pressure is shown separately in the budget-room and stoplight signals."
                  />
                  <MetricCard
                    label="Max bid"
                    value={maxBidDisplay}
                    tooltip="The highest bid the model can justify from its value model after portfolio-overlap penalties. Funding pressure is shown separately in the budget-room and stoplight signals."
                  />
                  <MetricCard
                    label="Base budget room"
                    value={
                      recommendation
                        ? formatCurrency(recommendation.baseBudgetHeadroom)
                        : formatCurrency(projectedBaseRoom)
                    }
                    tooltip="Room left inside Mothership's base funding plan after the current bid."
                  />
                  <MetricCard
                    label="Stretch budget room"
                    value={
                      recommendation
                        ? formatCurrency(recommendation.stretchBudgetHeadroom)
                        : formatCurrency(projectedStretchRoom)
                    }
                    tooltip="Room left if Mothership moves beyond base and into its stretch funding plan."
                  />
                  <MetricCard
                    label="Ownership penalty"
                    value={recommendation ? formatCurrency(recommendation.ownershipPenalty) : "--"}
                    tooltip="How much value the model subtracts because this team overlaps with teams Mothership already owns."
                  />
                  <MetricCard
                    label="Value gap to max"
                    value={recommendation ? formatCurrency(recommendation.valueGap) : "--"}
                    tooltip="The room left between the current bid and the model's adjusted max bid for this team. Negative means the bid is already above max."
                  />
                  <MetricCard
                    label="Portfolio concentration"
                    value={recommendation ? formatPercent(recommendation.concentrationScore) : "--"}
                    tooltip="How concentrated Mothership already is. Higher concentration means the model gets more cautious about adding more exposure."
                  />
                  <MetricCard
                    label="Effective share price"
                    value={
                      focusFundingImpliedSharePrice === null
                        ? "--"
                        : formatCurrency(focusFundingImpliedSharePrice)
                    }
                    tooltip="What each equivalent Mothership share implies based on current spend."
                  />
                  <MetricCard
                    label="Title odds"
                    value={formatPercent(titleOdds)}
                    tooltip="The simulated chance this team wins the tournament."
                  />
                </>
              )}
            </div>
          </article>
        </div>

        <aside className="operator-board-layout__side">
<OperatorSyndicateBoardCard
            holdings={operatorSyndicateHoldings}
            focusSyndicateId={dashboard.focusSyndicate.id}
            teamLookup={teamLookup}
            availableAssets={dashboard.availableAssets}
            budgetRows={dashboard.analysis.budgetRows}
            liveAssetId={selectedAssetId}
            liveBid={currentBid}
            expandedSyndicateIds={expandedSyndicateIds}
            onToggleSyndicate={onToggleSyndicate}
            onExpandAll={onExpandAll}
            onCollapseAll={onCollapseAll}
          />

          <article className="surface-card">
            <div className="section-headline">
              <div>
                <p className="eyebrow">Recent Sales</p>
                <h3>Latest auction activity</h3>
              </div>
            </div>
            {recentSales.length ? (
              <div className="list-stack">
                {recentSales.map((sale) => (
                  <AssetSaleRow
                    key={`${sale.asset.id}-${sale.price}`}
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

    </section>
  );
}

interface AuctionCompleteAssetSummary {
  sale: SoldAssetSummary;
  championProbability: number;
  finalFourProbability: number;
  sweet16Probability: number;
  expectedGross: number;
  netValue: number;
  averageSeed: number | null;
}

interface AuctionCompleteSummary {
  totalAuctionAssets: number;
  finalPot: number;
  totalSpend: number;
  averagePricePaid: number;
  totalExpectedGross: number;
  totalTitleOdds: number;
  totalFinalFourOdds: number;
  totalSweet16Odds: number;
  averageSeed: number | null;
  ownedAssets: AuctionCompleteAssetSummary[];
  bestBargain: AuctionCompleteAssetSummary | null;
  crownJewel: AuctionCompleteAssetSummary | null;
  topRegion: { region: string; count: number } | null;
  roomBiggestSale: AuctionCompleteAssetSummary | null;
}

function AuctionCompleteRootingBoard({
  ownedAssets,
  totalAuctionAssets,
  teamLookup
}: {
  ownedAssets: AuctionCompleteAssetSummary[];
  totalAuctionAssets: number;
  teamLookup: Map<string, TeamProjection>;
}) {
  return (
    <section className="nate-silver-panel">
      <div className="nate-silver-panel__header">
        <div>
          <p className="eyebrow">Rooting Guide</p>
          <h3>Where Mothership&apos;s sweat starts now that the board is closed</h3>
        </div>
        <div className="nate-silver-panel__meta">
          <span className="status-pill status-pill--muted">
            {ownedAssets.length}/{totalAuctionAssets || 0} assets held
          </span>
        </div>
      </div>

      {ownedAssets.length ? (
        <div className="list-stack">
          {ownedAssets.map((ownedAsset) => (
            <AuctionCompleteAssetRow
              key={ownedAsset.sale.asset.id}
              label="Priority sweat"
              asset={ownedAsset.sale.asset}
              teamLookup={teamLookup}
              detail={`${formatPercent(ownedAsset.finalFourProbability)} Final Four · ${formatCurrency(
                ownedAsset.expectedGross
              )} expected gross`}
              value={formatPercent(ownedAsset.championProbability)}
              valueLabel="title odds"
            />
          ))}
        </div>
      ) : (
        <p className="empty-copy">
          The board is closed, but Mothership has no open sweat in this room.
        </p>
      )}
    </section>
  );
}

function buildAuctionCompleteSummary({
  dashboard
}: {
  dashboard: AuctionDashboard;
}): AuctionCompleteSummary {
  const totalAuctionAssets = dashboard.session.auctionAssets?.length ?? 0;
  const snapshot = dashboard.session.simulationSnapshot;
  const ownedAssets = buildOwnedAuctionCompleteAssets({
    soldAssets: dashboard.soldAssets,
    focusSyndicateId: dashboard.focusSyndicate.id,
    summarizeSale: (sale) => summarizeAuctionCompleteAsset(sale, snapshot),
    compare: (left, right) =>
      right.championProbability - left.championProbability ||
      right.expectedGross - left.expectedGross
  });

  const totalSpend = ownedAssets.reduce((total, ownedAsset) => total + ownedAsset.sale.price, 0);
  const finalPot = dashboard.soldAssets.reduce((total, sale) => total + sale.price, 0);
  const totalExpectedGross = ownedAssets.reduce(
    (total, ownedAsset) => total + ownedAsset.expectedGross,
    0
  );
  const totalTitleOdds = ownedAssets.reduce(
    (total, ownedAsset) => total + ownedAsset.championProbability,
    0
  );
  const totalFinalFourOdds = ownedAssets.reduce(
    (total, ownedAsset) => total + ownedAsset.finalFourProbability,
    0
  );
  const totalSweet16Odds = ownedAssets.reduce(
    (total, ownedAsset) => total + ownedAsset.sweet16Probability,
    0
  );
  const seedValues = ownedAssets.flatMap((ownedAsset) =>
    ownedAsset.sale.asset.members.map((member) => member.seed).filter((seed) => seed !== null)
  );
  const averageSeed = seedValues.length
    ? seedValues.reduce((total, seed) => total + seed, 0) / seedValues.length
    : null;
  const roomBiggestSale =
    [...dashboard.soldAssets]
      .sort(
        (left, right) => right.price - left.price || left.asset.label.localeCompare(right.asset.label)
      )
      .map((sale) => summarizeAuctionCompleteAsset(sale, snapshot))[0] ?? null;

  return {
    totalAuctionAssets,
    finalPot,
    totalSpend,
    averagePricePaid: ownedAssets.length ? totalSpend / ownedAssets.length : 0,
    totalExpectedGross,
    totalTitleOdds,
    totalFinalFourOdds,
    totalSweet16Odds,
    averageSeed,
    ownedAssets,
    bestBargain:
      [...ownedAssets].sort(
        (left, right) => right.netValue - left.netValue || right.expectedGross - left.expectedGross
      )[0] ?? null,
    crownJewel:
      [...ownedAssets].sort(
        (left, right) =>
          right.championProbability - left.championProbability ||
          right.finalFourProbability - left.finalFourProbability
      )[0] ?? null,
    topRegion: findLeadingAuctionRegion(ownedAssets),
    roomBiggestSale
  };
}

function summarizeAuctionCompleteAsset(
  sale: SoldAssetSummary,
  snapshot: AuctionDashboard["session"]["simulationSnapshot"]
): AuctionCompleteAssetSummary {
  const teamIds = sale.asset.projectionIds;
  const simulationRows = teamIds
    .map((teamId) => snapshot?.teamResults[teamId] ?? null)
    .filter((row): row is NonNullable<typeof snapshot>["teamResults"][string] => row !== null);

  return {
    sale,
    championProbability: simulationRows.reduce(
      (total, row) => total + row.roundProbabilities.champion,
      0
    ),
    finalFourProbability: simulationRows.reduce(
      (total, row) => total + row.roundProbabilities.finalFour,
      0
    ),
    sweet16Probability: simulationRows.reduce(
      (total, row) => total + row.roundProbabilities.sweet16,
      0
    ),
    expectedGross: simulationRows.reduce((total, row) => total + row.expectedGrossPayout, 0),
    netValue:
      simulationRows.reduce((total, row) => total + row.expectedGrossPayout, 0) - sale.price,
    averageSeed: sale.asset.members.length
      ? sale.asset.members.reduce((total, member) => total + member.seed, 0) /
        sale.asset.members.length
      : null
  };
}

function OperatorSyndicateBoardCard({
  holdings,
  focusSyndicateId,
  teamLookup,
  availableAssets,
  budgetRows,
  liveAssetId,
  liveBid,
  expandedSyndicateIds,
  onToggleSyndicate,
  onExpandAll,
  onCollapseAll
}: {
  holdings: Array<{ syndicate: Syndicate; sales: SoldAssetSummary[] }>;
  focusSyndicateId: string;
  teamLookup: Map<string, TeamProjection>;
  availableAssets: AuctionAsset[];
  budgetRows: AuctionDashboard["analysis"]["budgetRows"];
  liveAssetId: string;
  liveBid: number;
  expandedSyndicateIds: string[];
  onToggleSyndicate: (syndicateId: string) => void;
  onExpandAll: () => void;
  onCollapseAll: () => void;
}) {
  const currentSpend = holdings.reduce((total, { syndicate }) => total + syndicate.spend, 0);
  const projectedFinalPot = deriveProjectedFinalPot({
    ledger: holdings.map(({ syndicate }) => syndicate),
    availableAssets,
    budgetRows,
    liveAssetId,
    liveBid
  });

  return (
    <article className="surface-card syndicate-board-card syndicate-board-card--operator">
      <div className="section-headline">
        <div>
          <p className="eyebrow">Syndicate Board</p>
          <h3>Spend and holdings</h3>
        </div>
        <div className="admin-inline-actions">
          <button type="button" className="button button-ghost button--small" onClick={onExpandAll}>
            Expand all
          </button>
          <button
            type="button"
            className="button button-ghost button--small"
            onClick={onCollapseAll}
            disabled={!expandedSyndicateIds.length}
          >
            Collapse all
          </button>
        </div>
      </div>
      <div className="syndicate-board-summary" aria-label="Room totals">
        <div className="syndicate-board-summary__item">
          <span>Current spend</span>
          <strong>{formatCurrency(currentSpend)}</strong>
        </div>
        <div className="syndicate-board-summary__item">
          <span>Projected final pot</span>
          <strong>{formatCurrency(projectedFinalPot)}</strong>
        </div>
      </div>
      <div className="syndicate-board-frame syndicate-board-frame--operator">
        <div className="syndicate-board">
          {holdings.map(({ syndicate, sales }) => {
            const isFocusSyndicate = syndicate.id === focusSyndicateId;
            const isExpanded = expandedSyndicateIds.includes(syndicate.id);

            return (
              <div
                key={syndicate.id}
                className={cn(
                  "syndicate-row syndicate-row--operator",
                  isFocusSyndicate && "syndicate-row--focus",
                  isExpanded && "syndicate-row--expanded"
                )}
              >
                <div className="syndicate-row__summary">
                  <div className="syndicate-row__title">
                    <span className="syndicate-dot" style={{ backgroundColor: syndicate.color }} />
                    <div>
                      <strong>{syndicate.name}</strong>
                      <span>
                        {sales.length} {sales.length === 1 ? "team" : "teams"} owned
                      </span>
                    </div>
                  </div>
                  <div className="syndicate-row__metric">
                    <span>Spend</span>
                    <strong>{formatCurrency(syndicate.spend)}</strong>
                  </div>
                  <div className="syndicate-row__actions">
                    {syndicate.id !== focusSyndicateId && syndicate.estimateExceeded ? (
                      <div className="syndicate-row__flag">
                        <span>Room read</span>
                        <strong>Estimate exceeded</strong>
                      </div>
                    ) : null}
                    <button
                      type="button"
                      className="syndicate-row__toggle"
                      aria-expanded={isExpanded}
                      aria-label={
                        isExpanded
                          ? `Collapse ${syndicate.name} teams`
                          : `Expand ${syndicate.name} teams`
                      }
                      onClick={() => onToggleSyndicate(syndicate.id)}
                    >
                      <span
                        className={cn(
                          "syndicate-row__chevron",
                          isExpanded && "syndicate-row__chevron--expanded"
                        )}
                        aria-hidden="true"
                      >
                        ▾
                      </span>
                    </button>
                  </div>
                </div>
                {isExpanded ? (
                  <div className="syndicate-row__details">
                    {sales.length ? (
                      <div className="syndicate-owned-list">
                        {sales.map((sale, index) => {
                          const representativeTeam =
                            teamLookup.get(sale.asset.projectionIds[0] ?? "") ?? null;
                          const subtitle =
                            formatAssetSubtitle(sale.asset, representativeTeam) ||
                            (sale.asset.type === "single_team"
                              ? formatAssetMembers(sale.asset)
                              : formatAssetMembersCompact(sale.asset));

                          return (
                            <div
                              key={`${syndicate.id}-${sale.asset.id}-${sale.price}-${index}`}
                              className="syndicate-owned-item"
                            >
                              <div className="team-label">
                                <AssetLogo asset={sale.asset} teamLookup={teamLookup} size="sm" decorative />
                                <div className="team-label__copy">
                                  <strong>{sale.asset.label}</strong>
                                  <span>{subtitle}</span>
                                </div>
                              </div>
                              <strong>{formatCurrency(sale.price)}</strong>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="empty-copy">No purchased teams yet for {syndicate.name}.</p>
                    )}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </article>
  );
}

function AssetCombobox({
  assets,
  soldAssets,
  teamLookup,
  value,
  inputRef,
  disabled,
  onChange
}: {
  assets: AuctionAsset[];
  soldAssets: SoldAssetSummary[];
  teamLookup: Map<string, TeamProjection>;
  value: string;
  inputRef: RefObject<HTMLInputElement | null>;
  disabled?: boolean;
  onChange: (assetId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [highlightIndex, setHighlightIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const soldLookup = useMemo(() => new Set(soldAssets.map((sale) => sale.asset.id)), [soldAssets]);
  const selectedAsset = useMemo(
    () => assets.find((asset) => asset.id === value) ?? null,
    [assets, value]
  );

  const sorted = useMemo(() => {
    const compareAssets = (left: AuctionAsset, right: AuctionAsset) => {
      if (left.region === right.region) {
        return (left.seedRange?.[0] ?? left.seed ?? 99) - (right.seedRange?.[0] ?? right.seed ?? 99);
      }
      return left.region.localeCompare(right.region);
    };
    const available = assets.filter((asset) => !soldLookup.has(asset.id)).sort(compareAssets);
    const sold = assets.filter((asset) => soldLookup.has(asset.id)).sort(compareAssets);
    return [...available, ...sold];
  }, [assets, soldLookup]);

  const filtered = useMemo(() => {
    if (!search.trim()) {
      return sorted;
    }
    const lower = search.toLowerCase();
    return sorted.filter(
      (asset) =>
        asset.label.toLowerCase().includes(lower) ||
        asset.region.toLowerCase().includes(lower) ||
        asset.members.some((member) => member.label.toLowerCase().includes(lower)) ||
        asset.members.some((member) => String(member.seed) === lower) ||
        (asset.seed !== null && String(asset.seed) === lower)
    );
  }, [search, sorted]);

  useEffect(() => {
    if (!open) {
      return;
    }

    function handleOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    }

    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [open]);

  function handleFocus() {
    if (disabled) {
      return;
    }

    setOpen(true);
    setSearch("");
    setHighlightIndex(0);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlightIndex((index) => Math.min(index + 1, filtered.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlightIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const asset = filtered[highlightIndex];
      if (asset && !soldLookup.has(asset.id)) {
        onChange(asset.id);
        setOpen(false);
        setSearch("");
      }
    } else if (event.key === "Escape") {
      setOpen(false);
      setSearch("");
    }
  }

  const displayValue = open ? search : selectedAsset ? selectedAsset.label : "";

  return (
    <div className="combobox" ref={containerRef}>
      <input
        ref={inputRef}
        className="combobox__input"
        value={displayValue}
        placeholder={open ? "Search teams..." : "Select a team"}
        readOnly={!open}
        disabled={disabled}
        autoComplete="off"
        onFocus={handleFocus}
        onClick={() => {
          if (!open && !disabled) {
            handleFocus();
          }
        }}
        onChange={(event) => {
          setSearch(event.target.value);
          setHighlightIndex(0);
        }}
        onKeyDown={handleKeyDown}
      />
      {open ? (
        <ul className="combobox__list">
          {filtered.length === 0 ? (
            <li className="combobox__empty">No teams found</li>
          ) : (
            filtered.map((asset, index) => {
              const sold = soldLookup.has(asset.id);
              return (
                <li
                  key={asset.id}
                  className={cn(
                    "combobox__item",
                    index === highlightIndex && "combobox__item--highlighted",
                    sold && "combobox__item--sold"
                  )}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    if (!sold) {
                      onChange(asset.id);
                      setOpen(false);
                      setSearch("");
                    }
                  }}
                  onMouseEnter={() => setHighlightIndex(index)}
                >
                  <AssetLogo
                    asset={asset}
                    teamLookup={teamLookup}
                    size="sm"
                    decorative
                    className="combobox__logo"
                  />
                  <span className="combobox__seed">{formatAssetSeed(asset)}</span>
                  <span className="combobox__name">{asset.label}</span>
                  <span className="combobox__region">{asset.region}</span>
                  {sold ? <span className="combobox__sold-badge">sold</span> : null}
                </li>
              );
            })
          )}
        </ul>
      ) : null}
    </div>
  );
}
