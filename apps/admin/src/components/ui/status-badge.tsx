const tones: Record<string, string> = {
  active: "bg-[#EBF9EE] text-[#34C759]",
  present: "bg-[#EBF9EE] text-[#34C759]",
  completed: "bg-[#EBF9EE] text-[#34C759]",
  paid: "bg-[#EBF9EE] text-[#34C759]",
  published: "bg-[#EBF9EE] text-[#34C759]",
  late: "bg-[#FFF6EB] text-[#FF9500]",
  pending: "bg-[#FFF6EB] text-[#FF9500]",
  scheduled: "bg-[#EBF5FF] text-[#007AFF]",
  lead: "bg-[#EBF5FF] text-[#007AFF]",
  absent: "bg-[#FFF1F0] text-[#FF3B30]",
  overdue: "bg-[#FFF1F0] text-[#FF3B30]",
  cancelled: "bg-[#FFF1F0] text-[#FF3B30]",
  inactive: "bg-[#F2F2F7] text-[#8E8E93]",
  suspended: "bg-[#FFF6EB] text-[#FF9500]",
  excused: "bg-[#F5F3FF] text-[#5856D6]",
  voided: "bg-[#F2F2F7] text-[#8E8E93]",
  withdrawn: "bg-[#F2F2F7] text-[#8E8E93]",
  draft: "bg-[#F2F2F7] text-[#8E8E93]",
};

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  return (
    <span className={`inline-flex min-h-6 items-center rounded-full px-2.5 text-[10px] font-semibold capitalize tracking-[0.01em] ${tones[status.toLowerCase()] ?? "bg-[#f0f2f0] text-[#6e7973]"}`}>
      {label ?? status.replaceAll("_", " ")}
    </span>
  );
}
