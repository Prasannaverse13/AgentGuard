"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/app/ui";
import { useVault } from "@/components/app/VaultProvider";
import { fromBase, primaryToken, symbolOf, toBase, tokenInfo } from "@/lib/units";

const UPGRADE = "This vault was deployed before these rules existed. Run scripts\\upgrade-vault.ps1 once to turn them on.";

/** Auto pause: stop an agent after N blocked or dismissed payments in a row. */
export function AutoPauseCard() {
  const { state, call, busy } = useVault();
  const sec = state?.security;
  const [n, setN] = useState(String(sec?.autoPauseAfter ?? 3));
  useEffect(() => {
    if (sec) setN(String(sec.autoPauseAfter));
  }, [sec?.autoPauseAfter]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!state) return null;
  const strikes = Object.entries(sec?.strikes ?? {});
  const name = (acc: string) => state.agents.find((a) => a.account === acc)?.name ?? acc;
  return (
    <Card title="Auto pause" sub="An agent that keeps getting stopped may be broken or tricked. Pause it before it tries again.">
      {!sec ? (
        <p className="ag-muted ag-small">{UPGRADE}</p>
      ) : (
        <div className="ag-stack">
          <label className="ag-field">
            Pause an agent after this many blocked or dismissed payments in a row (0 turns it off)
            <div className="ag-row ag-gap8">
              <input className="ag-in" style={{ maxWidth: 90 }} inputMode="numeric" value={n} onChange={(e) => setN(e.target.value.replace(/\D/g, "").slice(0, 2))} />
              <button type="button" className="ag-btn" disabled={busy || n === "" || Number(n) > 20 || Number(n) === sec.autoPauseAfter} onClick={() => call("/api/vault", { action: "autoPause", count: Number(n) }, Number(n) ? `Agents now pause after ${n} in a row` : "Auto pause is off")}>
                Save
              </button>
            </div>
          </label>
          <div className="ag-small ag-muted">
            {strikes.length === 0 ? "No agent has been stopped recently." : strikes.map(([a, c]) => `${name(a)}: ${c} in a row`).join(" · ")}
          </div>
        </div>
      )}
    </Card>
  );
}

