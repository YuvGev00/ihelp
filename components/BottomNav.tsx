"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { S } from "@/lib/strings";

/**
 * Mobile bottom tab bar (redesign): the phone-native navigation. Five slots
 * with the "new request" FAB raised in the center. Hidden on desktop (md+),
 * where the top nav takes over. Active tab is brand-green; the rest muted.
 */

type IconProps = { className?: string };

function HomeIcon({ className }: IconProps) {
  return (
    <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M3 10.5 12 3.5l9 7" />
      <path d="M5.5 10V20h13V10" />
    </svg>
  );
}
function DocIcon({ className }: IconProps) {
  return (
    <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="5" y="4" width="14" height="17" rx="2.5" />
      <path d="M9 9h6M9 13h6M9 17h3" />
    </svg>
  );
}
function OffersIcon({ className }: IconProps) {
  return (
    <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M20 15a2 2 0 0 1-2 2H8l-4 4V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2z" />
    </svg>
  );
}
function ProfileIcon({ className }: IconProps) {
  return (
    <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4.5 20c0-4 3.5-6 7.5-6s7.5 2 7.5 6" />
    </svg>
  );
}

const TABS = [
  { href: "/requests", label: S.nav.requests, Icon: HomeIcon, exact: true },
  { href: "/my/requests", label: S.nav.myRequests, Icon: DocIcon },
  { href: "/my/offers", label: S.nav.myOffers, Icon: OffersIcon },
  { href: "/profile", label: S.nav.profile, Icon: ProfileIcon },
];

export function BottomNav() {
  const pathname = usePathname();
  const active = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname.startsWith(href);

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 flex items-end border-t border-line bg-white px-2.5 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 md:hidden">
      {/* first two tabs */}
      {TABS.slice(0, 2).map(({ href, label, Icon, exact }) => (
        <Tab key={href} href={href} label={label} Icon={Icon} on={active(href, exact)} />
      ))}
      {/* center FAB — new request */}
      <div className="flex flex-1 justify-center">
        <Link
          href="/requests/new"
          aria-label={S.requests.newRequest}
          className="-mt-7 flex items-center justify-center rounded-full border-4 border-white bg-brand text-3xl leading-none text-white shadow-[0_10px_20px_-6px_rgba(13,122,95,.7)]"
          style={{ height: 52, width: 52 }}
        >
          +
        </Link>
      </div>
      {/* last two tabs */}
      {TABS.slice(2).map(({ href, label, Icon, exact }) => (
        <Tab key={href} href={href} label={label} Icon={Icon} on={active(href, exact)} />
      ))}
    </nav>
  );
}

function Tab({
  href,
  label,
  Icon,
  on,
}: {
  href: string;
  label: string;
  Icon: (p: IconProps) => React.ReactElement;
  on: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={on ? "page" : undefined}
      className={`flex flex-1 flex-col items-center gap-1 ${on ? "text-brand" : "text-muted"}`}
    >
      <Icon />
      <span className={`whitespace-nowrap text-[10px] ${on ? "font-bold" : "font-semibold"}`}>
        {label}
      </span>
    </Link>
  );
}
