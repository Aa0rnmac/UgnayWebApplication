import type { Metadata } from "next";
import { Space_Grotesk } from "next/font/google";

import { AppNav } from "@/components/nav";

import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-display",
  subsets: ["latin"]
});

export const metadata: Metadata = {
  title: "FSL Learning Hub",
  description: "Web-based capstone for Filipino Sign Language learning"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${spaceGrotesk.variable} bg-base text-slate-100`}>
        <div className="min-h-screen bg-grid md:flex">
          <AppNav />
          <main className="w-full flex-1 px-4 py-6 md:px-8 md:py-8">
            <div className="mx-auto w-full max-w-6xl">{children}</div>
          </main>
        </div>
      </body>
    </html>
  );
}
