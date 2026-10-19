import { WorkspaceModule } from "@/components/layout/workspace-module";
import AttendancePage from "@/features/attendance/page";
import BranchesPage from "@/features/branches/page";
import ProgramsPage from "@/features/programs/page";
import SchedulePage from "@/features/schedule/page";

export default async function OperationsPage({
  searchParams,
}: {
  searchParams: Promise<{ section?: string | string[] }>;
}) {
  const { section } = await searchParams;
  const requestedSection = Array.isArray(section) ? section[0] : section;
  return (
    <WorkspaceModule
      title="Academy operations"
      description="Manage your programs, batches, class timetable, and attendance from one place."
      {...(requestedSection ? { initialTab: requestedSection } : {})}
      tabs={[
        { id: "programs", label: "Programs & batches", permissions: ["academy:manage", "students:read", "schedules:read"], content: <ProgramsPage /> },
        { id: "branches", label: "Branches", permission: "settings:manage", content: <BranchesPage /> },
        { id: "schedule", label: "Schedule", permission: "schedules:read", content: <SchedulePage /> },
        { id: "attendance", label: "Attendance", permission: "attendance:read", content: <AttendancePage /> },
      ]}
    />
  );
}