/** Two person approval for large payments. */
export function TwoPersonCard() {
  const { state, call, busy } = useVault();
  const sec = state?.security;
  const token = state ? primaryToken(state) : "usdc.near";
  const dec = tokenInfo(token)?.decimals ?? 6;
  const rule = sec?.dualRules.find((r) => r.token === token);
  const [people, setPeople] = useState((sec?.coApprovers ?? []).join("\n"));
  const [above, setAbove] = useState(rule ? fromBase(rule.above, dec, 6).replace(/,/g, "") : "1500");
  useEffect(() => {
    if (sec) setPeople(sec.coApprovers.join("\n"));
  }, [sec?.coApprovers.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!state) return null;
  const list = people.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
  const bad = list.filter((a) => !(/^0x[0-9a-fA-F]{40}$/.test(a) || /^[a-z0-9_.-]{2,64}$/.test(a)));
  return (
    <Card title="Two person approval" sub="Large payments need you and one more person. A co-approver can approve or dismiss, never change rules.">
      {!sec ? (
        <p className="ag-muted ag-small">{UPGRADE}</p>
      ) : (
        <div className="ag-stack">
          <label className="ag-field">
            Co-approvers: MetaMask addresses (0x…) or NEAR accounts, one per line
            <textarea className="ag-in" rows={3} value={people} onChange={(e) => setPeople(e.target.value)} placeholder="0x… or cfo.testnet" />
          </label>
          {bad.length > 0 && <div className="ag-small" style={{ color: "var(--color-loss)" }}>Not an address or account: {bad.join(", ")}</div>}
          <div className="ag-row ag-gap8 ag-wrap">
            <button type="button" className="ag-btn" disabled={busy || bad.length > 0 || list.length > 5} onClick={() => call("/api/vault", { action: "coApprovers", approvers: list }, list.length ? "Co-approvers saved" : "Co-approvers removed")}>
              Save co-approvers
            </button>
          </div>
          <label className="ag-field">
            Payments above this need two approvers ({symbolOf(token)})
            <div className="ag-row ag-gap8 ag-wrap">
              <input className="ag-in" style={{ maxWidth: 160 }} inputMode="decimal" value={above} onChange={(e) => setAbove(e.target.value.replace(/[^\d.]/g, ""))} />
              <button
                type="button"
                className="ag-btn"
                disabled={busy || !above}
                onClick={() => {
                  const rules = [...(sec.dualRules ?? []).filter((r) => r.token !== token), { token, above: toBase(above, dec) }];
                  void call("/api/vault", { action: "dualRules", rules }, `Payments above ${above} ${symbolOf(token)} need two approvers`);
                }}
              >
                Save amount
              </button>
              {rule && (
                <button type="button" className="ag-btn" disabled={busy} onClick={() => call("/api/vault", { action: "dualRules", rules: sec.dualRules.filter((r) => r.token !== token) }, "Two person approval is off")}>
                  Turn off
                </button>
              )}
            </div>
          </label>
          <div className="ag-small ag-muted">
            {rule && sec.coApprovers.length
              ? `On: above ${fromBase(rule.above, dec)} ${symbolOf(token)}, two of you must approve.`
              : rule
                ? "Add at least one co-approver to turn this on."
                : "Off."}
          </div>
        </div>
      )}
    </Card>
  );
}

/** Which alert channels the server has, and a test button. */
export function AlertsCard() {
  const { call, busy } = useVault();
  const [ch, setCh] = useState<{ telegram: boolean; webhook: boolean; email: boolean } | null>(null);
  useEffect(() => {
    fetch("/api/alerts")
      .then((r) => r.json())
      .then((j: { channels: typeof ch }) => setCh(j.channels))
      .catch(() => setCh(null));
  }, []);
  const on = ch ? Object.entries(ch).filter(([, v]) => v).map(([k]) => k) : [];
  return (
    <Card title="Alerts" sub="A message when a payment waits for you, a payment is blocked or an agent is paused.">
      <div className="ag-stack">
        <div className="ag-small">{on.length ? `On: ${on.join(", ")}` : <span className="ag-muted">Off. Add TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID (or ALERT_WEBHOOK_URL, or RESEND_API_KEY and ALERT_EMAIL_TO) to web/.env and restart.</span>}</div>
        <div>
          <button type="button" className="ag-btn" disabled={busy || !on.length} onClick={() => call("/api/alerts", {}, "Test alert sent")}>
            Send a test alert
          </button>
        </div>
      </div>
    </Card>
  );
}

/** Invoice by email: where to point the inbound email provider. */
export function EmailCard() {
  const [info, setInfo] = useState<{ enabled: boolean; allowedSenders: string[] } | null>(null);
  const [origin, setOrigin] = useState("");
  useEffect(() => {
    setOrigin(window.location.origin);
    fetch("/api/inbound/email")
      .then((r) => r.json())
      .then(setInfo)
      .catch(() => setInfo(null));
  }, []);
  return (
    <Card title="Invoice by email" sub="Forward invoices to an address. The Payables agent reads them and every rule still applies.">
      <div className="ag-stack ag-small">
        {info?.enabled ? (
          <>
            <div>
              Point your inbound email service (Postmark, SendGrid, Mailgun, Cloudflare Email) at:
              <code className="ag-code">{origin}/api/inbound/email?key=YOUR_INBOUND_EMAIL_SECRET</code>
            </div>
            <div className="ag-muted">{info.allowedSenders.length ? `Only read from: ${info.allowedSenders.join(", ")}` : "Any sender is read. Set INBOUND_EMAIL_FROM to limit it."}</div>
          </>
        ) : (
          <div className="ag-muted">Off. Set INBOUND_EMAIL_SECRET in web/.env and restart. The app must be reachable from the internet (deploy it, or use a tunnel).</div>
        )}
      </div>
    </Card>
  );
}
