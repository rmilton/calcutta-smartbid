import type { FocusEvent, KeyboardEvent, RefObject } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { RoundMatchup } from "@/lib/live-room";
import { getCumulativeStagePayouts } from "@/lib/payouts";
import {
  AuctionAsset,
  AuctionDashboard,
  BidRecommendation,
  MatchupConflict,
  NateSilverProjection,
  SoldAssetSummary,
  Stage,
  Syndicate,
  TeamClassificationValue,
  TeamProjection
} from "@/lib/types";
import { cn, formatCurrency, formatPercent } from "@/lib/utils";
import {
  AssetSaleRow,
  ConflictRow,
  MetricCard,
  formatAssetMembers,
  formatAssetMembersCompact,
  formatAssetSeed,
  formatAssetSubtitle,
  formatBreakEvenStage
} from "@/components/dashboard-shell/shared";
import { AssetLogo } from "@/components/team-logo";
import { TeamClassificationBadge } from "@/components/team-classification-badge";

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
  teamSelectRef: RefObject<HTMLInputElement | null>;
  bidInputRef: RefObject<HTMLInputElement | null>;
  onAssetChange: (nextAssetId: string) => void;
  onBidInputChange: (nextValue: string) => void;
  onBidBlur: (event: FocusEvent<HTMLInputElement>) => void;
  onBidKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  onBuyerChange: (buyerId: string) => void;
  onUndoPurchase: () => void;
  onRecordPurchase: () => void;
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

type OperatorNateSilverColumn = {
  key: "roundOf32" | "sweet16" | "elite8" | "finalFour" | "championshipGame" | "champion";
  label: string;
  payoutStage: Stage;
  note?: string;
};

const operatorNateSilverColumns: readonly OperatorNateSilverColumn[] = [
  {
    key: "roundOf32",
    label: "Round of 32",
    payoutStage: "roundOf64"
  },
  {
    key: "sweet16",
    label: "Sweet 16",
    payoutStage: "roundOf32"
  },
  {
    key: "elite8",
    label: "Elite 8",
    payoutStage: "sweet16"
  },
  {
    key: "finalFour",
    label: "Final Four",
    payoutStage: "elite8"
  },
  {
    key: "championshipGame",
    label: "Championship",
    payoutStage: "finalFour"
  },
  {
    key: "champion",
    label: "Champion",
    payoutStage: "champion"
  }
] as const;

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
    teamSelectRef,
    bidInputRef,
    onAssetChange,
    onBidInputChange,
    onBidBlur,
    onBidKeyDown,
    onBuyerChange,
    onUndoPurchase,
    onRecordPurchase,
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

  return (
    <section className="auction-layout">
      <article className="surface-card control-panel auction-controls">
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
              disabled={!dashboard.lastPurchase || isUndoingPurchase}
              onClick={onUndoPurchase}
            >
              {isUndoingPurchase ? "Undoing..." : "Undo last purchase"}
            </button>
          </div>

          <button
            type="button"
            className="button button-accent auction-controls__purchase"
            data-live-bid-blur-ignore="true"
            disabled={parsedBidInputValue <= 0 || !selectedAssetId}
            onClick={onRecordPurchase}
          >
            Record purchase
          </button>
        </div>

        {notice ? <p className="notice-text">{notice}</p> : null}
        {error ? <p className="error-text">{error}</p> : null}
      </article>

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
                        : "Set an active team to unlock bid guidance."}
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
                        The live price currently on the board for this team. Break-even, funding
                        status, and recommendation context all update against this number.
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

            <NateSilverDecisionBoard
              nominatedAsset={nominatedAsset}
              nominatedTeam={nominatedTeam}
              currentBid={currentBid}
              breakEvenStage={breakEvenStage}
              payoutRules={dashboard.session.payoutRules}
            />
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
                  tooltip="The model's normal buy price for this team based on conviction and Mothership's remaining base-plan buying room."
                />
                <MetricCard
                  label="Max bid"
                  value={maxBidDisplay}
                  compact
                  tooltip="The highest bid the model can justify after stretch funding room and portfolio overlap penalties are applied."
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

          <article className="surface-card">
            <div className="section-headline">
              <div>
                <p className="eyebrow">Model Drivers</p>
                <h3>Visible metrics that justify the bid call</h3>
              </div>
            </div>
            <div className="metric-grid">
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

