"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const titleEl = document.getElementById("workspace-header-title");
    const subEl = document.getElementById("workspace-header-subtitle");
    if (titleEl && title) {
      titleEl.textContent = title;
    }
    if (subEl) {
      const subText =
        typeof description === "string"
          ? description
          : typeof eyebrow === "string"
            ? eyebrow
            : "";
      subEl.textContent = subText ? `• ${subText}` : "";
    }
  }, [title, description, eyebrow]);

  if (!mounted || !actions) return null;

  const target = document.getElementById("workspace-header-actions");
  if (!target) return null;

  return createPortal(actions, target);
}
