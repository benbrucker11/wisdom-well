import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import "./globals.css";

export const metadata: Metadata = {
  title: "Wisdom Well",
  description:
    "A family's stories, values, and ideals — kept for the people who come after.",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();

  return (
    <html lang="en">
      <body className="min-h-screen">
        <header className="border-b border-rule">
          <div className="mx-auto flex max-w-3xl flex-wrap items-baseline justify-between gap-x-6 gap-y-2 px-6 py-5">
            <Link
              href="/"
              className="font-serif text-xl tracking-tight text-ink no-underline"
            >
              Wisdom&nbsp;Well
            </Link>
            {user?.member ? (
              <nav className="flex items-baseline gap-5 text-sm">
                <Link href="/entries" className="text-ink-soft no-underline hover:text-ink">
                  Entries
                </Link>
                <Link href="/interview" className="text-ink-soft no-underline hover:text-ink">
                  Record
                </Link>
                <Link href="/family" className="text-ink-soft no-underline hover:text-ink">
                  Family
                </Link>
                <Link
                  href="/confirmations"
                  className="text-ink-soft no-underline hover:text-ink"
                >
                  Confirmations
                </Link>
                <Link
                  href="/steward"
                  className="text-ink-soft no-underline hover:text-ink"
                >
                  Steward
                </Link>
                <form action="/api/auth/logout" method="post">
                  <button type="submit" className="text-ink-soft hover:text-ink">
                    Sign out
                  </button>
                </form>
              </nav>
            ) : user ? (
              <form action="/api/auth/logout" method="post">
                <button
                  type="submit"
                  className="text-sm text-ink-soft hover:text-ink"
                >
                  Sign out
                </button>
              </form>
            ) : null}
          </div>
        </header>
        <main className="mx-auto max-w-3xl px-6 py-12">{children}</main>
      </body>
    </html>
  );
}
