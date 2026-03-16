import { TeamClassificationValue } from "@/lib/types";

export interface TeamClassificationMeta {
  value: TeamClassificationValue;
  label: string;
  shortLabel: string;
  iconLabel: string;
  iconSrc: string;
  tone: "positive" | "accent" | "warn" | "danger";
}

export const TEAM_CLASSIFICATION_ORDER: TeamClassificationValue[] = [
  "must-have",
  "love-at-right-price",
  "caution",
  "nuclear-disaster"
];

export const TEAM_CLASSIFICATION_META: Record<
  TeamClassificationValue,
  TeamClassificationMeta
> = {
  "must-have": {
    value: "must-have",
    label: "Must-have",
    shortLabel: "Must-have",
    iconLabel: "MH",
    iconSrc: "/images/team-classifications/must-have.svg",
    tone: "positive"
  },
  "love-at-right-price": {
    value: "love-at-right-price",
    label: "Love at right price",
    shortLabel: "Right price",
    iconLabel: "RP",
    iconSrc: "/images/team-classifications/love-at-right-price.svg",
    tone: "accent"
  },
  caution: {
    value: "caution",
    label: "Caution",
    shortLabel: "Caution",
    iconLabel: "CA",
    iconSrc: "/images/team-classifications/caution.svg",
    tone: "warn"
  },
  "nuclear-disaster": {
    value: "nuclear-disaster",
    label: "Nuclear disaster",
    shortLabel: "Disaster",
    iconLabel: "ND",
    iconSrc: "/images/team-classifications/nuclear-disaster.svg",
    tone: "danger"
  }
};

export function getTeamClassificationMeta(
  classification: TeamClassificationValue | null | undefined
) {
  if (!classification) {
    return null;
  }

  return TEAM_CLASSIFICATION_META[classification];
}
