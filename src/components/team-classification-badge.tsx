"use client";

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
        {meta.iconLabel}
      </span>
      <span className="team-classification-badge__label">
        {compact ? meta.shortLabel : meta.label}
      </span>
    </span>
  );
}
