"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { S } from "@/lib/strings";

const LINKS = [
  { href: "/requests", label: S.nav.requests },
  { href: "/my/requests", label: S.nav.myRequests },
  { href: "/my/offers", label: S.nav.myOffers },
  { href: "/verification", label: S.nav.verification },
];

/** Primary nav links with active-page highlighting (underline + weight). */
export function NavLinks({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === "/requests"
      ? pathname === "/requests"
      : pathname.startsWith(href);

  const cls = (href: string) =>
    isActive(href)
      ? "font-semibold text-brand underline underline-offset-4 decoration-2"
      : "text-body hover:text-brand";

  return (
    <>
      {LINKS.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          className={cls(l.href)}
          aria-current={isActive(l.href) ? "page" : undefined}
        >
          {l.label}
        </Link>
      ))}
      {isAdmin && (
        <Link
          href="/admin"
          aria-current={pathname.startsWith("/admin") ? "page" : undefined}
          className={
            pathname.startsWith("/admin")
              ? "font-semibold text-purple-700 underline underline-offset-4 decoration-2"
              : "font-semibold text-purple-700 hover:text-purple-800"
          }
        >
          {S.nav.admin}
        </Link>
      )}
    </>
  );
}
