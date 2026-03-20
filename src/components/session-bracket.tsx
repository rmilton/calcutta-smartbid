"use client";

import { CSSProperties, useEffect, useState } from "react";
import {
  BracketGame,
  BracketGameTeam,
  BracketRegion,
  BracketRound,
  BracketViewModel,
  Syndicate
} from "@/lib/types";
import { TeamLogo } from "@/components/team-logo";
import { cn } from "@/lib/utils";

const CONDENSED_BRACKET_BREAKPOINT = 1600;
const COMPACT_BRACKET_BREAKPOINT = 1440;
type BracketDensity = "regular" | "condensed" | "compact";

interface SessionBracketProps {
  bracket: BracketViewModel;
  syndicates: Syndicate[];
  mothershipSyndicateId: string;
  canEdit: boolean;
  isSaving: boolean;
  notice: string | null;
  error: string | null;
  onSelectWinner: (gameId: string, winnerTeamId: string | null) => void;
}

export function SessionBracket({
  bracket,
  syndicates,
  mothershipSyndicateId,
  canEdit,
  isSaving,
  notice,
  error,
  onSelectWinner
}: SessionBracketProps) {
  const [density, setDensity] = useState<BracketDensity>("regular");

  useEffect(() => {
    const updateDensity = () => {
      if (window.innerWidth <= COMPACT_BRACKET_BREAKPOINT) {
        setDensity("compact");
        return;
      }

      if (window.innerWidth <= CONDENSED_BRACKET_BREAKPOINT) {
        setDensity("condensed");
        return;
      }

      setDensity("regular");
    };

    updateDensity();
    window.addEventListener("resize", updateDensity);
    return () => {
      window.removeEventListener("resize", updateDensity);
    };
  }, []);

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
              mothershipSyndicateId={mothershipSyndicateId}
              density={density}
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
  mothershipSyndicateId: string;
  density: BracketDensity;
  onSelectWinner: (gameId: string, winnerTeamId: string | null) => void;
}

function BracketBoard({
  bracket,
  canEdit,
  isSaving,
  notice,
  error,
  mothershipSyndicateId,
  density,
  onSelectWinner
}: BracketBoardProps) {
  const regions = organizeBoardRegions(bracket.regions);
  const semifinals = organizeSemifinals(bracket.finals);
  const playInGames = bracket.playIns?.games ?? [];
  const championshipRound = bracket.finals.find((round) => round.key === "championship") ?? null;
  const championshipGame = championshipRound?.games[0] ?? null;
  const champion =
    championshipGame?.entrants.find((entrant) => entrant?.teamId === championshipGame.winnerTeamId) ??
    null;

  return (
    <article className="surface-card bracket-board" data-density={density}>
      <div className="bracket-board__half bracket-board__half--top">
        <BracketBoardRegion
          region={regions.east}
          canEdit={canEdit}
          isSaving={isSaving}
          mothershipSyndicateId={mothershipSyndicateId}
          density={density}
          onSelectWinner={onSelectWinner}
        />
        <BracketBoardRegion
          region={regions.west}
          canEdit={canEdit}
          isSaving={isSaving}
          mothershipSyndicateId={mothershipSyndicateId}
          density={density}
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
            mothershipSyndicateId={mothershipSyndicateId}
            density={density}
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
                mothershipSyndicateId={mothershipSyndicateId}
                density={density}
                onSelectWinner={onSelectWinner}
                className="bracket-game-card--championship"
              />
            ) : null}
            <div className="bracket-board__champion-summary">
              <span className="eyebrow">Champion</span>
              {champion ? (
                <div className="team-label">
                  <TeamLogo teamId={champion.teamId} teamName={champion.name} size="sm" decorative />
                  <div className="team-label__copy">
                    <strong>{`${champion.seed}. ${champion.shortName}`}</strong>
                  </div>
                </div>
              ) : (
                <strong>TBD</strong>
              )}
            </div>
          </div>
          <BracketBoardSemifinal
            title="West / Midwest"
            game={semifinals.bottom}
            canEdit={canEdit}
            isSaving={isSaving}
            mothershipSyndicateId={mothershipSyndicateId}
            density={density}
            onSelectWinner={onSelectWinner}
          />
        </div>
      </div>

      <div className="bracket-board__half bracket-board__half--bottom">
        <BracketBoardRegion
          region={regions.south}
          canEdit={canEdit}
          isSaving={isSaving}
          mothershipSyndicateId={mothershipSyndicateId}
          density={density}
          onSelectWinner={onSelectWinner}
        />
        <BracketBoardRegion
          region={regions.midwest}
          canEdit={canEdit}
          isSaving={isSaving}
          mothershipSyndicateId={mothershipSyndicateId}
          density={density}
          onSelectWinner={onSelectWinner}
          mirror
        />
      </div>

      {playInGames.length > 0 ? (
        <BracketBoardPlayIns
          games={playInGames}
          canEdit={canEdit}
          isSaving={isSaving}
          mothershipSyndicateId={mothershipSyndicateId}
          density={density}
          onSelectWinner={onSelectWinner}
        />
      ) : null}

      {notice ? <p className="notice-text">{notice}</p> : null}
      {error ? <p className="error-text">{error}</p> : null}
    </article>
  );
}

