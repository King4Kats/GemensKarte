import type { ReactNode } from "react";

export type IconName =
  | "search" | "pin" | "arrow" | "arrowUpRight" | "close" | "users" | "mail"
  | "phone" | "globe" | "insta" | "facebook" | "heart" | "sparkle" | "calendar"
  | "layers" | "list" | "check" | "chevron";

const PATHS: Record<IconName, ReactNode> = {
  search: <><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></>,
  pin: <><path d="M12 21s-7-6.3-7-11a7 7 0 0 1 14 0c0 4.7-7 11-7 11Z" /><circle cx="12" cy="10" r="2.5" /></>,
  arrow: <><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></>,
  arrowUpRight: <><path d="M7 17 17 7" /><path d="M8 7h9v9" /></>,
  close: <><path d="M6 6l12 12" /><path d="M18 6 6 18" /></>,
  users: <><path d="M16 19a4 4 0 0 0-8 0" /><circle cx="12" cy="8" r="3.2" /><path d="M5.5 19a3.2 3.2 0 0 1 4-3" /><path d="M18.5 19a3.2 3.2 0 0 0-4-3" /></>,
  mail: <><rect x="3" y="5" width="18" height="14" rx="2.5" /><path d="m4 7 8 6 8-6" /></>,
  phone: <><path d="M5 4h3l2 5-2 1a11 11 0 0 0 5 5l1-2 5 2v3a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z" /></>,
  globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18" /><path d="M12 3c2.6 2.4 4 5.6 4 9s-1.4 6.6-4 9c-2.6-2.4-4-5.6-4-9s1.4-6.6 4-9Z" /></>,
  insta: <><rect x="4" y="4" width="16" height="16" rx="5" /><circle cx="12" cy="12" r="3.6" /><circle cx="17" cy="7" r="1" fill="currentColor" stroke="none" /></>,
  facebook: <><path d="M14 8.5h2.5V5.5H14c-2 0-3.2 1.3-3.2 3.3v1.7H8.5v3h2.3V21h3v-7.5h2.4l.5-3h-2.9V9.2c0-.5.3-.7.8-.7Z" /></>,
  heart: <><path d="M12 20s-7-4.5-9-9C1.5 7.5 3 4.5 6 4.5c2 0 3 1.2 3.5 2 .5-.8 1.5-2 3.5-2 3 0 4.5 3 3 6.5-2 4.5-7 9-7 9Z" /></>,
  sparkle: <><path d="M12 3v6M12 15v6M3 12h6M15 12h6" /></>,
  calendar: <><rect x="4" y="5" width="16" height="15" rx="2.5" /><path d="M4 9h16M8 3v4M16 3v4" /></>,
  layers: <><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="m3 13 9 5 9-5" /></>,
  list: <><path d="M8 6h12M8 12h12M8 18h12" /><circle cx="4" cy="6" r="1" fill="currentColor" stroke="none" /><circle cx="4" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="4" cy="18" r="1" fill="currentColor" stroke="none" /></>,
  check: <><path d="m5 12 4.5 4.5L19 7" /></>,
  chevron: <><path d="m9 6 6 6-6 6" /></>,
};

export function Icon({ name, size = 18, stroke = 2 }: { name: IconName; size?: number; stroke?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {PATHS[name]}
    </svg>
  );
}
