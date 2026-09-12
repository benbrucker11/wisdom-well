import type { Metadata } from "next";
import { Inter, Libre_Baskerville } from "next/font/google";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { ReversedHorizontalLogo, SymbolMark } from "./_components/brand-logo";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-inter",
  display: "swap",
});

const baskerville = Libre_Baskerville({
  subsets: ["latin"],
  weight: ["400", "700"],
  style: ["normal", "italic"],
  variable: "--font-baskerville",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Wisdom Well",
  description:
    "A private place for families to capture the stories, lessons, values, and perspective they want future generations to know. Keep close what matters most.",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();

  return (
    <html lang="en" className={`${inter.variable} ${baskerville.variable}`}>
      <body className="flex min-h-screen flex-col">
        <a
          href="#main"
          className="sr-only focus-visible:not-sr-only focus-visible:absolute focus-visible:left-4 focus-visible:top-4 focus-visible:z-50 focus-visible:rounded-btn focus-visible:bg-well focus-visible:px-4 focus-visible:py-2 focus-visible:text-white"
        >
          Skip to content
        </a>
        <header className="border-b border-mist bg-white">
          <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-x-6 gap-y-3 px-6 py-4">
            <Link href="/" aria-label="Wisdom Well home" className="flex items-center">
              <SymbolMark />
            </Link>
            {user?.member ? (
              <nav
                aria-label="Primary"
                className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm font-medium"
              >
                <Link href="/entries" className="text-ink-soft no-underline hover:text-ink">
                  Entries
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
                <Link href="/steward" className="text-ink-soft no-underline hover:text-ink">
                  Steward
                </Link>
                <Link href="/interview" className="btn btn-primary btn-sm no-underline">
                  Record a memory
                </Link>
                <form action="/api/auth/logout" method="post">
                  <button type="submit" className="btn-text text-sm">
                    Sign out
                  </button>
                </form>
              </nav>
            ) : user ? (
              <form action="/api/auth/logout" method="post">
                <button type="submit" className="btn-text text-sm">
                  Sign out
                </button>
              </form>
            ) : null}
          </div>
        </header>
        <main id="main" className="mx-auto w-full max-w-[1200px] flex-1 px-6 py-12">
          {children}
        </main>
        <footer className="mt-auto bg-well">
          <div className="mx-auto flex max-w-[1200px] flex-col items-center gap-4 px-6 py-12 text-center">
            <ReversedHorizontalLogo width={180} />
            <p className="max-w-md text-sm text-mist">
              A private place for families to keep the stories, lessons, and wisdom worth
              carrying forward.
            </p>
            <p className="text-xs text-water">
              © {new Date().getFullYear()} Wisdom Well. Made for the people who come after.
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
