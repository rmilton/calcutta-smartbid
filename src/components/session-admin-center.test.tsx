import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockUseRouter, mockUseFeedbackMessage } = vi.hoisted(() => ({
  mockUseRouter: vi.fn(),
  mockUseFeedbackMessage: vi.fn()
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: Record<string, unknown>) =>
    createElement("a", { href, ...props }, children)
}));

vi.mock("next/navigation", () => ({
  useRouter: mockUseRouter
}));

vi.mock("@/components/theme-toggle", () => ({
  ThemeToggle: () => createElement("button", null, "theme")
}));

vi.mock("@/lib/hooks/use-feedback-message", () => ({
  useFeedbackMessage: mockUseFeedbackMessage
}));

describe("SessionAdminCenter", () => {
  beforeEach(() => {
    globalThis.React = React;
    mockUseRouter.mockReturnValue({
      refresh: vi.fn(),
      push: vi.fn(),
      replace: vi.fn()
    });
    mockUseFeedbackMessage.mockReturnValue({
      error: null,
      notice: null,
      clearFeedback: vi.fn(),
      showError: vi.fn(),
      showNotice: vi.fn()
    });
  });

  it("renders the watching-now panel with active viewers", async () => {
    const { SessionAdminCenter } = await import("@/components/session-admin-center");
    const markup = renderToStaticMarkup(
      createElement(SessionAdminCenter, {
        mothershipSyndicateName: "Mothership",
        initialConfig: {
          session: {
            id: "session_1",
            name: "Prime Room",
            syndicates: [
              {
                id: "syn_1",
                name: "Mothership",
                color: "#111111",
                spend: 0,
                remainingBankroll: 50000,
                estimatedBudget: 50000,
                budgetConfidence: "high",
                budgetNotes: "",
                estimatedRemainingBudget: 50000,
                estimateExceeded: false,
                ownedTeamIds: [],
                portfolioExpectedValue: 0,
                catalogEntryId: "catalog_1"
              }
            ],
            focusSyndicateId: "syn_1",
            payoutRules: {
              roundOf64: 0.5,
              roundOf32: 1,
              sweet16: 2,
              elite8: 4,
              finalFour: 8,
              champion: 16,
              projectedPot: 100000
            },
            analysisSettings: {},
            mothershipFunding: {
              targetSharePrice: 1000,
              allowHalfShares: true,
              fullSharesSold: 0,
              halfSharesSold: 0,
              budgetLow: 45000,
              budgetBase: 50000,
              budgetStretch: 55000
            },
            bracketImport: null,
            analysisImport: null
          },
          currentSharedAccessCode: "join1234",
          accessMembers: [],
          activeViewers: [
            {
              memberId: "member_1",
              name: "Viewer One",
              email: "viewer@example.com",
              role: "viewer",
              currentView: "bracket",
              lastSeenAt: "2026-03-16T12:05:00.000Z"
            }
          ],
          platformUsers: [],
          syndicateCatalog: [],
          dataSources: [],
          importRuns: []
        }
      })
    );

    expect(markup).toContain("Watching now");
    expect(markup).toContain("Viewer One");
    expect(markup).toContain("viewer@example.com");
    expect(markup).toContain("Bracket");
  });

  it("renders the empty state when no viewers are active", async () => {
    const { SessionAdminCenter } = await import("@/components/session-admin-center");
    const markup = renderToStaticMarkup(
      createElement(SessionAdminCenter, {
        mothershipSyndicateName: "Mothership",
        initialConfig: {
          session: {
            id: "session_1",
            name: "Prime Room",
            syndicates: [
              {
                id: "syn_1",
                name: "Mothership",
                color: "#111111",
                spend: 0,
                remainingBankroll: 50000,
                estimatedBudget: 50000,
                budgetConfidence: "high",
                budgetNotes: "",
                estimatedRemainingBudget: 50000,
                estimateExceeded: false,
                ownedTeamIds: [],
                portfolioExpectedValue: 0,
                catalogEntryId: "catalog_1"
              }
            ],
            focusSyndicateId: "syn_1",
            payoutRules: {
              roundOf64: 0.5,
              roundOf32: 1,
              sweet16: 2,
              elite8: 4,
              finalFour: 8,
              champion: 16,
              projectedPot: 100000
            },
            analysisSettings: {},
            mothershipFunding: {
              targetSharePrice: 1000,
              allowHalfShares: true,
              fullSharesSold: 0,
              halfSharesSold: 0,
              budgetLow: 45000,
              budgetBase: 50000,
              budgetStretch: 55000
            },
            bracketImport: null,
            analysisImport: null
          },
          currentSharedAccessCode: "join1234",
          accessMembers: [],
          activeViewers: [],
          platformUsers: [],
          syndicateCatalog: [],
          dataSources: [],
          importRuns: []
        }
      })
    );

    expect(markup).toContain("No viewers currently watching.");
  });
});
