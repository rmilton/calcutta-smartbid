import { TeamProjection } from "@/lib/types";

interface NumericAverages {
  q1Wins: number | null;
  q2Wins: number | null;
  q3Wins: number | null;
  q4Wins: number | null;
  rankedWins: number | null;
  threePointPct: number | null;
  kenpomRank: number | null;
  atsWinPct: number | null;
}

export interface TeamIntelRow {
  teamId: string;
  teamName: string;
  shortName: string;
  seed: number;
  region: string;
  compositeScore: number;
  percentile: number;
  scoutingCoverage: number;
  q1Wins: number | null;
  q2Wins: number | null;
  q3Wins: number | null;
  q4Wins: number | null;
  rankedWins: number | null;
  threePointPct: number | null;
  kenpomRank: number | null;
  atsRecord: string | null;
  atsWinPct: number | null;
  offenseStyle: string | null;
  defenseStyle: string | null;
  strengths: string[];
  risks: string[];
}

export interface TeamIntelSelected {
  team: TeamProjection;
  row: TeamIntelRow;
  deltas: {
    q1Wins: number | null;
    rankedWins: number | null;
    threePointPct: number | null;
    kenpomRank: number | null;
    atsWinPct: number | null;
  };
  fieldAverages: NumericAverages;
}

export interface TeamIntelligence {
  ranking: TeamIntelRow[];
  fieldAverages: NumericAverages;
  selected: TeamIntelSelected | null;
}

const UNKNOWN_VALUE = 0.5;

export function buildTeamIntelligence(
  teams: TeamProjection[],
  selectedTeamId?: string | null
): TeamIntelligence {
  const fieldAverages: NumericAverages = {
    q1Wins: averageOf(teams.map((team) => team.scouting?.quadWins?.q1)),
    q2Wins: averageOf(teams.map((team) => team.scouting?.quadWins?.q2)),
    q3Wins: averageOf(teams.map((team) => team.scouting?.quadWins?.q3)),
    q4Wins: averageOf(teams.map((team) => team.scouting?.quadWins?.q4)),
    rankedWins: averageOf(teams.map((team) => team.scouting?.rankedWins)),
    threePointPct: averageOf(teams.map((team) => team.scouting?.threePointPct)),
    kenpomRank: averageOf(teams.map((team) => team.scouting?.kenpomRank)),
    atsWinPct: averageOf(teams.map((team) => getAtsWinPct(team)))
  };

  const metricRanges = {
    rating: getRange(teams.map((team) => team.rating)),
    q1Wins: getRange(teams.map((team) => team.scouting?.quadWins?.q1)),
    rankedWins: getRange(teams.map((team) => team.scouting?.rankedWins)),
    threePointPct: getRange(teams.map((team) => team.scouting?.threePointPct)),
    atsWinPct: getRange(teams.map((team) => getAtsWinPct(team))),
    kenpomRank: getRange(teams.map((team) => team.scouting?.kenpomRank))
  };

  const ranking = [...teams]
    .map((team) => {
      const q1Wins = team.scouting?.quadWins?.q1 ?? null;
      const q2Wins = team.scouting?.quadWins?.q2 ?? null;
      const q3Wins = team.scouting?.quadWins?.q3 ?? null;
      const q4Wins = team.scouting?.quadWins?.q4 ?? null;
      const rankedWins = team.scouting?.rankedWins ?? null;
      const threePointPct = team.scouting?.threePointPct ?? null;
      const kenpomRank = team.scouting?.kenpomRank ?? null;
      const atsWinPct = getAtsWinPct(team);

      const normalizedRating = normalizeHigh(team.rating, metricRanges.rating);
      const normalizedQ1 = normalizeHigh(q1Wins, metricRanges.q1Wins);
      const normalizedRankedWins = normalizeHigh(rankedWins, metricRanges.rankedWins);
      const normalizedThree = normalizeHigh(threePointPct, metricRanges.threePointPct);
      const normalizedAts = normalizeHigh(atsWinPct, metricRanges.atsWinPct);
      const normalizedKenpom = normalizeLow(kenpomRank, metricRanges.kenpomRank);

      const scoutingFields = [q1Wins, rankedWins, threePointPct, kenpomRank, atsWinPct];
      const scoutingCoverage =
        scoutingFields.filter((value) => value !== null).length / scoutingFields.length;

      const compositeScore =
        normalizedRating * 0.22 +
        normalizedQ1 * 0.24 +
        normalizedRankedWins * 0.17 +
        normalizedThree * 0.14 +
        normalizedAts * 0.11 +
        normalizedKenpom * 0.12;

      const strengths = getStrengths(
        {
          q1Wins,
          rankedWins,
          threePointPct,
          kenpomRank,
          atsWinPct
        },
        fieldAverages
      );
      const risks = getRisks(
        {
          q1Wins,
          rankedWins,
          threePointPct,
          kenpomRank,
          atsWinPct
        },
        fieldAverages
      );
      if (risks.length === 0 && scoutingCoverage <= 0.45) {
        risks.push("Limited scouting data increases uncertainty");
      }

      const atsRecord = team.scouting?.ats
        ? `${team.scouting.ats.wins}-${team.scouting.ats.losses}-${team.scouting.ats.pushes}`
        : null;

      return {
        teamId: team.id,
        teamName: team.name,
        shortName: team.shortName,
        seed: team.seed,
        region: team.region,
        compositeScore,
        percentile: 0,
        scoutingCoverage,
        q1Wins,
        q2Wins,
        q3Wins,
        q4Wins,
        rankedWins,
        threePointPct,
        kenpomRank,
        atsRecord,
        atsWinPct,
        offenseStyle: team.scouting?.offenseStyle ?? null,
        defenseStyle: team.scouting?.defenseStyle ?? null,
        strengths,
        risks
      } satisfies TeamIntelRow;
    })
    .sort((left, right) => right.compositeScore - left.compositeScore)
    .map((row, index, rows) => ({
      ...row,
      percentile:
        rows.length <= 1 ? 100 : Math.round(((rows.length - index - 1) / (rows.length - 1)) * 100)
    }));

  const selectedTeam =
    teams.find((team) => team.id === selectedTeamId) ??
    teams[0] ??
    null;
  const selectedRow =
    ranking.find((row) => row.teamId === selectedTeam?.id) ?? null;

  const selected =
    selectedTeam && selectedRow
      ? {
          team: selectedTeam,
          row: selectedRow,
          deltas: {
            q1Wins: delta(selectedRow.q1Wins, fieldAverages.q1Wins),
            rankedWins: delta(selectedRow.rankedWins, fieldAverages.rankedWins),
            threePointPct: delta(selectedRow.threePointPct, fieldAverages.threePointPct),
            kenpomRank: delta(fieldAverages.kenpomRank, selectedRow.kenpomRank),
            atsWinPct: delta(selectedRow.atsWinPct, fieldAverages.atsWinPct)
          },
          fieldAverages
        }
      : null;

  return {
    ranking,
    fieldAverages,
    selected
  };
}