interface BracketBoardRegionProps {
  region: BracketRegion | null;
  canEdit: boolean;
  isSaving: boolean;
  mothershipSyndicateId: string;
  density: BracketDensity;
  onSelectWinner: (gameId: string, winnerTeamId: string | null) => void;
  mirror?: boolean;
}

function BracketBoardRegion({
  region,
  canEdit,
  isSaving,
  mothershipSyndicateId,
  density,
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
        {displayRounds.map((round, roundIndex) => (
          <section
            key={`${region.name}-${round.key}`}
            className="bracket-round-column"
            data-round-size={round.games.length}
            data-connect-next={roundIndex < displayRounds.length - 1 ? "true" : "false"}
          >
            <header className="bracket-round-column__header">
              <strong>{round.label}</strong>
            </header>
            <div className="bracket-round-column__games">
              {round.games.map((game, gameIndex) => (
                <div
                  key={game.id}
                  className="bracket-game-slot"
                  data-slot-role={gameIndex % 2 === 0 ? "top" : "bottom"}
                >
                  <BracketGameCard
                    game={game}
                    canEdit={canEdit}
                    isSaving={isSaving}
                    mothershipSyndicateId={mothershipSyndicateId}
                    density={density}
                    onSelectWinner={onSelectWinner}
                  />
                </div>
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
  mothershipSyndicateId: string;
  density: BracketDensity;
  onSelectWinner: (gameId: string, winnerTeamId: string | null) => void;
}

function BracketBoardSemifinal({
  title,
  game,
  canEdit,
  isSaving,
  mothershipSyndicateId,
  density,
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
          mothershipSyndicateId={mothershipSyndicateId}
          density={density}
          onSelectWinner={onSelectWinner}
        />
      ) : null}
    </section>
  );
}

interface BracketBoardPlayInsProps {
  games: BracketGame[];
  canEdit: boolean;
  isSaving: boolean;
  mothershipSyndicateId: string;
  density: BracketDensity;
  onSelectWinner: (gameId: string, winnerTeamId: string | null) => void;
}

function BracketBoardPlayIns({
  games,
  canEdit,
  isSaving,
  mothershipSyndicateId,
  density,
  onSelectWinner
}: BracketBoardPlayInsProps) {
  return (
    <section className="bracket-board__play-ins">
      <header className="bracket-board__play-ins-header">
        <div>
          <p className="eyebrow">First Four</p>
          <h3>Play-in winners</h3>
        </div>
        <p className="bracket-board__play-ins-copy">
          Pick the winner below to cascade that team into the main bracket.
        </p>
      </header>
      <div className="bracket-board__play-in-grid">
        {games.map((game) => (
          <article key={game.id} className="bracket-board__play-in-card">
            <header className="bracket-board__play-in-header">
              <strong>{buildPlayInTitle(game)}</strong>
              <span>{buildPlayInFeedLabel(game)}</span>
            </header>
            <BracketGameCard
              game={game}
              canEdit={canEdit}
              isSaving={isSaving}
              mothershipSyndicateId={mothershipSyndicateId}
              density={density}
              onSelectWinner={onSelectWinner}
              className="bracket-game-card--play-in"
            />
          </article>
        ))}
      </div>
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

function buildPlayInTitle(game: BracketGame) {
  const firstEntrant = game.entrants.find((entrant) => entrant) ?? null;
  if (!firstEntrant) {
    return "Play-in matchup";
  }

  return `${firstEntrant.region} · ${firstEntrant.seed}-seed play-in`;
}

function buildPlayInFeedLabel(game: BracketGame) {
  const firstEntrant = game.entrants.find((entrant) => entrant) ?? null;
  if (!firstEntrant) {
    return "Feeds the Round of 64";
  }

  return `Winner advances to ${firstEntrant.region}'s Round of 64`;
}

interface BracketGameCardProps {
  game: BracketGame;
  canEdit: boolean;
  isSaving: boolean;
  mothershipSyndicateId: string;
  density: BracketDensity;
  onSelectWinner: (gameId: string, winnerTeamId: string | null) => void;
  className?: string;
}

function BracketGameCard({
  game,
  canEdit,
  isSaving,
  mothershipSyndicateId,
  density,
  onSelectWinner,
  className
}: BracketGameCardProps) {
  const broadcastLabel = buildBracketBroadcastLabel(game);
  return (
    <article className={cn("bracket-game-card", className)}>
      <div className="bracket-game-card__matchup">
        {game.entrants.map((entrant, index) => (
          <BracketEntrantRow
            key={`${game.id}-${entrant?.teamId ?? `empty-${index}`}`}
            team={entrant}
            broadcastLabel={broadcastLabel}
            isWinner={Boolean(entrant && game.winnerTeamId === entrant.teamId)}
            canEdit={canEdit}
            isSaving={isSaving}
            mothershipSyndicateId={mothershipSyndicateId}
            density={density}
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
  broadcastLabel: string;
  isWinner: boolean;
  canEdit: boolean;
  isSaving: boolean;
  mothershipSyndicateId: string;
  density: BracketDensity;
  onClick: () => void;
}

function BracketEntrantRow({
  team,
  broadcastLabel,
  isWinner,
  canEdit,
  isSaving,
  mothershipSyndicateId,
  density,
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
  const isMothershipOwned = team.buyerSyndicateId === mothershipSyndicateId;
  const syndicateLabel = buildBracketSyndicateLabel(team.buyerSyndicateName, density !== "regular");
  const displayName = density === "compact" ? team.shortName : team.name;

  const content = (
    <>
      {density === "regular" ? (
        <div className="bracket-entrant__meta">
          <span className="bracket-owner-pill" title={broadcastLabel}>
            {broadcastLabel}
          </span>
        </div>
      ) : null}
      <div className="bracket-entrant__identity">
        <TeamLogo
          teamId={team.teamId}
          teamName={team.name}
          size={density === "regular" ? "sm" : "xs"}
          decorative
        />
        <div className="team-label__copy bracket-entrant__copy">
          <strong className="bracket-entrant__seed-name" title={`${team.seed}. ${team.name}`}>
            {team.seed}. {displayName}
          </strong>
          <span className="bracket-entrant__detail" title={team.buyerSyndicateName ?? "Unsold"}>
            {syndicateLabel}
          </span>
        </div>
      </div>
    </>
  );

  if (!canEdit) {
    return (
      <div
        className={cn(
          "bracket-entrant",
          team.buyerSyndicateName && "bracket-entrant--owned",
          isMothershipOwned && "bracket-entrant--mothership-owned",
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
        isMothershipOwned && "bracket-entrant--mothership-owned",
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

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function buildBracketBroadcastLabel(game: BracketGame): string {
  if (!game.broadcastIsoDate) {
    return "TBD";
  }

  // Parse ISO date and display as Eastern time (NCAA games are always scheduled in ET)
  // Format: "Thu Mar 20 · 5:10 PM ET"
  const date = new Date(game.broadcastIsoDate);

  // Convert to Eastern time offset manually (-5 EST, -4 EDT)
  // For simplicity, use UTC offset for Eastern: subtract 4 hours for EDT (March-November) or 5 for EST
  // March 8 – November 1 is EDT (-4), rest is EST (-5)
  const utcMonth = date.getUTCMonth(); // 0-indexed
  const utcDay = date.getUTCDate();
  // DST starts second Sunday of March (approx March 8+) and ends first Sunday of November
  const isDst = utcMonth > 2 && utcMonth < 10 || (utcMonth === 2 && utcDay >= 8);
  const offsetHours = isDst ? -4 : -5;
  const tzLabel = isDst ? "EDT" : "EST";

  const etMs = date.getTime() + offsetHours * 60 * 60 * 1000;
  const etDate = new Date(etMs);

  const dayName = DAY_NAMES[etDate.getUTCDay()];
  const monthName = MONTH_NAMES[etDate.getUTCMonth()];
  const dayNum = etDate.getUTCDate();
  const hours = etDate.getUTCHours();
  const minutes = etDate.getUTCMinutes();
  const ampm = hours >= 12 ? "PM" : "AM";
  const displayHour = hours % 12 === 0 ? 12 : hours % 12;
  const displayMin = String(minutes).padStart(2, "0");

  const dateStr = `${dayName} ${monthName} ${dayNum}`;
  const timeStr = `${displayHour}:${displayMin} ${ampm} ${tzLabel}`;
  const networkStr = game.broadcastNetwork ?? "TV TBD";

  return `${dateStr} · ${timeStr} · ${networkStr}`;
}

function buildBracketSyndicateLabel(name: string | null, compact: boolean) {
  if (!name) {
    return "Unsold";
  }

  if (!compact || name.length <= 10) {
    return name;
  }

  const parts = name
    .split(/[^A-Za-z0-9]+/u)
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length >= 2) {
    return parts
      .slice(0, 4)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("");
  }

  return `${name.slice(0, 7)}.`;
}
