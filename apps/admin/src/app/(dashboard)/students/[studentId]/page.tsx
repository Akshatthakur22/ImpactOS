"use client";

import { use } from "react";
import StudentProfilePage from "@/features/students/profile-page";

export default function Page({ params }: { params: Promise<{ studentId: string }> }) {
  const { studentId } = use(params);
  return <StudentProfilePage key={studentId} studentId={studentId} />;
}
