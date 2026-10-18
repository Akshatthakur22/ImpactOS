import type { DashboardRepository } from "../../db/dashboard.repository.js";

export function createDashboardService(repository: DashboardRepository) {
  return {
    getOverview(academyId: string, now = new Date()) {
      return repository.getOverview(academyId, now);
    },
  };
}

export type SportDeskDashboardService = ReturnType<typeof createDashboardService>;
