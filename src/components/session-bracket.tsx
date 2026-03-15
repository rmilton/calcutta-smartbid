"use client";

import { CSSProperties } from "react";
import {
  BracketGame,
  BracketGameTeam,
  BracketRegion,
  BracketRound,
  BracketViewModel,
  Syndicate
} from "@/lib/types";
import { cn } from "@/lib/utils";

interface SessionBracketProps {
  bracket: BracketViewModel;
  syndicates: Syndicate[];
  canEdit: boolean;
  isSaving: boolean;
  notice: string | null;
  error: string | null;
  onSelectWinner: (gameId: string, winnerTeamId: string | null) => void;
}

export function SessionBracket({
  bracket,
  syndicates,
  canEdit,
  isSaving,
  notice,
  error,
  onSelectWinner
}: SessionBracketProps) {
  return (
    <section className="bracket-shell">
      <article className="surface-card bracket-hero">
        <div className="bracket-hero__header">
          <div className="bracket-hero__content">
            <p className="eyebrow">Tournament View</p>
            <h2>Session bracket</h2>
            <p className="bracket-hero__copy">
              The full field stays visible throughout the auction. Purchased teams carry syndicate
              ownership markers, and editors can advance winners as the tournament unfolds.
            </p>
          </div>
          <div className="bracket-hero__mode">
            <span className="status-pill status-pill--positive">
              {canEdit ? "Click a team to advance it" : "Read-only viewer mode"}
            </span>
          </div>
        </div>
        <div className="bracket-legend">
          <div className="bracket-legend__key" aria-label="Syndicate color key">
            <span className="bracket-legend__title">Syndicate key</span>
            <div className="bracket-legend__syndicates">
              {syndicates.map((syndicate) => (
                <span
                  key={syndicate.id}
                  className="bracket-syndicate-key"
                  style={{ ["--bracket-owner-accent" as string]: syndicate.color }}
                >
                  <span className="bracket-syndicate-key__swatch" aria-hidden="true" />
                  <span>{syndicate.name}</span>
                </span>
              ))}
            </div>
          </div>
        </div>
      </article>

      {!bracket.isSupported ? (
        <article className="surface-card bracket-empty-state">
          <p className="eyebrow">Bracket unavailable</p>
          <h3>Full tournament field required</h3>
          <p>{bracket.unsupportedReason ?? "This session does not have a bracket-ready field yet."}</p>
        </article>
      ) : (
        <div className="bracket-board-breakout">
          <div className="bracket-board-scroll">
            <BracketBoard
              bracket={bracket}
              canEdit={canEdit}
              isSaving={isSaving}
              notice={notice}
              error={error}
              onSelectWinner={onSelectWinner}
            />
          </div>
        </div>
      )}
    </section>
  );
}

interface BracketBoardProps {
  bracket: BracketViewModel;
  canEdit: boolean;
  isSaving: boolean;
  notice: string | null;
  error: string | null;
  onSelectWinner: (gameId: string, winnerTeamId: string | null) => void;
}

function BracketBoard({
  bracket,
  canEdit,
  isSaving,
  notice,
  error,
  onSelectWinner
}: BracketBoardProps) {
  const regions = organizeBoardRegions(bracket.regions);
  const semifinals = organizeSemifinals(bracket.finals);
  const championshipRound = bracket.finals.find((round) => round.key === "championship") ?? null;
  const championshipGame = championshipRound?.games[0] ?? null;
  const champion =
    championshipGame?.entrants.find((entrant) => entrant?.teamId === championshipGame.winnerTeamId) ??
    null;

  return (
    <article className="surface-card bracket-board">
      <div className="bracket-board__half bracket-board__half--top">
        <BracketBoardRegion
          region={regions.south}
          canEdit={canEdit}
          isSaving={isSaving}
          onSelectWinner={onSelectWinner}
        />
        <BracketBoardRegion
          region={regions.east}
          canEdit={canEdit}
          isSaving={isSaving}
          onSelectWinner={onSelectWinner}
          mirror
        />
      </div>

      <div className="bracket-board__championship-band">
        <div className="bracket-board__band-grid">
          <BracketBoardSemifinal
            title="South / East"
            game={semifinals.top}
            canEdit={canEdit}
            isSaving={isSaving}
            onSelectWinner={onSelectWinner}
          />
          <div className="bracket-board__championship-core">
            <span className="bracket-board__band-label">Final weekend</span>
            <span className="eyebrow">Championship</span>
            {championshipGame ? (
              <BracketGameCard
                game={championshipGame}
                canEdit={canEdit}
                isSaving={isSaving}
                onSelectWinner={onSelectWinner}
                className="bracket-game-card--championship"
              />
            ) : null}
            <div className="bracket-board__champion-summary">
              <span className="eyebrow">Champion</span>
              <strong>{champion ? `${champion.seed}. ${champion.shortName}` : "TBD"}</strong>
            </div>
          </div>
          <BracketBoardSemifinal
            title="West / Midwest"
            game={semifinals.bottom}
            canEdit={canEdit}
            isSaving={isSaving}
            onSelectWinner={onSelectWinner}
          />
        </div>
      </div>

      <div className="bracket-board__half bracket-board__half--bottom">
        <BracketBoardRegion
          region={regions.west}
          canEdit={canEdit}
          isSaving={isSaving}
          onSelectWinner={onSelectWinner}
        />
        <BracketBoardRegion
          region={regions.midwest}
          canEdit={canEdit}
          isSaving={isSaving}
          onSelectWinner={onSelectWinner}
          mirror
        />
      </div>

      {notice ? <p className="notice-text">{notice}</p> : null}
      {error ? <p className="error-text">{error}</p> : null}
    </article>
  );
}

