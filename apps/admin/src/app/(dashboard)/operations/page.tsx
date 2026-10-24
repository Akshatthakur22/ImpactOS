import { WorkspaceModule } from "@/components/layout/workspace-module";
import AttendancePage from "@/features/attendance/attendance-operations-page";
import FacilitiesPage from "@/features/branches/facilities-operations-page";
import CoachesPage from "@/features/coaches/coaches-operations-page";
import HolidaysPage from "@/features/holidays/holidays-operations-page";
import ClassesBatchesPage from "@/features/programs/classes-batches-page";
import OperationsCalendarPage from "@/features/schedule/operations-calendar";
import ScheduleRulesPage from "@/features/schedule/schedule-rules-page";
import { Icon } from "@/components/ui/icon";

export default async function OperationsPage({
  searchParams,
}: {
  searchParams: Promise<{ section?: string | string[] }>;
}) {
  const { section } = await searchParams;
  const requestedSection = Array.isArray(section) ? section[0] : section;
  const initial = requestedSection === "schedule" ? "calendar" : requestedSection;

  return (
    <WorkspaceModule
      title="Operations Center"
      description="Schedule • Manage • Track • Keep Your Academy Running Smoothly"
      hideTabs
      {...(initial ? { initialTab: initial } : { initialTab: "calendar" })}
      tabs={[
        {
          id: "calendar",
          label: "Calendar",
          icon: <Icon name="calendar" size={15} />,
          permission: "schedules:read",
          content: <OperationsCalendarPage />,
        },
        {
          id: "classes",
          label: "Classes & Batches",
          icon: <Icon name="academy" size={15} />,
          permissions: ["academy:manage", "students:read", "schedules:read"],
          content: <ClassesBatchesPage />,
        },
        {
          id: "coaches",
          label: "Coaches",
          icon: <Icon name="whistle" size={15} />,
          permissions: ["coaches:read"],
          content: <CoachesPage />,
        },
        {
          id: "facilities",
          label: "Facilities",
          icon: <Icon name="academy" size={15} />,
          permission: "settings:manage",
          content: <FacilitiesPage />,
        },
        {
          id: "attendance",
          label: "Attendance",
          icon: <Icon name="check-circle" size={15} />,
          permission: "attendance:read",
          content: <AttendancePage />,
        },
        {
          id: "rules",
          label: "Schedule Rules",
          icon: <Icon name="settings" size={15} />,
          permissions: ["schedules:write", "academy:manage"],
          content: <ScheduleRulesPage />,
        },
        {
          id: "holidays",
          label: "Holidays",
          icon: <Icon name="calendar" size={15} />,
          permissions: ["settings:manage", "schedules:read"],
          content: <HolidaysPage />,
        },
      ]}
    />
  );
}
