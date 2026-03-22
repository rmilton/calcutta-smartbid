import React from "react";
import { MothershipAssetResult, MothershipPortfolioResults, Stage } from "@/lib/types";
import { cn, formatCurrency, formatPercent, formatSharePrice } from "@/lib/utils";
import { TeamLogo } from "@/components/team-logo";

function formatNextGame(isoDate: string | null, network: string | null): string {
  if (!isoDate && !network) return "TBD";

  if (!isoDate) {
    return network ?? "TBD";
  }

  const date = new Date(isoDate);
  const formatted = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZoneName: "short"
  }).format(date);

  return network ? `${formatted} · ${network}` : formatted;
}

const STAGE_LABELS: Record<Stage, string> = {
  roundOf64: "R64",
  roundOf32: "R32",
  sweet16: "S16",
  elite8: "E8",
  finalFour: "F4",
  champion: "🏆"
};

const STAGE_ORDER: Stage[] = [
  "roundOf64",
  "roundOf32",
  "sweet16",
  "elite8",
  "finalFour",
  "champion"
];

interface RoundPillProps {
  stage: Stage;
  status: "won" | "alive" | "not-reached" | "eliminated-before";
}

function RoundPill({ stage, status }: RoundPillProps) {
  return (
    <span
      className={cn("tournament-round-pill", `tournament-round-pill--${status}`)}
      title={
        status === "won"
          ? `Won ${STAGE_LABELS[stage]}`
          : status === "alive"
            ? `Still alive — ${STAGE_LABELS[stage]} TBD`
            : status === "not-reached"
              ? `Did not reach ${STAGE_LABELS[stage]}`
              : `Eliminated before ${STAGE_LABELS[stage]}`
      }
    >
      {STAGE_LABELS[stage]}
    </span>
  );
}

function getRoundPillStatus(
  stage: Stage,
  roundsWon: Stage[],
  isEliminated: boolean,
  isStillAlive: boolean
): RoundPillProps["status"] {
  const stageIdx = STAGE_ORDER.indexOf(stage);
  const maxWonIdx = roundsWon.reduce((max, s) => Math.max(max, STAGE_ORDER.indexOf(s)), -1);

  if (roundsWon.includes(stage)) return "won";

  if (isEliminated) {
    // Eliminated: rounds beyond the last won are "not-reached"
    if (stageIdx > maxWonIdx + 1) return "not-reached";
    return "eliminated-before";
  }

  if (isStillAlive) {
    // Still alive: next round is "alive", rest are "not-reached"
    if (stageIdx === maxWonIdx + 1) return "alive";
    if (stageIdx > maxWonIdx + 1) return "not-reached";
  }

  return "not-reached";
}

interface AssetRowProps {
  asset: MothershipAssetResult;
  showTeamLogo: boolean;
}

