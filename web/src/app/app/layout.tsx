import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AppShell } from "@/components/app/AppShell";
import { VaultProvider } from "@/components/app/VaultProvider";
import "@/styles/app.css";

export const metadata: Metadata = { title: "AgentGuard vault" };

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <VaultProvider>
      <AppShell>{children}</AppShell>
    </VaultProvider>
  );
}
