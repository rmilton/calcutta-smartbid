import type { FocusEvent, KeyboardEvent, RefObject } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { RoundMatchup } from "@/lib/live-room";
import {
  AuctionAsset,
  AuctionDashboard,
  BidRecommendation,
  MatchupConflict,
  SoldAssetSummary,
  Stage,
  Syndicate,
  TeamClassificationValue,
  TeamProjection
} from "@/lib/types";
import { cn, formatCurrency, formatPercent } from "@/lib/utils";
import {
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

export function OperatorAuctionWorkspace(props: OperatorAuctionWorkspaceProps) {
  const {
    dashboard,
    error,
    selectedAssetId,
    bidInputValue,
    currentBid,
    teamSelectRef,
    bidInputRef,
    onAssetChange,
    onBidInputChange,
    onBidBlur,
    onBidKeyDown,
    recommendation,
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
    focusFundingImpliedSharePrice
  } = props;

  return (
    <section className="auction-layout">
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
                      {nominatedAsset ? nominatedAsset.label : "Waiting for nomination"}
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
          </article>

          <article className="surface-card decision-context decision-context--compact">
            <div className="section-headline">
              <div>
                <p className="eyebrow">Decision Snapshot</p>
                <h3>Payback and bid guardrails</h3>
              </div>
            </div>
            <div className="decision-context__summary-grid">
              <MetricCard
                label="Payback round"
                value={formatBreakEvenStage(breakEvenStage)}
                compact
                tooltip="The earliest tournament round where modeled cumulative payout clears the current bid."
              />
              <MetricCard
                label="Wins to payback"
                value={formatBreakEvenWins(breakEvenStage)}
                compact
                tooltip="Approximate number of wins needed from here to hit the payback round."
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
          <article className="surface-card control-panel auction-controls auction-controls--compact">
            <div className="auction-controls__headline-simple">
              <p className="eyebrow">Live Bid Entry</p>
            </div>
            <div className="auction-controls__bar auction-controls__bar--compact">
              <label className="field-shell field-shell--accent auction-controls__field auction-controls__field--team">
                <span>Team name</span>
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
                <span>Bid amount</span>
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
            </div>
            {error ? <p className="error-text">{error}</p> : null}
          </article>

          <article className="surface-card">
            <div className="section-headline">
              <div>
                <p className="eyebrow">Ownership Conflicts</p>
                <h3>Where current holdings collide</h3>
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
          </article>

          <article className="surface-card">
            <div className="section-headline">
              <div>
                <p className="eyebrow">Live Room</p>
                <h3>At-a-glance status</h3>
              </div>
            </div>
            <div className="mini-grid">
              <MetricCard
                label="Mothership spend"
                value={formatCurrency(dashboard.focusSyndicate.spend)}
                compact
              />
              <MetricCard
                label="Sold teams"
                value={`${dashboard.soldAssets.length}`}
                compact
              />
              <MetricCard
                label="Base room now"
                value={formatCurrency(projectedBaseRoom)}
                compact
              />
              <MetricCard
                label="Stretch room now"
                value={formatCurrency(projectedStretchRoom)}
                compact
              />
            </div>
          </article>

          <OperatorSyndicateBoardCard
            holdings={operatorSyndicateHoldings}
            focusSyndicateId={dashboard.focusSyndicate.id}
            teamLookup={teamLookup}
            expandedSyndicateIds={expandedSyndicateIds}
            onToggleSyndicate={onToggleSyndicate}
            onExpandAll={onExpandAll}
            onCollapseAll={onCollapseAll}
          />
        </aside>
      </section>
    </section>
  );
}

function formatBreakEvenWins(stage: Stage | "negativeReturn" | null) {
  if (stage === null) {
    return "--";
  }

  if (stage === "negativeReturn") {
    return "No path";
  }

  const winsByStage: Record<Stage, number> = {
    roundOf64: 1,
    roundOf32: 2,
    sweet16: 3,
    elite8: 4,
    finalFour: 5,
    champion: 6
  };
  const wins = winsByStage[stage];
  return `${wins} win${wins === 1 ? "" : "s"}`;
}

function OperatorSyndicateBoardCard({
  holdings,
  focusSyndicateId,
  teamLookup,
  expandedSyndicateIds,
  onToggleSyndicate,
  onExpandAll,
  onCollapseAll
}: {
  holdings: Array<{ syndicate: Syndicate; sales: SoldAssetSummary[] }>;
  focusSyndicateId: string;
  teamLookup: Map<string, TeamProjection>;
  expandedSyndicateIds: string[];
  onToggleSyndicate: (syndicateId: string) => void;
  onExpandAll: () => void;
  onCollapseAll: () => void;
}) {
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
