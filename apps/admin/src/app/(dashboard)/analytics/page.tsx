import { WorkspaceModule } from "@/components/layout/workspace-module";
import PerformancePage from "@/features/performance/page";
import ReportsPage from "@/features/reports/page";

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ section?: string | string[] }>;
}) {
  const { section } = await searchParams;
  const requestedSection = Array.isArray(section) ? section[0] : section;
  return (
    <WorkspaceModule
      title="Analytics"
      description="Review attendance-based student progress and export academy records for a selected period."
      {...(requestedSection ? { initialTab: requestedSection } : {})}
      tabs={[
        { id: "performance", label: "Performance", permission: "reports:read", content: <PerformancePage /> },
        { id: "reports", label: "Reports", permission: "reports:read", content: <ReportsPage /> },
      ]}
    />
  );
}
