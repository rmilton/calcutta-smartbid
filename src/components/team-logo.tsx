"use client";

import Image from "next/image";
import React, { useEffect, useMemo, useState } from "react";
import {
  TeamLogoRef,
  getAssetLogoRefs,
  getTeamLogoFallbackText,
  getTeamLogoPath
} from "@/lib/team-logos";
import { AuctionAsset, TeamProjection } from "@/lib/types";
import { cn } from "@/lib/utils";

type TeamLogoSize = "xs" | "sm" | "md" | "lg";

export function TeamLogo({
  teamId,
  teamName,
  size = "md",
  decorative = false,
  className
}: TeamLogoRef & {
  size?: TeamLogoSize;
  decorative?: boolean;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const resolvedLogoPath = getTeamLogoPath({ teamId, teamName });
  const logoPath = failed ? null : resolvedLogoPath;
  const fallbackText = useMemo(
    () => getTeamLogoFallbackText({ teamId, teamName }) || "?",
    [teamId, teamName]
  );

  useEffect(() => {
    setFailed(false);
  }, [resolvedLogoPath, teamId, teamName]);

  return (
    <span
      className={cn("team-logo", `team-logo--${size}`, className)}
      aria-hidden={decorative || undefined}
    >
      {logoPath ? (
        <Image
          src={logoPath}
          alt={decorative ? "" : `${teamName ?? teamId ?? "Team"} logo`}
          fill
          sizes={getTeamLogoSizes(size)}
          className="team-logo__image"
          unoptimized
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="team-logo__fallback">{fallbackText}</span>
      )}
    </span>
  );
}

export function TeamLogoStack({
  teams,
  size = "sm",
  max = 4,
  decorative = false,
  className
}: {
  teams: TeamLogoRef[];
  size?: TeamLogoSize;
  max?: number;
  decorative?: boolean;
  className?: string;
}) {
  const visibleTeams = teams.slice(0, max);

  return (
    <span
      className={cn("team-logo-stack", className)}
      aria-hidden={decorative || undefined}
    >
      {visibleTeams.map((team, index) => (
        <TeamLogo
          key={`${team.teamId ?? team.teamName ?? "team"}-${index}`}
          teamId={team.teamId}
          teamName={team.teamName}
          size={size}
          decorative
          className="team-logo-stack__item"
        />
      ))}
    </span>
  );
}

export function AssetLogo({
  asset,
  teamLookup,
  size = "sm",
  decorative = false,
  className
}: {
  asset: AuctionAsset;
  teamLookup?: Map<string, TeamProjection>;
  size?: TeamLogoSize;
  decorative?: boolean;
  className?: string;
}) {
  const logoRefs = getAssetLogoRefs(asset, teamLookup);
  if (logoRefs.length > 1) {
    return (
      <TeamLogoStack
        teams={logoRefs}
        size={size}
        decorative={decorative}
        className={className}
      />
    );
  }

  const logoRef = logoRefs[0] ?? { teamId: asset.id, teamName: asset.label };
  return (
    <TeamLogo
      teamId={logoRef.teamId}
      teamName={logoRef.teamName}
      size={size}
      decorative={decorative}
      className={className}
    />
  );
}

function getTeamLogoSizes(size: TeamLogoSize) {
  switch (size) {
    case "xs":
      return "20px";
    case "sm":
      return "28px";
    case "lg":
      return "56px";
    default:
      return "40px";
  }
}
