import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AgentGuard: AI agents run your money inside your rules",
  description:
    "A NEAR vault where AI agents pay bills, buy data and split revenue. Every payment passes a guard. Big ones wait for you.",
  // Tells the Dark Reader extension to leave this app alone. The app has its own look.
  other: { "darkreader-lock": "" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
