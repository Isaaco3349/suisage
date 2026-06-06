import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "SuiPilot — Autonomous DeFi Agent on DeepBook",
  description: "AI-powered trading agent that executes autonomously on Sui's DeepBook. Built for Sui Overflow 2026.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, padding: 0 }}>{children}</body>
    </html>
  );
}
