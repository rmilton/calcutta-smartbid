import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  buildPlatformAdminErrorResponse: vi.fn(),
  getAdminCenterData: vi.fn()
}));

vi.mock("@/lib/auth", () => ({
  buildPlatformAdminErrorResponse: mocks.buildPlatformAdminErrorResponse
}));

vi.mock("@/lib/repository", () => ({
  getSessionRepository: () => ({
    getAdminCenterData: mocks.getAdminCenterData
  })
}));

import { GET } from "./route";

describe("GET /api/admin/center", () => {
  beforeEach(() => {
    mocks.buildPlatformAdminErrorResponse.mockReset();
    mocks.getAdminCenterData.mockReset();
  });

  it("returns the active viewer count in session summaries", async () => {
    mocks.buildPlatformAdminErrorResponse.mockResolvedValue(null);
    mocks.getAdminCenterData.mockResolvedValue({
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
          importReadinessSummary: "Ready",
          purchaseCount: 4,
          syndicateCount: 6,
          overrideCount: 1,
          adminCount: 1,
          viewerCount: 8,
          activeViewerCount: 3
        }
      ],
      platformUsers: [],
      syndicateCatalog: [],
      dataSources: []
    });

    const response = await GET();
    const payload = (await response.json()) as {
      sessions: Array<{ activeViewerCount: number }>;
    };

    expect(response.status).toBe(200);
    expect(payload.sessions[0]?.activeViewerCount).toBe(3);
  });
});
