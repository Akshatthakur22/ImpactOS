const tones: Record<string, string> = {
  active: "bg-[#e9f4ee] text-[#35765b]",
  present: "bg-[#e9f4ee] text-[#35765b]",
  completed: "bg-[#e9f4ee] text-[#35765b]",
  paid: "bg-[#e9f4ee] text-[#35765b]",
  published: "bg-[#e9f4ee] text-[#35765b]",
  late: "bg-[#fff3df] text-[#946629]",
  pending: "bg-[#fff3df] text-[#946629]",
  scheduled: "bg-[#edf3f8] text-[#4c6a82]",
  lead: "bg-[#edf3f8] text-[#4c6a82]",
  absent: "bg-[#fff0ed] text-[#a34f42]",
  overdue: "bg-[#fff0ed] text-[#a34f42]",
  cancelled: "bg-[#fff0ed] text-[#a34f42]",
  inactive: "bg-[#f0f2f0] text-[#6e7973]",
  suspended: "bg-[#fff3df] text-[#946629]",
  excused: "bg-[#f1eef8] text-[#75658f]",
  voided: "bg-[#f0f2f0] text-[#6e7973]",
  withdrawn: "bg-[#f0f2f0] text-[#6e7973]",
  draft: "bg-[#f0f2f0] text-[#6e7973]",
};

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  return (
    <span className={`inline-flex min-h-6 items-center rounded-full px-2.5 text-[10px] font-semibold capitalize tracking-[0.01em] ${tones[status.toLowerCase()] ?? "bg-[#f0f2f0] text-[#6e7973]"}`}>
      {label ?? status.replaceAll("_", " ")}
    </span>
  );
}
