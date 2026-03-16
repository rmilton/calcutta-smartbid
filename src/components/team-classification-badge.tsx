"use client";

import Image from "next/image";

import { getTeamClassificationMeta } from "@/lib/team-classifications";
import { TeamClassificationValue } from "@/lib/types";
import { cn } from "@/lib/utils";

interface TeamClassificationBadgeProps {
  classification: TeamClassificationValue;
  compact?: boolean;
}

export function TeamClassificationBadge({
  classification,
  compact = false
}: TeamClassificationBadgeProps) {
  const meta = getTeamClassificationMeta(classification);

  if (!meta) {
    return null;
  }

  return (
    <span
      className={cn(
        "team-classification-badge",
        `team-classification-badge--${meta.tone}`,
        compact && "team-classification-badge--compact"
      )}
      title={meta.label}
    >
      <span className="team-classification-badge__icon" aria-hidden="true">
        <Image
          className="team-classification-badge__icon-image"
          src={meta.iconSrc}
          alt=""
          width={16}
          height={16}
          unoptimized
          onError={(event) => {
            event.currentTarget.style.display = "none";
            event.currentTarget.nextElementSibling?.removeAttribute("hidden");
          }}
        />
        <span className="team-classification-badge__icon-fallback" hidden>
          {meta.iconLabel}
        </span>
      </span>
      <span className="team-classification-badge__label">
        {compact ? meta.shortLabel : meta.label}
      </span>
    </span>
  );
}
