import { redirect } from "next/navigation";

export default function PerformanceRoute() {
  redirect("/analytics?section=performance");
}
