import { redirect } from "next/navigation";

export default function ReportsRoute() {
  redirect("/analytics?section=reports");
}
