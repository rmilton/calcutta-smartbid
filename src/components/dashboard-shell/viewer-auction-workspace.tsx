import { deriveMothershipFundingSnapshot, deriveFundingStatus } from "@/lib/funding";
import { RoundMatchup, ViewerOwnershipGroup } from "@/lib/live-room";
import {
  AuctionDashboard,
  BidRecommendation,
  SoldAssetSummary,
  Syndicate
} from "@/lib/types";
import { cn, formatCurrency, formatPercent } from "@/lib/utils";
import {
  MetricCard,
  formatAssetMembers,
  formatAssetSubtitle
} from "@/components/dashboard-shell/shared";
import { TeamClassificationBadge } from "@/components/team-classification-badge";

interface ViewerAuctionWorkspaceProps {
  dashboard: AuctionDashboard;
  recommendation: BidRecommendation | null;
  stoplightLabels: Record<BidRecommendation["stoplight"], string>;
  fundingStatusLabels: Record<BidRecommendation["fundingStatus"], string>;
  nominatedMatchup: RoundMatchup | null;
  likelyRound2Matchup: RoundMatchup | null;
  hasOwnedRoundOneOpponent: boolean;
  hasOwnedLikelyRoundTwoOpponent: boolean;
  forcedPassConflictName: string | null;
  ownershipSearch: string;
  onOwnershipSearchChange: (value: string) => void;
  ownershipGroups: ViewerOwnershipGroup[];
  soldFeed: SoldAssetSummary[];
}

export function ViewerAuctionWorkspace({
  dashboard,
  recommendation,
  stoplightLabels,
  fundingStatusLabels,
  nominatedMatchup,
  likelyRound2Matchup,
  hasOwnedRoundOneOpponent,
  hasOwnedLikelyRoundTwoOpponent,
  forcedPassConflictName,
  ownershipSearch,
  onOwnershipSearchChange,
  ownershipGroups,
  soldFeed
}: ViewerAuctionWorkspaceProps) {
  const nominatedAsset = dashboard.nominatedAsset;
  const nominatedTeam = dashboard.nominatedTeam;
  const nominatedTeamNote =
    (nominatedTeam && dashboard.session.teamNotes[nominatedTeam.id]?.note) || null;
  const viewerTargetMaxDisplay = recommendation
    ? recommendation.forcedPassConflictTeamId
      ? "Pass"
      : `${formatCurrency(recommendation.targetBid)} / ${formatCurrency(recommendation.maxBid)}`
    : "--";
  const focusFunding = deriveMothershipFundingSnapshot(
    dashboard.session.mothershipFunding,
    dashboard.focusSyndicate.spend
  );

  return (
    <section className="viewer-layout">
      <section className="decision-grid">
        <article className="surface-card viewer-board viewer-board--spotlight">
          <p className="eyebrow">Live Decision Board</p>
          <div className="viewer-bid-hero viewer-bid-hero--team">
            <div className="viewer-bid-hero__pulse">
              <span className="pulse-dot" />
              <span>{nominatedAsset ? "Active team" : "Awaiting nomination"}</span>
            </div>
            <strong className={cn(!nominatedAsset && "viewer-bid-hero__title--waiting")}>
              {nominatedAsset ? nominatedAsset.label : "Waiting for next team"}
            </strong>
            <p className="viewer-board__subcopy">
              {nominatedAsset
                ? formatAssetSubtitle(nominatedAsset, nominatedTeam)
                : "The next active team will take over this board as soon as the operator makes a nomination."}
            </p>
            {nominatedMatchup ? (
              <p className="viewer-board__matchup">
                Round 1 Matchup: {nominatedMatchup.opponent.seed}-seed{" "}
                {nominatedMatchup.opponent.name}
                {hasOwnedRoundOneOpponent ? (
                  <span className="viewer-board__matchup-owned">you own</span>
                ) : null}
              </p>
            ) : null}
            {likelyRound2Matchup ? (
              <p className="viewer-board__path">
                Most likely Round 2: {likelyRound2Matchup.opponent.seed}-seed{" "}
                {likelyRound2Matchup.opponent.name} (
                {formatPercent(likelyRound2Matchup.probability ?? 0)})
                {hasOwnedLikelyRoundTwoOpponent ? (
                  <span className="viewer-board__matchup-owned">you own</span>
                ) : null}
              </p>
            ) : null}
            {nominatedAsset ? <p className="viewer-note">{formatAssetMembers(nominatedAsset)}</p> : null}
            {nominatedTeam &&
            dashboard.session.teamClassifications[nominatedTeam.id]?.classification ? (
              <div className="viewer-bid-hero__classification">
                <TeamClassificationBadge
                  classification={dashboard.session.teamClassifications[nominatedTeam.id].classification}
                />
              </div>
            ) : null}
            {nominatedTeamNote ? <p className="viewer-note">{nominatedTeamNote}</p> : null}
          </div>

          <div className="viewer-board__call">
            <p className="eyebrow">Call</p>
            <h3>
              {recommendation
                ? recommendation.forcedPassConflictTeamId
                  ? "Pass"
                  : recommendation.stoplight === "buy"
                    ? `Bid through ${formatCurrency(recommendation.targetBid)}`
                    : recommendation.stoplight === "caution"
                      ? `Hold the line at ${formatCurrency(recommendation.maxBid)}`
                      : `Pass above ${formatCurrency(recommendation.maxBid)}`
                : "Waiting for the next nomination"}
            </h3>
            <p>
              {recommendation
                ? recommendation.forcedPassConflictTeamId
                  ? `Round 1 is against ${forcedPassConflictName}, which Mothership already owns.`
                  : fundingStatusLabels[recommendation.fundingStatus]
                : "The operator's live recommendation will appear here when a team is active."}
            </p>
          </div>

          <div className="metric-grid viewer-board__metrics">
            <MetricCard
              label="Target / max"
              value={viewerTargetMaxDisplay}
              longValue={Boolean(recommendation)}
            />
            <MetricCard
              label="Stoplight"
              value={recommendation ? stoplightLabels[recommendation.stoplight] : "Idle"}
            />
            <MetricCard
              label="Funding status"
              value={
                recommendation
                  ? fundingStatusLabels[recommendation.fundingStatus]
                  : fundingStatusLabels[
                      deriveFundingStatus(
                        dashboard.focusSyndicate.spend,
                        dashboard.session.mothershipFunding
                      )
                    ]
              }
            />
            <MetricCard
              label="Effective share price"
              value={
                focusFunding.impliedSharePrice === null
                  ? "--"
                  : formatCurrency(focusFunding.impliedSharePrice)
              }
            />
            <MetricCard label="Teams remaining to sell" value={`${dashboard.availableAssets.length}`} />
            <MetricCard
              label="Underlying teams remaining"
              value={`${dashboard.availableTeams.length}`}
            />
            <MetricCard
              label="Mothership total spent"
              value={formatCurrency(dashboard.focusSyndicate.spend)}
            />
          </div>
        </article>

        <SyndicateBoardCard
          syndicates={[
            dashboard.focusSyndicate,
            ...dashboard.ledger.filter((syndicate) => syndicate.id !== dashboard.focusSyndicate.id)
          ]}
          focusSyndicateId={dashboard.focusSyndicate.id}
          focusFunding={focusFunding}
        />
      </section>

      <section className="detail-grid detail-grid--balanced">
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

        <aside className="viewer-layout__side">
          {recommendation ? (
            <article className="surface-card viewer-guidance-card">
              <div className="section-headline">
                <div>
                  <p className="eyebrow">Live Guidance</p>
                  <h3>What Mothership should keep in view</h3>
                </div>
              </div>
              <div className="list-stack">
                {recommendation.rationale.slice(0, 3).map((line) => (
                  <div key={line} className="list-line">
                    {line}
                  </div>
                ))}
              </div>
            </article>
          ) : null}

          <article className="surface-card">
            <div className="section-headline">
              <div>
                <p className="eyebrow">Sold Teams</p>
                <h3>Most recent sales first</h3>
              </div>
            </div>
            {soldFeed.length ? (
              <div className="list-stack">
                {soldFeed.map((sale) => (
                  <ViewerSoldAssetRow
                    key={`${sale.asset.id}-${sale.price}-${sale.buyerSyndicateId}`}
                    sale={sale}
                    buyerName={
                      dashboard.ledger.find((syndicate) => syndicate.id === sale.buyerSyndicateId)
                        ?.name ?? sale.buyerSyndicateId
                    }
                  />
                ))}
              </div>
            ) : (
              <p className="empty-copy">No teams have sold yet.</p>
            )}
          </article>
        </aside>
      </section>
    </section>
  );
}

