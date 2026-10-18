import { redirect } from "next/navigation";

export default function ScheduleRoute() {
  redirect("/operations?section=schedule");
}
