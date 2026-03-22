"use client";

import React, { useState } from "react";
import { CalcuttaSyndicateResult, CalcuttaTeamResult, Stage } from "@/lib/types";
import { cn, formatCurrency } from "@/lib/utils";

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

function getRoundPillStatus(
  stage: Stage,
  roundsWon: Stage[],
  isEliminated: boolean,
  isStillAlive: boolean
): "won" | "alive" | "not-reached" | "eliminated-before" {
  const stageIdx = STAGE_ORDER.indexOf(stage);
  const maxWonIdx = roundsWon.reduce((max, s) => Math.max(max, STAGE_ORDER.indexOf(s)), -1);

  if (roundsWon.includes(stage)) return "won";
  if (isEliminated) {
    if (stageIdx > maxWonIdx + 1) return "not-reached";
    return "eliminated-before";
  }
  if (isStillAlive) {
    if (stageIdx === maxWonIdx + 1) return "alive";
    if (stageIdx > maxWonIdx + 1) return "not-reached";
  }
  return "not-reached";
}

function RankBadge({ rank }: { rank: number }) {
  return (
    <span
      className={cn(
        "calcutta-standings__rank-badge",
        rank === 1 && "calcutta-standings__rank-badge--gold",
        rank === 2 && "calcutta-standings__rank-badge--silver",
        rank === 3 && "calcutta-standings__rank-badge--bronze"
      )}
    >
      {`#${rank}`}
    </span>
  );
}

function ReturnBadge({ returnPct }: { returnPct: number }) {
  const isPositive = returnPct > 0;
  const isNegative = returnPct < 0;
  const label = `${isPositive ? "+" : ""}${Math.round(returnPct * 100)}%`;
  return (
    <span
      className={cn(
        "calcutta-standings__return-badge",
        isPositive && "calcutta-standings__return-badge--positive",
        isNegative && "calcutta-standings__return-badge--negative"
      )}
    >
      {label}
    </span>
  );
}

function TeamRow({ asset }: { asset: CalcuttaTeamResult }) {
  const returnPct = asset.cost > 0 ? asset.netPnL / asset.cost : 0;

  return (
    <div className="calcutta-standings__team-row">
      <div className="calcutta-standings__team-identity">
        <span
          className={cn(
            "calcutta-standings__team-status-dot",
            asset.isEliminated
              ? "calcutta-standings__team-status-dot--eliminated"
              : "calcutta-standings__team-status-dot--alive"
          )}
        />
        <span className="calcutta-standings__team-name">
          {asset.seed !== null ? (
            <span className="calcutta-standings__team-seed">#{asset.seed}</span>
          ) : null}
          {asset.assetLabel}
        </span>
      </div>

      <div className="calcutta-standings__team-rounds-col">
        {STAGE_ORDER.map((stage) => {
          const status = getRoundPillStatus(
            stage,
            asset.roundsWon,
            asset.isEliminated,
            asset.isStillAlive
          );
          return (
            <span
              key={stage}
              className={cn("tournament-round-pill", `tournament-round-pill--${status}`)}
              title={STAGE_LABELS[stage]}
            >
              {STAGE_LABELS[stage]}
            </span>
          );
        })}
      </div>

      <div className="calcutta-standings__team-net-col">
        <span className={cn(
          "calcutta-standings__team-return",
          returnPct > 0 && "tournament-tracker__net-value--positive",
          returnPct < 0 && "tournament-tracker__net-value--negative"
        )}>
          {asset.cost > 0 ? `${returnPct > 0 ? "+" : ""}${Math.round(returnPct * 100)}%` : "—"}
        </span>
      </div>
    </div>
  );
}

interface CalcuttaStandingsProps {
  standings: CalcuttaSyndicateResult[];
}

export function CalcuttaStandings({ standings }: CalcuttaStandingsProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  function toggleExpanded(syndicateId: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(syndicateId)) {
        next.delete(syndicateId);
      } else {
        next.add(syndicateId);
      }
      return next;
    });
  }

  return (
    <article className="surface-card calcutta-standings">
      <div className="section-headline">
        <div>
          <p className="eyebrow">Calcutta Standings</p>
          <h3>Full Portfolio Tracker</h3>
        </div>
      </div>

      <div className="calcutta-standings__table">
        <div className="calcutta-standings__header-row">
          <div className="calcutta-standings__rank-col" />
          <div className="calcutta-standings__name-col">
            <span className="tournament-tracker__col-label">Syndicate</span>
          </div>
          <div className="calcutta-standings__alive-col">
            <span className="tournament-tracker__col-label">Teams</span>
          </div>
          <div className="calcutta-standings__return-col">
            <span className="tournament-tracker__col-label">Return</span>
          </div>
          <div className="calcutta-standings__chevron-col" />
        </div>

        {standings.map((syndicate, index) => {
          const rank = index + 1;
          const isExpanded = expandedIds.has(syndicate.syndicateId);

          return (
            <div
              key={syndicate.syndicateId}
              className={cn(
                "calcutta-standings__syndicate-block",
                syndicate.isFocusSyndicate && "calcutta-standings__syndicate-block--focus",
                isExpanded && "calcutta-standings__syndicate-block--expanded"
              )}
            >
              <button
                className="calcutta-standings__syndicate-row"
                onClick={() => toggleExpanded(syndicate.syndicateId)}
                aria-expanded={isExpanded}
              >
                <div className="calcutta-standings__rank-col">
                  <RankBadge rank={rank} />
                </div>
                <div className="calcutta-standings__name-col">
                  <span
                    className="calcutta-standings__color-dot"
                    style={{ backgroundColor: syndicate.syndicateColor }}
                  />
                  <span className="calcutta-standings__syndicate-name">
                    {syndicate.syndicateName}
                  </span>
                </div>
                <div className="calcutta-standings__alive-col">
                  {syndicate.teamsAlive > 0 ? (
                    <span className="calcutta-standings__teams-alive">
                      <span className="calcutta-standings__alive-pulse" />
                      {syndicate.teamsAlive}/{syndicate.totalTeams}
                      <span className="calcutta-standings__alive-label"> alive</span>
                    </span>
                  ) : (
                    <span className="calcutta-standings__teams-out">Out</span>
                  )}
                </div>
                <div className="calcutta-standings__return-col">
                  <ReturnBadge returnPct={syndicate.returnPct} />
                </div>
                <div className="calcutta-standings__chevron-col">
                  <span
                    className={cn(
                      "calcutta-standings__chevron",
                      isExpanded && "calcutta-standings__chevron--open"
                    )}
                  >
                    ▾
                  </span>
                </div>
              </button>

              {isExpanded && (
                <div className="calcutta-standings__team-rows">
                  <div className="calcutta-standings__team-header-row">
                    <div className="calcutta-standings__team-identity">
                      <span className="tournament-tracker__col-label">Team</span>
                    </div>
                    <div className="calcutta-standings__team-rounds-col">
                      <span className="tournament-tracker__col-label">Progress</span>
                    </div>
                    <div className="calcutta-standings__team-net-col">
                      <span className="tournament-tracker__col-label">Return</span>
                    </div>
                  </div>
                  {syndicate.assets.map((asset) => (
                    <TeamRow key={asset.assetId} asset={asset} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </article>
  );
}