function NateSilverDecisionBoard({
  nominatedAsset,
  nominatedTeam,
  currentBid,
  breakEvenStage,
  payoutRules
}: {
  nominatedAsset: AuctionAsset | null;
  nominatedTeam: TeamProjection | null;
  currentBid: number;
  breakEvenStage: Stage | "negativeReturn" | null;
  payoutRules: AuctionDashboard["session"]["payoutRules"];
}) {
  const nateSilver = nominatedTeam?.nateSilverProjection ?? null;
  const hasNateSilverProjection = operatorNateSilverColumns.some(
    ({ key }) => getNateSilverProbability(nateSilver, key) !== null
  );
  const payoutLookup = useMemo(
    () =>
      new Map(getCumulativeStagePayouts(payoutRules).map(({ stage, payout }) => [stage, payout])),
    [payoutRules]
  );
  const breakEvenLabel =
    breakEvenStage === null
      ? "Awaiting bid"
      : breakEvenStage === "negativeReturn"
        ? "Above modeled return"
        : `Clears by ${formatBreakEvenStage(breakEvenStage)}`;
  const isSingleTeamAsset = nominatedAsset?.type === "single_team";

  return (
    <section className="operator-nate-silver-panel">
      <div className="operator-nate-silver-panel__header">
        <div>
          <p className="eyebrow">Nate Silver Path</p>
          <h3>Round return odds against the projected pot</h3>
        </div>
        <div className="operator-nate-silver-panel__meta">
          <span className="status-pill status-pill--muted">{breakEvenLabel}</span>
        </div>
      </div>

      {!nominatedTeam ? (
        <p className="empty-copy">
          Select an active team to unlock the Nate Silver round board.
        </p>
      ) : !isSingleTeamAsset ? (
        <p className="empty-copy">
          Nate Silver round odds are shown for single-team nominations. Bundle and play-in
          packages still use the main recommendation model above.
        </p>
      ) : !hasNateSilverProjection ? (
        <p className="empty-copy">
          Nate Silver round data is not loaded for this team yet. Import analysis data with the
          Nate Silver columns to populate this board.
        </p>
      ) : (
        <>
          <div className="operator-nate-silver-board" aria-label="Nate Silver round reach board">
            {operatorNateSilverColumns.map(({ key, label, payoutStage, note }) => {
              const probability = getNateSilverProbability(nateSilver, key);
              const payoutValue = payoutLookup.get(payoutStage) ?? null;
              const clearsBid = payoutValue !== null && payoutValue >= currentBid;

              return (
                <article
                  key={key}
                  className={cn(
                    "operator-nate-silver-board__cell",
                    clearsBid && "operator-nate-silver-board__cell--clears-bid"
                  )}
                >
                  <div className="operator-nate-silver-board__topline">
                    <span className="operator-nate-silver-board__label">{label}</span>
                  </div>
                  <strong className="operator-nate-silver-board__probability">
                    {probability === null ? "--" : formatPercent(probability)}
                  </strong>
                  <div className="operator-nate-silver-board__metric">
                    <span>Payout if reached</span>
                    <strong>{payoutValue === null ? "--" : formatCurrency(payoutValue)}</strong>
                  </div>
                  {note ? <p className="operator-nate-silver-board__note">{note}</p> : null}
                </article>
              );
            })}
          </div>

          <p className="operator-nate-silver-panel__footnote">
            Payout values are aligned to the round that unlocks the payout. Reaching the Round of 32
            triggers the first payout, Sweet 16 triggers the next, and so on.
          </p>
        </>
      )}
    </section>
  );
}

function getNateSilverProbability(projection: NateSilverProjection | null, key: OperatorNateSilverColumn["key"]) {
  if (!projection) {
    return null;
  }

  switch (key) {
    case "roundOf32":
      return projection.roundOf32;
    case "sweet16":
      return projection.sweet16;
    case "elite8":
      return projection.elite8;
    case "finalFour":
      return projection.finalFour;
    case "championshipGame":
      return projection.championshipGame;
    case "champion":
      return projection.champion;
    default:
      return null;
  }
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
  const budgetLookup = new Map(budgetRows.map((row) => [row.teamId, row]));
  const projectedRemainingSpend = availableAssets.reduce((total, asset) => {
    const estimatedClosePrice = asset.projectionIds.reduce(
      (assetTotal, projectionId) => assetTotal + (budgetLookup.get(projectionId)?.targetBid ?? 0),
      0
    );
    const liveBidFloor = asset.id === liveAssetId ? liveBid : 0;

    return total + Math.max(liveBidFloor, estimatedClosePrice);
  }, 0);
  const projectedFinalPot = currentSpend + projectedRemainingSpend;

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
  onChange
}: {
  assets: AuctionAsset[];
  soldAssets: SoldAssetSummary[];
  teamLookup: Map<string, TeamProjection>;
  value: string;
  inputRef: RefObject<HTMLInputElement | null>;
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
        autoComplete="off"
        onFocus={handleFocus}
        onClick={() => {
          if (!open) {
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
