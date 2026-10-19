"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { Permission } from "@sportdesk/contracts";
import { useAuth } from "@/hooks/use-auth";

export type WorkspaceTab = {
  id: string;
  label: string;
  content: ReactNode;
  permission?: Permission;
  permissions?: Permission[];
};

export function WorkspaceModule({
  title,
  description,
  initialTab,
  tabs,
}: {
  title: string;
  description: string;
  initialTab?: string;
  tabs: WorkspaceTab[];
}) {
  const { user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const visibleTabs = tabs.filter(
    (tab) => user?.role === "owner" ||
      (tab.permission ? user?.permissions?.includes(tab.permission) : false) ||
      (tab.permissions?.some((permission) => user?.permissions?.includes(permission)) ?? false),
  );
  const [requestedTab, setRequestedTab] = useState(initialTab ?? "");
  const requested = requestedTab;
  const activeTab = visibleTabs.some((tab) => tab.id === requested)
    ? requested
    : (visibleTabs[0]?.id ?? "");
  const activeContent = visibleTabs.find((tab) => tab.id === activeTab)?.content;

  useEffect(() => {
    const syncTab = (event?: Event) => {
      const nextTab = event instanceof CustomEvent && typeof event.detail === "string"
        ? event.detail
        : new URLSearchParams(window.location.search).get("section");
      if (nextTab) setRequestedTab(nextTab);
    };
    syncTab();
    window.addEventListener("popstate", syncTab);
    window.addEventListener("sportdesk:section-change", syncTab);
    return () => {
      window.removeEventListener("popstate", syncTab);
      window.removeEventListener("sportdesk:section-change", syncTab);
    };
  }, [pathname]);

  function selectTab(tabId: string) {
    setRequestedTab(tabId);
    const params = new URLSearchParams(window.location.search);
    params.set("section", tabId);
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
    window.dispatchEvent(new CustomEvent("sportdesk:section-change", { detail: tabId }));
  }

  return (
    <section className="mx-auto w-full max-w-[1440px] px-4 py-6 sm:px-7 sm:py-8 xl:px-10">
      <header className="max-w-3xl">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#7d8984]">Workspace</p>
        <h2 className="mt-1 text-xl font-semibold tracking-[-0.025em] text-[#24312c]">{title}</h2>
        <p className="mt-1.5 text-[13px] leading-5 text-[#73807a]">{description}</p>
      </header>
      <div className="mt-5 border-b border-[#e5eae6]">
        <div className="flex gap-1 overflow-x-auto" role="tablist" aria-label={`${title} sections`}>
          {visibleTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`${title.toLowerCase().replaceAll(" ", "-")}-${tab.id}-tab`}
              aria-selected={activeTab === tab.id}
              aria-controls={`${title.toLowerCase().replaceAll(" ", "-")}-${tab.id}-panel`}
              onClick={() => {
                selectTab(tab.id);
              }}
              onKeyDown={(event) => {
                if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
                event.preventDefault();
                const currentIndex = visibleTabs.findIndex((item) => item.id === activeTab);
                const delta = event.key === "ArrowRight" ? 1 : -1;
                const next = visibleTabs[(currentIndex + delta + visibleTabs.length) % visibleTabs.length];
                if (!next) return;
                selectTab(next.id);
                document.getElementById(`${title.toLowerCase().replaceAll(" ", "-")}-${next.id}-tab`)?.focus();
              }}
              tabIndex={activeTab === tab.id ? 0 : -1}
              className={`whitespace-nowrap border-b-2 px-3 py-2.5 text-[13px] transition-colors sm:px-4 ${
                activeTab === tab.id
                  ? "border-[#176e67] font-semibold text-[#176e67]"
                  : "border-transparent text-[#77837e] hover:text-[#26332e]"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>
      {activeContent ? <div
        className="workspace-panel mt-1"
        role="tabpanel"
        id={`${title.toLowerCase().replaceAll(" ", "-")}-${activeTab}-panel`}
        aria-labelledby={`${title.toLowerCase().replaceAll(" ", "-")}-${activeTab}-tab`}
        tabIndex={0}
      >
        {activeContent}
      </div> : <div className="mt-6 rounded-2xl border border-dashed border-[#d7dfda] bg-white p-8 text-center text-sm text-[#718079]">You do not have access to any sections in this workspace.</div>}
    </section>
  );
}
