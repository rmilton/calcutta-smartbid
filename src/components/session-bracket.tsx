"use client";

import { CSSProperties } from "react";
import { BracketGame, BracketGameTeam, BracketRound, BracketViewModel } from "@/lib/types";
import { cn } from "@/lib/utils";

interface SessionBracketProps {
  bracket: BracketViewModel;
  canEdit: boolean;
  isSaving: boolean;
  notice: string | null;
  error: string | null;
  onSelectWinner: (gameId: string, winnerTeamId: string | null) => void;
}

export function SessionBracket({
  bracket,
  canEdit,
  isSaving,
  notice,
  error,
  onSelectWinner
}: SessionBracketProps) {
  return (
    <section className="bracket-shell">
      <article className="surface-card bracket-hero">
        <div>
          <p className="eyebrow">Tournament View</p>
          <h2>Session bracket</h2>
          <p className="bracket-hero__copy">
            The full field stays visible throughout the auction. Purchased teams carry syndicate
            ownership markers, and editors can advance winners as the tournament unfolds.
          </p>
        </div>
        <div className="bracket-legend">
          <span className="status-pill status-pill--muted">Unsold team</span>
          <span className="status-pill">Owned team</span>
          <span className="status-pill status-pill--positive">
            {canEdit ? "Click a team to advance it" : "Read-only viewer mode"}
          </span>
        </div>
      </article>

      {!bracket.isSupported ? (
        <article className="surface-card bracket-empty-state">
          <p className="eyebrow">Bracket unavailable</p>
          <h3>Full tournament field required</h3>
          <p>{bracket.unsupportedReason ?? "This session does not have a bracket-ready field yet."}</p>
        </article>
      ) : (
        <div className="bracket-layout">
          <div className="bracket-layout__regions">
            {bracket.regions.slice(0, 2).map((region) => (
              <BracketRegionCard
                key={region.name}
                regionName={region.name}
                rounds={region.rounds}
                canEdit={canEdit}
                isSaving={isSaving}
                onSelectWinner={onSelectWinner}
              />
            ))}
          </div>

          <div className="bracket-layout__finals">
            {bracket.finals.map((round) => (
              <article key={round.key} className="surface-card bracket-finals-card">
                <div className="section-headline">
                  <div>
                    <p className="eyebrow">{round.key === "finalFour" ? "Semifinals" : "Final"}</p>
                    <h3>{round.label}</h3>
                  </div>
                </div>
                <div className="bracket-finals-card__games">
                  {round.games.map((game) => (
                    <BracketGameCard
                      key={game.id}
                      game={game}
                      canEdit={canEdit}
                      isSaving={isSaving}
                      onSelectWinner={onSelectWinner}
                    />
                  ))}
                </div>
              </article>
            ))}
            {notice ? <p className="notice-text">{notice}</p> : null}
            {error ? <p className="error-text">{error}</p> : null}
          </div>

          <div className="bracket-layout__regions">
            {bracket.regions.slice(2).map((region) => (
              <BracketRegionCard
                key={region.name}
                regionName={region.name}
                rounds={region.rounds}
                canEdit={canEdit}
                isSaving={isSaving}
                onSelectWinner={onSelectWinner}
              />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

interface BracketRegionCardProps {
  regionName: string;
  rounds: BracketRound[];
  canEdit: boolean;
  isSaving: boolean;
  onSelectWinner: (gameId: string, winnerTeamId: string | null) => void;
}

function BracketRegionCard({
  regionName,
  rounds,
  canEdit,
  isSaving,
  onSelectWinner
}: BracketRegionCardProps) {
  return (
    <article className="surface-card bracket-region-card">
      <div className="section-headline">
        <div>
          <p className="eyebrow">Region</p>
          <h3>{regionName}</h3>
        </div>
      </div>
      <div className="bracket-region-card__rounds">
        {rounds.map((round) => (
          <section key={`${regionName}-${round.key}`} className="bracket-round-column">
            <header className="bracket-round-column__header">
              <strong>{round.label}</strong>
            </header>
            <div className="bracket-round-column__games">
              {round.games.map((game) => (
                <BracketGameCard
                  key={game.id}
                  game={game}
                  canEdit={canEdit}
                  isSaving={isSaving}
                  onSelectWinner={onSelectWinner}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </article>
  );
}

interface BracketGameCardProps {
  game: BracketGame;
  canEdit: boolean;
  isSaving: boolean;
  onSelectWinner: (gameId: string, winnerTeamId: string | null) => void;
}

function BracketGameCard({
  game,
  canEdit,
  isSaving,
  onSelectWinner
}: BracketGameCardProps) {
  return (
    <article className="bracket-game-card">
      <div className="bracket-game-card__matchup">
        {game.entrants.map((entrant, index) => (
          <BracketEntrantRow
            key={`${game.id}-${entrant?.teamId ?? `empty-${index}`}`}
            team={entrant}
            isWinner={Boolean(entrant && game.winnerTeamId === entrant.teamId)}
            canEdit={canEdit}
            isSaving={isSaving}
            onClick={() =>
              entrant
                ? onSelectWinner(
                    game.id,
                    game.winnerTeamId === entrant.teamId ? null : entrant.teamId
                  )
                : undefined
            }
          />
        ))}
      </div>
    </article>
  );
}

interface BracketEntrantRowProps {
  team: BracketGameTeam | null;
  isWinner: boolean;
  canEdit: boolean;
  isSaving: boolean;
  onClick: () => void;
}

function BracketEntrantRow({
  team,
  isWinner,
  canEdit,
  isSaving,
  onClick
}: BracketEntrantRowProps) {
  if (!team) {
    return (
      <div className="bracket-entrant bracket-entrant--empty">
        <span>TBD</span>
      </div>
    );
  }

  const ownerStyle = {
    ["--bracket-owner-accent" as string]: team.buyerColor ?? "transparent"
  } as CSSProperties;

  const content = (
    <>
      <div className="bracket-entrant__identity">
        <strong>
          {team.seed}. {team.shortName}
        </strong>
        <span>{team.name}</span>
      </div>
      <div className="bracket-entrant__meta">
        {team.buyerSyndicateName ? (
          <span className="bracket-owner-pill">{team.buyerSyndicateName}</span>
        ) : (
          <span className="bracket-owner-pill bracket-owner-pill--muted">Unsold</span>
        )}
      </div>
    </>
  );

  if (!canEdit) {
    return (
      <div
        className={cn(
          "bracket-entrant",
          team.buyerSyndicateName && "bracket-entrant--owned",
          isWinner && "bracket-entrant--winner"
        )}
        style={ownerStyle}
      >
        {content}
      </div>
    );
  }

  return (
    <button
      type="button"
      className={cn(
        "bracket-entrant",
        "bracket-entrant--button",
        team.buyerSyndicateName && "bracket-entrant--owned",
        isWinner && "bracket-entrant--winner"
      )}
      style={ownerStyle}
      disabled={isSaving}
      onClick={onClick}
    >
      {content}
    </button>
  );
}