function AssetRow({ asset, showTeamLogo }: AssetRowProps) {
  const netPositive = asset.netPerShare > 0;
  const netNeutral = asset.netPerShare === 0;
  const showBreakEven =
    asset.isStillAlive &&
    !netPositive &&
    asset.breakEvenStage !== null &&
    asset.breakEvenStage !== "negativeReturn";
  const hasNextGame = asset.isStillAlive && (asset.nextGameIsoDate ?? asset.nextGameNetwork ?? asset.nextGameOpponentId);

  return (
    <div className="tournament-tracker__asset-row">
      <div className="tournament-tracker__asset-identity">
        {showTeamLogo && asset.teamId ? (
          <div className="tournament-tracker__logo">
            <TeamLogo teamId={asset.teamId} teamName={asset.teamName ?? ""} size="sm" />
          </div>
        ) : null}
        <div className="tournament-tracker__asset-name-block">
          <span className="tournament-tracker__asset-name">{asset.assetLabel}</span>
          {asset.seed !== null ? (
            <span className="tournament-tracker__asset-meta">
              {asset.region} · #{asset.seed}
            </span>
          ) : asset.isGrouped ? (
            <span className="tournament-tracker__asset-meta">
              {asset.region} · {asset.teamCount} teams
            </span>
          ) : null}
        </div>
      </div>

      <div className="tournament-tracker__next-game-col">
        {hasNextGame ? (
          <>
            <span className="tournament-tracker__next-game-broadcast">
              {formatNextGame(asset.nextGameIsoDate, asset.nextGameNetwork)}
            </span>
            {asset.nextGameOpponentId ? (
              <span className="tournament-tracker__next-game-opponent">
                <TeamLogo teamId={asset.nextGameOpponentId} teamName={asset.nextGameOpponentName ?? ""} size="xs" />
                <span className="tournament-tracker__next-game-opponent-name">{asset.nextGameOpponentName}</span>
              </span>
            ) : null}
          </>
        ) : (
          <span className="tournament-tracker__next-game-broadcast tournament-tracker__next-game-broadcast--empty">
            {asset.isEliminated ? "—" : "TBD"}
          </span>
        )}
      </div>

      <div className="tournament-tracker__spend-col">
        <span className="tournament-tracker__stat-value">{formatPercent(asset.percentOfSpend / 100)}</span>
      </div>

      <div className="tournament-tracker__cost-col">
        <span className="tournament-tracker__stat-value">{formatCurrency(asset.costPerShare)}</span>
      </div>

      <div className="tournament-tracker__rounds-col">
        {STAGE_ORDER.map((stage) => (
          <React.Fragment key={stage}>
            {showBreakEven && stage === asset.breakEvenStage && (
              <span className="tournament-tracker__break-even-marker" title="Net positive from here" />
            )}
            <RoundPill
              stage={stage}
              status={getRoundPillStatus(stage, asset.roundsWon, asset.isEliminated, asset.isStillAlive)}
            />
          </React.Fragment>
        ))}
      </div>

      <div className="tournament-tracker__return-col">
        <span className="tournament-tracker__stat-value">
          {asset.realizedPayout > 0 ? formatCurrency(asset.returnPerShare) : "—"}
        </span>
      </div>

      <div className="tournament-tracker__net-col">
        <span
          className={cn(
            "tournament-tracker__net-value",
            netPositive && "tournament-tracker__net-value--positive",
            !netPositive && !netNeutral && "tournament-tracker__net-value--negative"
          )}
        >
          {asset.netPerShare === 0
            ? "—"
            : `${asset.netPerShare > 0 ? "+" : ""}${formatCurrency(asset.netPerShare)}`}
        </span>
      </div>
    </div>
  );
}

interface TournamentTrackerProps {
  results: MothershipPortfolioResults;
}

