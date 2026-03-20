import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/team-logo", () => ({
  TeamLogo: ({ teamName }: { teamName: string }) => createElement("span", null, teamName)
}));

import { SessionBracket } from "@/components/session-bracket";
import { BracketViewModel, Syndicate } from "@/lib/types";

const syndicates: Syndicate[] = [
  {
    id: "syn_focus",
    name: "Mothership",
    color: "#0f172a",
    spend: 0,
    remainingBankroll: 0,
    estimatedBudget: 10000,
    budgetConfidence: "high",
    budgetNotes: "",
    estimatedRemainingBudget: 10000,
    estimateExceeded: false,
    ownedTeamIds: [],
    portfolioExpectedValue: 0
  }
];

function buildBracket(playIns: BracketViewModel["playIns"]): BracketViewModel {
  return {
    isSupported: true,
    unsupportedReason: null,
    playIns,
    regions: [],
    finals: []
  };
}

describe("SessionBracket", () => {
  beforeEach(() => {
    globalThis.React = React;
  });

  it("renders the bottom play-in section for editable brackets", () => {
    const markup = renderToStaticMarkup(
      createElement(SessionBracket, {
        bracket: buildBracket({
          key: "playIn",
          label: "First Four",
          region: null,
          games: [
            {
              id: "play-in-east-11-playin",
              round: "playIn",
              label: "First Four",
              region: "East",
              slot: 1,
              sourceGameIds: [null, null],
              broadcastIsoDate: "2026-03-18T23:10:00Z",
              broadcastNetwork: "truTV",
              entrants: [
                {
                  teamId: "east-11-a",
                  name: "East 11 A",
                  shortName: "E11A",
                  seed: 11,
                  region: "East",
                  buyerSyndicateId: null,
                  buyerSyndicateName: null,
                  buyerColor: null
                },
                {
                  teamId: "east-11-b",
                  name: "East 11 B",
                  shortName: "E11B",
                  seed: 11,
                  region: "East",
                  buyerSyndicateId: null,
                  buyerSyndicateName: null,
                  buyerColor: null
                }
              ],
              winnerTeamId: null
            }
          ]
        }),
        syndicates,
        canEdit: true,
        isSaving: false,
        notice: null,
        error: null,
        onSelectWinner: () => undefined
      })
    );

    expect(markup).toContain("Play-in winners");
    expect(markup).toContain("East · 11-seed play-in");
    expect(markup).toContain("Winner advances to East&#x27;s Round of 64");
    expect(markup).toContain("<button");
  });

  it("does not render the play-in section when no play-ins exist", () => {
    const markup = renderToStaticMarkup(
      createElement(SessionBracket, {
        bracket: buildBracket(null),
        syndicates,
        canEdit: true,
        isSaving: false,
        notice: null,
        error: null,
        onSelectWinner: () => undefined
      })
    );

    expect(markup).not.toContain("Play-in winners");
  });

  it("renders viewer mode without interactive winner buttons", () => {
    const markup = renderToStaticMarkup(
      createElement(SessionBracket, {
        bracket: buildBracket({
          key: "playIn",
          label: "First Four",
          region: null,
          games: [
            {
              id: "play-in-west-16-playin",
              round: "playIn",
              label: "First Four",
              region: "West",
              slot: 1,
              sourceGameIds: [null, null],
              broadcastIsoDate: "2026-03-19T01:10:00Z",
              broadcastNetwork: "TNT",
              entrants: [
                {
                  teamId: "west-16-a",
                  name: "West 16 A",
                  shortName: "W16A",
                  seed: 16,
                  region: "West",
                  buyerSyndicateId: null,
                  buyerSyndicateName: null,
                  buyerColor: null
                },
                {
                  teamId: "west-16-b",
                  name: "West 16 B",
                  shortName: "W16B",
                  seed: 16,
                  region: "West",
                  buyerSyndicateId: null,
                  buyerSyndicateName: null,
                  buyerColor: null
                }
              ],
              winnerTeamId: "west-16-a"
            }
          ]
        }),
        syndicates,
        canEdit: false,
        isSaving: false,
        notice: null,
        error: null,
        onSelectWinner: () => undefined
      })
    );

    expect(markup).toContain("Read-only viewer mode");
    expect(markup).toContain("TNT");
    expect(markup).not.toContain("<button");
  });
});
