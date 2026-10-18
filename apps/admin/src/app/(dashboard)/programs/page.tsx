import { redirect } from "next/navigation";

export default function ProgramsRoute() {
  redirect("/operations?section=programs");
}
