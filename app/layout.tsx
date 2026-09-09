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
          <div className="mx-auto flex max-w-3xl items-baseline justify-between px-6 py-5">
            <Link
              href="/"
              className="font-serif text-xl tracking-tight text-ink no-underline"
            >
              Wisdom&nbsp;Well
            </Link>
            {user ? (
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
