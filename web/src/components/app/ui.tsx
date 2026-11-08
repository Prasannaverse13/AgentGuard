import type { ReactNode } from "react";
import type { PaymentStatus } from "@/lib/vault/types";

const PATHS: Record<string, string> = {
  home: "M4 11l8-7 8 7v9H4z",
  inbox: "M4 5h16v10h-5l-1 3h-4l-1-3H4z",
  list: "M5 6h14M5 12h14M5 18h14",
  bot: "M7 8h10a2 2 0 012 2v6a2 2 0 01-2 2H7a2 2 0 01-2-2v-6a2 2 0 012-2zM12 4v4M9.5 13h.01M14.5 13h.01",
  shield: "M12 3l8 3v6c0 4.5-3.2 7.8-8 9-4.8-1.2-8-4.5-8-9V6z",
  check: "M5 12l5 5 9-10",
  eye: "M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12zM12 15a3 3 0 100-6 3 3 0 000 6z",
};

export function Icon({ name }: { name: keyof typeof PATHS }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  );
}

const LABEL: Record<PaymentStatus, string> = {
  Paid: "Paid",
  NeedsApproval: "Needs you",
  Blocked: "Blocked",
  Rejected: "Rejected",
  Dismissed: "Dismissed",
  Failed: "Failed",
  AwaitingGuard: "Checking",
  Sending: "Sending",
};

export function StatusChip({ status }: { status: PaymentStatus }) {
  const tone = status === "Paid" ? "paid" : status === "NeedsApproval" ? "needs" : status === "Blocked" || status === "Rejected" || status === "Failed" ? "bad" : "";
  return <span className={`ag-chip ${tone}`}>{LABEL[status]}</span>;
}

export function Flags({ flags, risk }: { flags: string[]; risk?: number | null }) {
  if (!flags.length && risk == null) return null;
  return (
    <div className="ag-flags">
      {risk != null && <span className={`ag-flag ${risk >= 35 ? "risk" : ""}`}>risk {risk} of 100</span>}
      {flags.map((f) => (
        <span className={`ag-flag ${f === "private payout" ? "private" : ""}`} key={f}>
          {f}
        </span>
      ))}
    </div>
  );
}

export function Card({ title, sub, children, action }: { title?: string; sub?: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="ag-card">
      {(title || action) && (
        <div className="ag-row ag-between" style={{ alignItems: "flex-start" }}>
          <div>
            {title && <h2>{title}</h2>}
            {sub && <p className="sub">{sub}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function timeAgo(ms: number, now = Date.now()) {
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 10) return "just now";
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}