export function TournamentTracker({ results }: TournamentTrackerProps) {
  const netPositive = results.currentNetPerShare > 0;
  const netNeutral = results.currentNetPerShare === 0;
  const returnPct =
    results.costBasisPerShare > 0
      ? results.currentReturnPerShare / results.costBasisPerShare
      : 0;

  return (
    <section className="tournament-tracker surface-card">
      <div className="section-headline">
        <div>
          <p className="eyebrow">Live Tournament</p>
          <h3>Mothership Portfolio Tracker</h3>
        </div>
        {results.equivalentShares > 0 ? (
          <span className="tournament-tracker__share-badge">
            {results.equivalentShares} equivalent shares
          </span>
        ) : null}
      </div>

      {/* Share value summary */}
      <div className="tournament-tracker__summary-grid">
        <div className="tournament-tracker__summary-stat">
          <span className="insight-label">Cost basis / share</span>
          <strong className="tournament-tracker__summary-value">
            {formatSharePrice(results.costBasisPerShare)}
          </strong>
        </div>
        <div className="tournament-tracker__summary-stat">
          <span className="insight-label">Cost basis / half share</span>
          <strong className="tournament-tracker__summary-value">
            {formatSharePrice(results.costBasisPerShare / 2)}
          </strong>
        </div>
        <div className="tournament-tracker__summary-stat">
          <span className="insight-label">Current return / share</span>
          <strong className="tournament-tracker__summary-value">
            {results.currentReturnPerShare > 0
              ? formatCurrency(Math.round(results.currentReturnPerShare))
              : "—"}
          </strong>
        </div>
        <div className="tournament-tracker__summary-stat">
          <span className="insight-label">Net / share</span>
          <strong
            className={cn(
              "tournament-tracker__summary-value",
              netPositive && "tournament-tracker__net-value--positive",
              !netPositive && !netNeutral && "tournament-tracker__net-value--negative"
            )}
          >
            {results.currentNetPerShare === 0
              ? "—"
              : `${results.currentNetPerShare > 0 ? "+" : ""}${formatCurrency(results.currentNetPerShare)}`}
          </strong>
        </div>
        <div className="tournament-tracker__summary-stat">
          <span className="insight-label">Net return</span>
          <strong
            className={cn(
              "tournament-tracker__summary-value",
              netPositive && "tournament-tracker__net-value--positive",
              !netPositive && !netNeutral && "tournament-tracker__net-value--negative"
            )}
          >
            {results.totalCost > 0
              ? `${results.netPnL >= 0 ? "+" : ""}${Math.round((results.netPnL / results.totalCost) * 100)}%`
              : "—"}
          </strong>
        </div>
      </div>

      {/* Column headers */}
      <div className="tournament-tracker__header-row">
        <div className="tournament-tracker__asset-identity">
          <span className="tournament-tracker__col-label">Team</span>
        </div>
        <div className="tournament-tracker__next-game-col">
          <span className="tournament-tracker__col-label">Next Game</span>
        </div>
        <div className="tournament-tracker__spend-col">
          <span className="tournament-tracker__col-label">% Spend</span>
        </div>
        <div className="tournament-tracker__cost-col">
          <span className="tournament-tracker__col-label">Cost / sh</span>
        </div>
        <div className="tournament-tracker__rounds-col">
          <span className="tournament-tracker__col-label">Tournament progress</span>
        </div>
        <div className="tournament-tracker__return-col">
          <span className="tournament-tracker__col-label">Return / sh</span>
        </div>
        <div className="tournament-tracker__net-col">
          <span className="tournament-tracker__col-label">Net / sh</span>
        </div>
      </div>

      {/* Asset rows */}
      <div className="tournament-tracker__asset-list">
        {results.assets.map((asset) => (
          <AssetRow
            key={asset.assetId}
            asset={asset}
            showTeamLogo={!asset.isGrouped}
          />
        ))}
      </div>

      {/* Totals row */}
      <div className="tournament-tracker__totals-row">
        <div className="tournament-tracker__asset-identity">
          <span className="tournament-tracker__col-label">Total</span>
        </div>
        <div className="tournament-tracker__next-game-col" />
        <div className="tournament-tracker__spend-col">
          <span className="tournament-tracker__stat-value">100%</span>
        </div>
        <div className="tournament-tracker__cost-col">
          <span className="tournament-tracker__stat-value">
            ~{formatCurrency(results.costBasisPerShare)}
          </span>
        </div>
        <div className="tournament-tracker__rounds-col" />
        <div className="tournament-tracker__return-col">
          <span className="tournament-tracker__stat-value">
            {results.currentReturnPerShare > 0
              ? formatCurrency(results.currentReturnPerShare)
              : "—"}
          </span>
        </div>
        <div className="tournament-tracker__net-col">
          <span
            className={cn(
              "tournament-tracker__net-value",
              netPositive && "tournament-tracker__net-value--positive",
              !netPositive && !netNeutral && "tournament-tracker__net-value--negative"
            )}
          >
            {results.currentNetPerShare === 0
              ? "—"
              : `${results.currentNetPerShare > 0 ? "+" : ""}${formatCurrency(results.currentNetPerShare)}`}
          </span>
        </div>
      </div>

      {/* Reserved space for future all-syndicates section */}
      <div className="tournament-tracker__expansion-anchor" />
    </section>
  );
}
