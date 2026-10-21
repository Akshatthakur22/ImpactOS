"use client";

import { use } from "react";
import CoachProfilePage from "@/features/coaches/profile-page";

export default function Page({ params }: { params: Promise<{ coachId: string }> }) {
  const { coachId } = use(params);
  return <CoachProfilePage key={coachId} coachId={coachId} />;
}
