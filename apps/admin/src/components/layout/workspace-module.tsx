"use client";

import { useState, type ReactNode } from "react";

export type WorkspaceTab = {
  id: string;
  label: string;
  content: ReactNode;
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
  const [activeTab, setActiveTab] = useState(
    tabs.some((tab) => tab.id === initialTab) ? initialTab! : (tabs[0]?.id ?? ""),
  );
  const activeContent = tabs.find((tab) => tab.id === activeTab)?.content;

  return (
    <section className="mx-auto w-full max-w-[1320px] px-5 py-8 sm:px-8 sm:py-10">
      <header className="max-w-3xl">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">
          Academy workspace
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em]">{title}</h1>
        <p className="mt-2 text-sm leading-6 text-muted">{description}</p>
      </header>
      <div className="mt-6 border-b border-line">
        <div className="flex gap-1 overflow-x-auto" role="tablist" aria-label={`${title} sections`}>
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`${title.toLowerCase().replaceAll(" ", "-")}-${tab.id}-tab`}
              aria-selected={activeTab === tab.id}
              aria-controls={`${title.toLowerCase().replaceAll(" ", "-")}-${tab.id}-panel`}
              onClick={() => setActiveTab(tab.id)}
              className={`whitespace-nowrap border-b-2 px-4 py-3 text-sm transition-colors ${
                activeTab === tab.id
                  ? "border-accent font-semibold text-accent"
                  : "border-transparent text-muted hover:text-foreground"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>
      <div
        className="mt-1"
        role="tabpanel"
        id={`${title.toLowerCase().replaceAll(" ", "-")}-${activeTab}-panel`}
        aria-labelledby={`${title.toLowerCase().replaceAll(" ", "-")}-${activeTab}-tab`}
        tabIndex={0}
      >
        {activeContent}
      </div>
    </section>
  );
}
