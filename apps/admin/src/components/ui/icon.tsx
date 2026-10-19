import type { SVGProps } from "react";

export type IconName =
  | "dashboard"
  | "inbox"
  | "people"
  | "whistle"
  | "academy"
  | "calendar"
  | "check-circle"
  | "wallet"
  | "chart"
  | "megaphone"
  | "settings"
  | "shield"
  | "menu"
  | "close"
  | "chevron-down"
  | "chevron-left"
  | "chevron-right"
  | "search"
  | "plus"
  | "arrow-right"
  | "refresh"
  | "more";

const paths: Record<IconName, React.ReactNode> = {
  dashboard: <><rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="4" rx="1.5"/><rect x="13.5" y="9.5" width="7" height="11" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/></>,
  inbox: <><rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M3 13h4l2 3h6l2-3h4"/></>,
  people: <><path d="M16 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 18.5V20"/><circle cx="10" cy="7.5" r="3.5"/><path d="M16 4.3a3.5 3.5 0 0 1 0 6.8M17 15h.5a3.5 3.5 0 0 1 3.5 3.5V20"/></>,
  whistle: <><path d="M4 11h8.5a6.5 6.5 0 1 1-6.2 8.5"/><path d="M4 11v6h4M12.5 11l2-5h5l1.5 5M5 8h5"/></>,
  academy: <><path d="m3 9 9-5 9 5-9 5-9-5Z"/><path d="M6 11v5c3 3 9 3 12 0v-5M21 9v6"/></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2.5"/><path d="M7 3v4M17 3v4M3 10h18"/></>,
  "check-circle": <><circle cx="12" cy="12" r="9"/><path d="m8 12 2.5 2.5L16.5 9"/></>,
  wallet: <><rect x="3" y="5" width="18" height="15" rx="2.5"/><path d="M3 9h18M16 14h2"/><path d="M6 5V3h13"/></>,
  chart: <><path d="M4 19V5M4 19h17"/><path d="m7 15 4-4 3 2 6-7"/><path d="M16 6h4v4"/></>,
  megaphone: <><path d="m3 11 17-6v14L3 13v-2Z"/><path d="m6 14 2 6h4l-2-4M20 10a3 3 0 0 1 0 4"/></>,
  settings: <><circle cx="12" cy="12" r="3"/><path d="m19.4 15 .1.1a1.8 1.8 0 1 1-2.5 2.5l-.1-.1a1.8 1.8 0 0 0-3 .9v.2a1.8 1.8 0 1 1-3.6 0v-.2a1.8 1.8 0 0 0-3-.9l-.1.1a1.8 1.8 0 1 1-2.5-2.5l.1-.1a1.8 1.8 0 0 0-.9-3H3.8a1.8 1.8 0 1 1 0-3.6H4a1.8 1.8 0 0 0 .9-3l-.1-.1a1.8 1.8 0 1 1 2.5-2.5l.1.1a1.8 1.8 0 0 0 3-.9v-.2a1.8 1.8 0 1 1 3.6 0V4a1.8 1.8 0 0 0 3 .9l.1-.1a1.8 1.8 0 1 1 2.5 2.5l-.1.1a1.8 1.8 0 0 0 .9 3h.2a1.8 1.8 0 1 1 0 3.6H20a1.8 1.8 0 0 0-.6 1Z"/></>,
  shield: <><path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z"/><path d="m9 12 2 2 4-4"/></>,
  menu: <><path d="M4 6h16M4 12h16M4 18h16"/></>,
  close: <><path d="m18 6-12 12M6 6l12 12"/></>,
  "chevron-down": <path d="m6 9 6 6 6-6"/>,
  "chevron-left": <path d="m15 18-6-6 6-6"/>,
  "chevron-right": <path d="m9 18 6-6-6-6"/>,
  search: <><circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 4.5 4.5"/></>,
  plus: <><path d="M12 5v14M5 12h14"/></>,
  "arrow-right": <><path d="M4 12h15M13 6l6 6-6 6"/></>,
  refresh: <><path d="M20 7v5h-5M4 17v-5h5"/><path d="M5.5 9a7 7 0 0 1 11.8-2L20 12M4 12l2.7 5a7 7 0 0 0 11.8-2"/></>,
  more: <><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></>,
};

export function Icon({ name, size = 18, strokeWidth = 1.8, ...props }: SVGProps<SVGSVGElement> & {
  name: IconName;
  size?: number;
  strokeWidth?: number;
}) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      {paths[name]}
    </svg>
  );
}