function getStrengths(
  metrics: {
    q1Wins: number | null;
    rankedWins: number | null;
    threePointPct: number | null;
    kenpomRank: number | null;
    atsWinPct: number | null;
  },
  averages: NumericAverages
) {
  const strengths: string[] = [];
  if (metrics.q1Wins !== null && averages.q1Wins !== null && metrics.q1Wins >= averages.q1Wins + 2) {
    strengths.push("High-end Quad 1 resume");
  }
  if (
    metrics.rankedWins !== null &&
    averages.rankedWins !== null &&
    metrics.rankedWins >= averages.rankedWins + 1
  ) {
    strengths.push("Consistent wins against ranked opponents");
  }
  if (
    metrics.threePointPct !== null &&
    averages.threePointPct !== null &&
    metrics.threePointPct >= averages.threePointPct + 1.1
  ) {
    strengths.push("Above-field perimeter shooting");
  }
  if (
    metrics.kenpomRank !== null &&
    averages.kenpomRank !== null &&
    metrics.kenpomRank <= averages.kenpomRank - 6
  ) {
    strengths.push("Strong efficiency profile (KenPom)");
  }
  if (
    metrics.atsWinPct !== null &&
    averages.atsWinPct !== null &&
    metrics.atsWinPct >= averages.atsWinPct + 0.05
  ) {
    strengths.push("Beating market expectations vs spread");
  }
  return strengths;
}

function getRisks(
  metrics: {
    q1Wins: number | null;
    rankedWins: number | null;
    threePointPct: number | null;
    kenpomRank: number | null;
    atsWinPct: number | null;
  },
  averages: NumericAverages
) {
  const risks: string[] = [];
  if (metrics.q1Wins !== null && averages.q1Wins !== null && metrics.q1Wins <= averages.q1Wins - 2) {
    risks.push("Limited top-tier Quad 1 wins");
  }
  if (
    metrics.rankedWins !== null &&
    averages.rankedWins !== null &&
    metrics.rankedWins <= averages.rankedWins - 1
  ) {
    risks.push("Few wins over ranked competition");
  }
  if (
    metrics.threePointPct !== null &&
    averages.threePointPct !== null &&
    metrics.threePointPct <= averages.threePointPct - 1.1
  ) {
    risks.push("Below-field three-point accuracy");
  }
  if (
    metrics.kenpomRank !== null &&
    averages.kenpomRank !== null &&
    metrics.kenpomRank >= averages.kenpomRank + 7
  ) {
    risks.push("Lower efficiency margin than peers");
  }
  if (
    metrics.atsWinPct !== null &&
    averages.atsWinPct !== null &&
    metrics.atsWinPct <= averages.atsWinPct - 0.05
  ) {
    risks.push("Underperforming against spread trend");
  }
  return risks;
}

function getAtsWinPct(team: TeamProjection) {
  const wins = team.scouting?.ats?.wins;
  const losses = team.scouting?.ats?.losses;
  if (wins === undefined || losses === undefined) {
    return null;
  }

  const total = wins + losses;
  if (total <= 0) {
    return null;
  }
  return wins / total;
}

function averageOf(values: Array<number | undefined | null>) {
  const numeric = values.filter((value): value is number => typeof value === "number");
  if (numeric.length === 0) {
    return null;
  }
  return numeric.reduce((total, value) => total + value, 0) / numeric.length;
}

function getRange(values: Array<number | undefined | null>) {
  const numeric = values.filter((value): value is number => typeof value === "number");
  if (numeric.length === 0) {
    return null;
  }
  return {
    min: Math.min(...numeric),
    max: Math.max(...numeric)
  };
}

function normalizeHigh(value: number | null, range: { min: number; max: number } | null) {
  if (value === null || !range) {
    return UNKNOWN_VALUE;
  }
  if (range.max === range.min) {
    return 1;
  }
  return (value - range.min) / (range.max - range.min);
}

function normalizeLow(value: number | null, range: { min: number; max: number } | null) {
  if (value === null || !range) {
    return UNKNOWN_VALUE;
  }
  if (range.max === range.min) {
    return 1;
  }
  return (range.max - value) / (range.max - range.min);
}

function delta(value: number | null, average: number | null) {
  if (value === null || average === null) {
    return null;
  }
  return value - average;
}
