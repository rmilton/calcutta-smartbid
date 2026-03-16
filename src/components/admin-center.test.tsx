import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockUseFeedbackMessage } = vi.hoisted(() => ({
  mockUseFeedbackMessage: vi.fn()
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: Record<string, unknown>) =>
    createElement("a", { href, ...props }, children)
}));

vi.mock("@/components/logout-button", () => ({
  LogoutButton: () => createElement("button", null, "logout")
}));

vi.mock("@/components/theme-toggle", () => ({
  ThemeToggle: () => createElement("button", null, "theme")
}));

vi.mock("@/lib/hooks/use-feedback-message", () => ({
  useFeedbackMessage: mockUseFeedbackMessage
}));

describe("AdminCenter", () => {
  beforeEach(() => {
    globalThis.React = React;
    mockUseFeedbackMessage.mockReturnValue({
      error: null,
      notice: null,
      clearFeedback: vi.fn(),
      showError: vi.fn(),
      showNotice: vi.fn()
    });
  });

  it("renders live viewer counts in the sessions table", async () => {
    const { AdminCenter } = await import("@/components/admin-center");
    const markup = renderToStaticMarkup(
      createElement(AdminCenter, {
        platformAdminEmail: "admin@example.com",
        initialData: {
          sessions: [
            {
              id: "session_1",
              name: "Prime Room",
              createdAt: "2026-03-16T12:00:00.000Z",
              updatedAt: "2026-03-16T12:05:00.000Z",
              isArchived: false,
              archivedAt: null,
              projectionProvider: "session-imports",
              bracketSourceName: "Bracket Feed",
              analysisSourceName: "Analysis Feed",
              importReadinessStatus: "ready",
              importReadinessSummary: "Ready to open",
              purchaseCount: 3,
              syndicateCount: 6,
              overrideCount: 1,
              adminCount: 1,
              viewerCount: 9,
              activeViewerCount: 4
            }
          ],
          platformUsers: [],
          syndicateCatalog: [],
          dataSources: []
        }
      })
    );

    expect(markup).toContain("Live viewers");
    expect(markup).toContain("4 active");
  });
});