function SyndicateBoardCard({
  syndicates,
  focusSyndicateId,
  focusFunding
}: {
  syndicates: Syndicate[];
  focusSyndicateId: string;
  focusFunding: ReturnType<typeof deriveMothershipFundingSnapshot>;
}) {
  return (
    <article className="surface-card syndicate-board-card">
      <div className="section-headline">
        <div>
          <p className="eyebrow">Syndicate Board</p>
          <h3>Spend, room, and EV</h3>
        </div>
      </div>
      <div className="syndicate-board-frame">
        <div className="syndicate-board">
          {syndicates.map((syndicate) => {
            const isFocusSyndicate = syndicate.id === focusSyndicateId;

            return (
              <div
                key={syndicate.id}
                className={cn(
                  "syndicate-row syndicate-row--compact",
                  isFocusSyndicate && "syndicate-row--focus"
                )}
              >
                <div className="syndicate-row__title">
                  <span className="syndicate-dot" style={{ backgroundColor: syndicate.color }} />
                  <div>
                    <strong>{syndicate.name}</strong>
                    <span>{syndicate.ownedTeamIds.length} teams owned</span>
                  </div>
                </div>
                <div>
                  <span>Spend</span>
                  <strong>{formatCurrency(syndicate.spend)}</strong>
                </div>
                <div>
                  <span>{isFocusSyndicate ? "Base room" : "Est. room"}</span>
                  <strong>
                    {formatCurrency(
                      isFocusSyndicate
                        ? focusFunding.baseBidRoom
                        : syndicate.estimatedRemainingBudget
                    )}
                  </strong>
                </div>
                <div>
                  <span>{isFocusSyndicate ? "Portfolio EV" : "Est. budget"}</span>
                  <strong>
                    {formatCurrency(
                      isFocusSyndicate
                        ? syndicate.portfolioExpectedValue
                        : syndicate.estimatedBudget
                    )}
                  </strong>
                </div>
                {syndicate.id !== focusSyndicateId && syndicate.estimateExceeded ? (
                  <div className="syndicate-row__flag">
                    <span>Room read</span>
                    <strong>Estimate exceeded</strong>
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

function ViewerSoldAssetRow({
  sale,
  buyerName
}: {
  sale: SoldAssetSummary;
  buyerName: string;
}) {
  return (
    <div className="list-row">
      <div>
        <strong>{sale.asset.label}</strong>
        <span>{formatAssetMembers(sale.asset)}</span>
        <span>To {buyerName}</span>
      </div>
      <strong>{formatCurrency(sale.price)}</strong>
    </div>
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
