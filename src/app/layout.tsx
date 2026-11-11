import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import { ConnectionBar } from "./connection-bar";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Job Dashboard",
  description: "Find Upwork jobs, draft proposals, approve and bid.",
};

const NAV = [
  { href: "/", label: "Jobs" },
  { href: "/proposals", label: "Proposals" },
  { href: "/health", label: "Profile health" },
  { href: "/settings", label: "Searches & rules" },
  { href: "/tools", label: "Upwork tools" },
];

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <header className="border-b border-zinc-200 dark:border-zinc-800">
          <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
            <nav className="flex flex-wrap items-center gap-1 text-sm">
              <span className="mr-3 font-semibold">Job Dashboard</span>
              {NAV.map((n) => (
                <Link
                  key={n.href}
                  href={n.href}
                  className="rounded-md px-2.5 py-1.5 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                >
                  {n.label}
                </Link>
              ))}
            </nav>
            <Suspense fallback={null}>
              <ConnectionBar />
            </Suspense>
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
