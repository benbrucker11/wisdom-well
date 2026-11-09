import type { Metadata } from "next";
import { Inter, Libre_Baskerville } from "next/font/google";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { HeaderLogo, ReversedLogo } from "./_components/brand-logo";
import { SiteHeader } from "./_components/site-header";
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
  manifest: "/site.webmanifest",
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
        {user?.member ? (
          <SiteHeader showNav />
        ) : (
          <header className="border-b border-mist bg-white">
            <div className="mx-auto flex max-w-[1200px] items-center justify-between px-6 py-3">
              <Link href="/" aria-label="Wisdom Well home" className="flex items-center">
                <HeaderLogo />
              </Link>
              {user ? (
                <form action="/api/auth/logout" method="post">
                  <button type="submit" className="btn-text text-sm">
                    Sign out
                  </button>
                </form>
              ) : (
                <div className="flex items-center gap-3">
                  <Link href="/login" className="btn-text text-sm no-underline">
                    Sign in
                  </Link>
                  <Link href="/signup" className="btn btn-primary btn-sm no-underline">
                    Sign up
                  </Link>
                </div>
              )}
            </div>
          </header>
        )}
        <main id="main" className="mx-auto w-full max-w-[1200px] flex-1 px-6 py-12">
          {children}
        </main>
        <footer className="mt-auto bg-well-ink">
          <div className="mx-auto flex max-w-[1200px] flex-col items-center gap-6 px-6 py-12 text-center sm:flex-row sm:items-start sm:justify-between sm:text-left">
            <div className="flex flex-col items-center gap-3 sm:items-start">
              <ReversedLogo width={120} />
              <p className="max-w-xs text-sm text-water">
                A private place for families to keep the stories, lessons, and wisdom worth
                carrying forward.
              </p>
            </div>
            <nav aria-label="Footer" className="flex flex-col items-center gap-2 text-sm sm:items-end">
              <Link href="/home" className="text-mist no-underline hover:text-white">
                Home
              </Link>
              <Link href="/entries" className="text-mist no-underline hover:text-white">
                Wisdom
              </Link>
              <Link href="/family" className="text-mist no-underline hover:text-white">
                Family
              </Link>
              <Link href="/steward" className="text-mist no-underline hover:text-white">
                Steward
              </Link>
            </nav>
          </div>
          <div className="border-t border-white/10">
            <p className="mx-auto max-w-[1200px] px-6 py-4 text-center text-xs text-water sm:text-left">
              © {new Date().getFullYear()} Wisdom Well. Made for the people who come after.
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
