import { redirect } from "next/navigation";

export default function AttendanceRoute() {
  redirect("/operations?section=attendance");
}
