import type { Metadata } from "next";
import { Suspense } from "react";
import { AppShell } from "@/components/AppShell";
import "./globals.css";

export const metadata: Metadata = {
  title: "Time & Attendance",
  description: "Team attendance, time off, and payroll reporting.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <Suspense fallback={<>{children}</>}>
          <AppShell>{children}</AppShell>
        </Suspense>
      </body>
    </html>
  );
}