interface BracketBoardRegionProps {
  region: BracketRegion | null;
  canEdit: boolean;
  isSaving: boolean;
  onSelectWinner: (gameId: string, winnerTeamId: string | null) => void;
  mirror?: boolean;
}

function BracketBoardRegion({
  region,
  canEdit,
  isSaving,
  onSelectWinner,
  mirror = false
}: BracketBoardRegionProps) {
  if (!region) {
    return null;
  }

  const displayRounds = region.rounds;

  return (
    <section className={cn("bracket-board__region", mirror && "bracket-board__region--mirrored")}>
      <header className="bracket-board__region-header">
        <p className="eyebrow">Region</p>
        <h3>{region.name}</h3>
      </header>
      <div className="bracket-board__rounds">
        {displayRounds.map((round) => (
          <section key={`${region.name}-${round.key}`} className="bracket-round-column">
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
    </section>
  );
}

interface BracketBoardSemifinalProps {
  title: string;
  game: BracketGame | null;
  canEdit: boolean;
  isSaving: boolean;
  onSelectWinner: (gameId: string, winnerTeamId: string | null) => void;
}

function BracketBoardSemifinal({
  title,
  game,
  canEdit,
  isSaving,
  onSelectWinner
}: BracketBoardSemifinalProps) {
  return (
    <section className="bracket-board__semifinal bracket-board__band-side">
      <header className="bracket-board__semifinal-header">
        <p className="eyebrow">{title}</p>
      </header>
      {game ? (
        <BracketGameCard
          game={game}
          canEdit={canEdit}
          isSaving={isSaving}
          onSelectWinner={onSelectWinner}
        />
      ) : null}
    </section>
  );
}

function organizeBoardRegions(regions: BracketRegion[]) {
  const regionLookup = new Map(regions.map((region) => [normalizeRegionName(region.name), region]));

  return {
    south: regionLookup.get("south") ?? null,
    east: regionLookup.get("east") ?? null,
    west: regionLookup.get("west") ?? null,
    midwest: regionLookup.get("midwest") ?? null
  };
}

function organizeSemifinals(rounds: BracketRound[]) {
  const semifinalRound = rounds.find((round) => round.key === "finalFour") ?? null;
  const semifinalGames = semifinalRound?.games ?? [];

  return {
    top:
      semifinalGames.find((game) => gameFeedsRegions(game, ["south", "east"])) ??
      semifinalGames[0] ??
      null,
    bottom:
      semifinalGames.find((game) => gameFeedsRegions(game, ["west", "midwest"])) ??
      semifinalGames[1] ??
      null
  };
}

function gameFeedsRegions(game: BracketGame, expectedRegions: string[]) {
  const regions = game.sourceGameIds
    .map((sourceGameId) => extractRegionFromSourceGameId(sourceGameId))
    .filter((region): region is string => Boolean(region))
    .sort();

  return regions.join("|") === [...expectedRegions].sort().join("|");
}

function extractRegionFromSourceGameId(sourceGameId: string | null) {
  if (!sourceGameId) {
    return null;
  }

  const match = sourceGameId.match(/^(.*)-elite-8-\d+$/u);
  return match ? match[1] : null;
}

function normalizeRegionName(regionName: string) {
  return regionName.trim().toLowerCase().replace(/[^a-z0-9]+/gu, "-");
}

interface BracketGameCardProps {
  game: BracketGame;
  canEdit: boolean;
  isSaving: boolean;
  onSelectWinner: (gameId: string, winnerTeamId: string | null) => void;
  className?: string;
}

function BracketGameCard({
  game,
  canEdit,
  isSaving,
  onSelectWinner,
  className
}: BracketGameCardProps) {
  return (
    <article className={cn("bracket-game-card", className)}>
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
