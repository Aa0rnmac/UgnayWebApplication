import type { Metadata } from "next";
import { Space_Grotesk } from "next/font/google";

import { AppShell } from "@/components/app-shell";
import { AuthProvider } from "@/components/auth-context";

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
      <body className={`${spaceGrotesk.variable} bg-base text-slate-900`}>
        <AuthProvider>
          <AppShell>{children}</AppShell>
        </AuthProvider>
      </body>
    </html>
  );
}
