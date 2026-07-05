"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useStore } from "@/lib/store";
import Onboarding from "./Onboarding";
import ScanSheet from "./ScanSheet";

function HomeIcon({ active }: { active: boolean }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M3.5 10.5 12 3.5l8.5 7v9a1 1 0 0 1-1 1h-5v-6h-5v6h-5a1 1 0 0 1-1-1v-9Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
        fill={active ? "currentColor" : "none"}
      />
    </svg>
  );
}

function ChartIcon({ active }: { active: boolean }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect
        x="4"
        y="12"
        width="4"
        height="8"
        rx="1"
        stroke="currentColor"
        strokeWidth="1.8"
        fill={active ? "currentColor" : "none"}
      />
      <rect
        x="10"
        y="7"
        width="4"
        height="13"
        rx="1"
        stroke="currentColor"
        strokeWidth="1.8"
        fill={active ? "currentColor" : "none"}
      />
      <rect
        x="16"
        y="3.5"
        width="4"
        height="16.5"
        rx="1"
        stroke="currentColor"
        strokeWidth="1.8"
        fill={active ? "currentColor" : "none"}
      />
    </svg>
  );
}

function GearIcon({ active }: { active: boolean }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle
        cx="12"
        cy="12"
        r="3"
        stroke="currentColor"
        strokeWidth="1.8"
        fill={active ? "currentColor" : "none"}
      />
      <path
        d="M12 2.8 13.6 5a7.6 7.6 0 0 1 2.7 1.1l2.7-.6 1.6 2.8-1.9 2a7.7 7.7 0 0 1 0 3.2l1.9 2-1.6 2.8-2.7-.6a7.6 7.6 0 0 1-2.7 1.1L12 21.2 10.4 19a7.6 7.6 0 0 1-2.7-1.1l-2.7.6-1.6-2.8 1.9-2a7.7 7.7 0 0 1 0-3.2l-1.9-2 1.6-2.8 2.7.6A7.6 7.6 0 0 1 10.4 5L12 2.8Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const TABS = [
  { href: "/", label: "Home", Icon: HomeIcon },
  { href: "/analytics", label: "Analytics", Icon: ChartIcon },
  { href: "/settings", label: "Settings", Icon: GearIcon },
];

export default function AppShell({ children }: { children: ReactNode }) {
  const { hydrated, onboarded } = useStore();
  const [scanOpen, setScanOpen] = useState(false);
  const pathname = usePathname();

  if (!hydrated) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-md items-center justify-center">
        <div className="h-10 w-10 animate-pulse rounded-full bg-grid" />
      </div>
    );
  }

  if (!onboarded) {
    return (
      <div className="mx-auto min-h-dvh max-w-md">
        <Onboarding />
      </div>
    );
  }

  return (
    <div className="mx-auto min-h-dvh max-w-md">
      <main className="px-5 pb-32 pt-4">{children}</main>

      {/* Bottom navigation */}
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-md border-t border-black/[0.07] bg-card/95 px-6 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-2 backdrop-blur"
      >
        <div className="flex items-center justify-between">
          {TABS.slice(0, 2).map(({ href, label, Icon }) => (
            <TabLink key={href} href={href} label={label} active={pathname === href} Icon={Icon} />
          ))}

          <button
            type="button"
            onClick={() => setScanOpen(true)}
            aria-label="Scan food"
            className="-mt-7 flex h-14 w-14 items-center justify-center rounded-full bg-ink text-white shadow-lg transition-transform active:scale-95"
          >
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
            </svg>
          </button>

          {TABS.slice(2).map(({ href, label, Icon }) => (
            <TabLink key={href} href={href} label={label} active={pathname === href} Icon={Icon} />
          ))}
          {/* spacer to balance the grid (2 tabs left, 1 right) */}
          <div className="w-12" aria-hidden />
        </div>
      </nav>

      {scanOpen && <ScanSheet onClose={() => setScanOpen(false)} />}
    </div>
  );
}

function TabLink({
  href,
  label,
  active,
  Icon,
}: {
  href: string;
  label: string;
  active: boolean;
  Icon: (props: { active: boolean }) => ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`flex w-12 flex-col items-center gap-0.5 py-1 text-[10px] font-medium ${
        active ? "text-ink" : "text-muted"
      }`}
    >
      <Icon active={active} />
      {label}
    </Link>
  );
}
