import { redirect } from "next/navigation";

export default function BatchesRoute() {
  redirect("/operations?section=programs");
}
