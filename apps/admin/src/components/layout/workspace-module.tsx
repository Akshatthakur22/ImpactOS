"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { Permission } from "@sportdesk/contracts";
import { useAuth } from "@/hooks/use-auth";
import { PageHeader } from "@/components/layout/page-header";

export type WorkspaceTab = {
  id: string;
  label: string;
  icon?: ReactNode;
  content: ReactNode;
  permission?: Permission;
  permissions?: Permission[];
};

export function WorkspaceModule({
  title,
  description,
  initialTab,
  tabs,
  hideTabs = false,
}: {
  title: string;
  description: string;
  initialTab?: string;
  tabs: WorkspaceTab[];
  hideTabs?: boolean;
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
  const aliasMap: Record<string, string> = {
    schedule: "calendar",
    programs: "classes",
    batches: "classes",
    branches: "facilities",
  };
  const resolvedRequested = aliasMap[requestedTab] || requestedTab;
  const activeTab = visibleTabs.some((tab) => tab.id === resolvedRequested)
    ? resolvedRequested
    : (visibleTabs.some((tab) => tab.id === requestedTab)
      ? requestedTab
      : (visibleTabs[0]?.id ?? ""));
  const activeContent = visibleTabs.find((tab) => tab.id === activeTab)?.content;

  useEffect(() => {
    if (initialTab) {
      setRequestedTab(initialTab);
    }
  }, [initialTab]);

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
    <section className="flex flex-col flex-1 min-h-0 w-full max-w-[1600px] mx-auto px-4 py-2 sm:px-6 pb-4">
      <PageHeader
        title={hideTabs ? (visibleTabs.find((t) => t.id === activeTab)?.label ?? title) : title}
        description={description}
      />
      {!hideTabs && (
        <div className="shrink-0 border-b border-[#E5E5EA] bg-white sticky top-0 z-20">
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
                className={`flex items-center gap-2 whitespace-nowrap border-b-2 px-3.5 py-2.5 text-[13px] transition-colors sm:px-4 ${
                  activeTab === tab.id
                    ? "border-[#007AFF] font-semibold text-[#007AFF]"
                    : "border-transparent text-[#6E6E73] hover:text-[#1D1D1F]"
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      )}
      {activeContent ? (
        <div
          className="workspace-panel flex-1 min-h-0 pt-2 transition-opacity duration-150 animate-in fade-in"
          role="tabpanel"
          id={`${title.toLowerCase().replaceAll(" ", "-")}-${activeTab}-panel`}
          aria-labelledby={`${title.toLowerCase().replaceAll(" ", "-")}-${activeTab}-tab`}
          tabIndex={0}
        >
          {activeContent}
        </div>
      ) : (
        <div className="mt-6 rounded-2xl border border-dashed border-[#d7dfda] bg-white p-8 text-center text-sm text-[#718079]">
          You do not have access to any sections in this workspace.
        </div>
      )}
    </section>
  );
}
