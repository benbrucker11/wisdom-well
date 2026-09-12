"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { HorizontalLogo } from "./brand-logo";

const TABS = [
  { href: "/entries", label: "Entries" },
  { href: "/family", label: "Family" },
  { href: "/confirmations", label: "Confirmations" },
  { href: "/steward", label: "Steward" },
];

function NavTab({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      role="tab"
      aria-selected={active}
      className={`relative block rounded-t-md px-3 py-2 text-sm font-semibold uppercase tracking-wide no-underline transition-colors ${
        active ? "text-well" : "text-ink-soft hover:text-ink"
      }`}
    >
      {label}
      <span
        aria-hidden="true"
        className={`absolute inset-x-2 -bottom-px hidden h-[3px] rounded-full sm:block ${
          active ? "bg-well" : "bg-transparent"
        }`}
      />
    </Link>
  );
}

export function SiteHeader({ showNav }: { showNav: boolean }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <header className="border-b border-mist bg-white">
      <div className="mx-auto flex max-w-[1200px] items-center justify-between gap-4 px-6 py-3">
        <Link href="/" aria-label="Wisdom Well home" className="flex shrink-0 items-center">
          <HorizontalLogo width={168} />
        </Link>

        {showNav ? (
          <>
            <nav aria-label="Primary" role="tablist" className="hidden items-center gap-1 sm:flex">
              {TABS.map((tab) => (
                <NavTab key={tab.href} {...tab} active={isActive(tab.href)} />
              ))}
            </nav>
            <div className="hidden items-center gap-3 sm:flex">
              <Link href="/interview" className="btn btn-primary btn-sm no-underline">
                Record a memory
              </Link>
              <form action="/api/auth/logout" method="post">
                <button type="submit" className="btn-text text-sm">
                  Sign out
                </button>
              </form>
            </div>
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              aria-controls="mobile-nav"
              className="flex h-10 w-10 items-center justify-center rounded-md text-ink sm:hidden"
              aria-label={open ? "Close menu" : "Open menu"}
            >
              <span className="relative block h-4 w-5">
                <span
                  className={`absolute left-0 top-0 h-0.5 w-5 rounded-full bg-current transition-transform ${open ? "translate-y-[7px] rotate-45" : ""}`}
                />
                <span
                  className={`absolute left-0 top-1.5 h-0.5 w-5 rounded-full bg-current transition-opacity ${open ? "opacity-0" : ""}`}
                />
                <span
                  className={`absolute left-0 top-3 h-0.5 w-5 rounded-full bg-current transition-transform ${open ? "-translate-y-[7px] -rotate-45" : ""}`}
                />
              </span>
            </button>
          </>
        ) : null}
      </div>

      {showNav && open ? (
        <div id="mobile-nav" className="border-t border-mist bg-white px-6 py-3 sm:hidden">
          <nav aria-label="Primary" className="flex flex-col">
            {TABS.map((tab) => (
              <Link
                key={tab.href}
                href={tab.href}
                className={`rounded-md px-2 py-2.5 text-base font-semibold no-underline ${
                  isActive(tab.href) ? "text-well" : "text-ink-soft"
                }`}
              >
                {tab.label}
              </Link>
            ))}
          </nav>
          <div className="mt-3 flex flex-col gap-3 border-t border-mist pt-3">
            <Link href="/interview" className="btn btn-primary no-underline">
              Record a memory
            </Link>
            <form action="/api/auth/logout" method="post">
              <button type="submit" className="btn-text w-full text-left text-sm">
                Sign out
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </header>
  );
}
