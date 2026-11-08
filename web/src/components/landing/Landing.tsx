import Link from "next/link";
import type { CSSProperties } from "react";
import { ConnectWallet } from "./ConnectWallet";
import { LandingEffects } from "./LandingEffects";
import { LiveVault } from "./LiveVault";

const REPO_URL = process.env.NEXT_PUBLIC_REPO_URL ?? "https://github.com";

export function Landing() {
  return (
    <>


<div className="promo">Built for NEAR Hackathon 2026. <b>Live on NEAR testnet.</b></div>

<div className="nav-shell">
  <div className="wrap">
    <header className="nav">
      <a className="brand" href="#top" aria-label="AgentGuard home">
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2.5l8 3.3v5.7c0 5-3.4 9.3-8 11-4.6-1.7-8-6-8-11V5.8l8-3.3z"/><path d="M8.6 12.2l2.4 2.4 4.6-4.8" fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
        AgentGuard
      </a>
      <nav className="nav-links" aria-label="Main">
        <a href="#features">Features</a>
        <a href="#gate">How it works</a>
        <a href="#security">Security</a>
        <a href={REPO_URL} rel="noopener noreferrer">GitHub</a>
      </nav>
      <div className="nav-actions">
        <Link className="btn btn-ghost" href="/app">Open demo</Link>
        <ConnectWallet className="btn btn-primary" label="Connect MetaMask" />
      </div>
    </header>
  </div>
</div>

<main id="top">
  <section className="hero" aria-label="Intro">
    <div className="hero-bg" aria-hidden="true">
      <div className="glow glow-a"></div>
      <div className="glow glow-b"></div>
      <div className="hero-grid"><span className="bead"></span><span className="bead"></span><span className="bead"></span><span className="bead"></span><span className="bead"></span></div>
      <div className="px" data-depth="-14">
      <svg className="mock" viewBox="0 0 1280 720">
        <rect width="1280" height="720" rx="18" fill="#ffffff"/>
        <rect x="0" y="0" width="220" height="720" fill="#f6f4f2"/>
        <g fill="#dcd9d6"><rect x="28" y="40" width="120" height="14" rx="7"/><rect x="28" y="90" width="150" height="12" rx="6"/><rect x="28" y="124" width="130" height="12" rx="6"/><rect x="28" y="158" width="140" height="12" rx="6"/><rect x="28" y="192" width="110" height="12" rx="6"/></g>
        <g><rect x="260" y="40" width="300" height="110" rx="12" fill="#efecea"/><rect x="590" y="40" width="300" height="110" rx="12" fill="#efecea"/><rect x="920" y="40" width="320" height="110" rx="12" fill="#ffe9df"/></g>
        <path className="drawarea" style={{ "--a": "0.6"  } as CSSProperties} d="M260 600 C 380 520, 470 560, 560 470 S 760 420, 860 360 S 1060 300, 1240 220 L1240 680 L260 680 Z" fill="#ffe9df" opacity="0.6"/>
        <path id="heroLine" className="drawline" pathLength="1" d="M260 600 C 380 520, 470 560, 560 470 S 760 420, 860 360 S 1060 300, 1240 220" fill="none" stroke="#ff692d" strokeWidth="5"/>
        <g className="motion">
          <circle r="16" fill="#ff692d" opacity="0.18"><animateMotion dur="7s" begin="3s" repeatCount="indefinite" rotate="auto"><mpath href="#heroLine"/></animateMotion></circle>
          <circle r="7" fill="#ff692d"><animateMotion dur="7s" begin="3s" repeatCount="indefinite"><mpath href="#heroLine"/></animateMotion></circle>
          <circle r="16" fill="#ff692d" opacity="0.18"><animateMotion dur="7s" begin="5.3s" repeatCount="indefinite"><mpath href="#heroLine"/></animateMotion></circle>
          <circle r="7" fill="#ff692d"><animateMotion dur="7s" begin="5.3s" repeatCount="indefinite"><mpath href="#heroLine"/></animateMotion></circle>
          <circle r="7" fill="#22201d"><animateMotion dur="7s" begin="7.6s" repeatCount="indefinite"><mpath href="#heroLine"/></animateMotion></circle>
        </g>
        <g fill="#dcd9d6"><rect x="260" y="190" width="980" height="1"/><rect x="260" y="300" width="980" height="1"/><rect x="260" y="410" width="980" height="1"/><rect x="260" y="520" width="980" height="1"/></g>
      </svg>
      </div>
    </div>
    <div className="wrap hero-in">
      <div className="stat stat-a bob-a" aria-hidden="true">
        <div className="stat-label">Vault balance</div>
        <div className="stat-big" id="vault-bal">12,480.00 USDC</div>
        <svg className="spark" viewBox="0 0 260 48" preserveAspectRatio="none"><path className="area drawarea" d="M0 40 L30 36 L60 38 L90 28 L120 30 L150 20 L180 22 L210 12 L240 14 L260 6 L260 48 L0 48Z"/><path className="drawline" pathLength="1" d="M0 40 L30 36 L60 38 L90 28 L120 30 L150 20 L180 22 L210 12 L240 14 L260 6"/></svg>
      </div>
      <div className="px" data-depth="10" style={{ pointerEvents: "none" }}><div className="stat stat-b bob-b" aria-hidden="true">
        <div className="list-head"><b>Agents</b><span className="muted">Spent today</span></div>
        <div className="arow"><span className="av on"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 3h7l4 4v14H7z"/></svg></span><span><span className="r-name">Payables</span><span className="r-note">Invoices and payroll</span></span><span className="r-amt"><span id="hero-pay-v">2,800</span><small id="hero-pay-cap">of 3,500</small></span></div>
        <div className="arow" id="hero-ops"><span className="av on"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 3L5 13h6l-1 8 8-10h-6z"/></svg></span><span><span className="r-name">Ops</span><span className="r-note">Paid API calls</span></span><span className="r-amt"><span id="hero-ops-v">6.40</span><small id="hero-ops-cap">of 20</small></span></div>
        <div className="arow"><span className="av on"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 21V12M12 12L5 4M12 12l7-8"/></svg></span><span><span className="r-name">Revenue</span><span className="r-note">Splits income</span></span><span className="r-amt gain"><span id="hero-rev-v">+1,200</span><small>moved</small></span></div>
      </div>
      </div>
      <div className="hero-card in-1">
        <h1>The safe way to let agents spend money</h1>
        <p>AI agents pay invoices, buy APIs and split revenue on NEAR. Every payment passes your rules first.</p>
        <ConnectWallet className="btn btn-primary btn-lg" label="Connect MetaMask" />
      </div>
    </div>
  </section>

  <LiveVault />

  <section className="intro gridlines" id="demo">
    <div className="wrap">
      <div className="eyebrow">Meet AgentGuard</div>
      <h2>Your home base for agent money</h2>
      <p>One vault for your business. Three AI agents that work inside it. A guard that checks every payment before anyone signs.</p>

      <div className="appshot" aria-label="AgentGuard app preview">
        <aside className="side" aria-hidden="true">
          <div className="side-brand"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.5l8 3.3v5.7c0 5-3.4 9.3-8 11-4.6-1.7-8-6-8-11V5.8l8-3.3z"/></svg></div>
          <a className="cur"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>Dashboard</a>
          <a><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5"/></svg>Agents</a>
          <a><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 6h16M4 12h16M4 18h10"/></svg>Payments</a>
          <a><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6l7-3z"/></svg>Rules</a>
          <a><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5 9-10"/></svg>Approvals<span className="badge">1</span></a>
          <a><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12h4l3-7 4 14 3-7h4"/></svg>Activity</a>
          <a><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2"/></svg>Settings</a>
        </aside>
        <div className="main">
          <div className="tabsbar" aria-hidden="true"><span className="cur">Money flow</span><span>Payments</span><span>Rules</span></div>
          <div className="tiles">
            <div className="tile"><div className="stat-big gain">+4,200.00</div><div className="stat-label">Revenue in this month</div></div>
            <div className="tile"><div className="stat-big loss">3,719.46</div><div className="stat-label">Paid out by agents</div></div>
            <div className="tile"><div className="stat-big">2,000.00</div><div className="stat-label">Stopped by the guard</div></div>
          </div>
          <div className="flowcard">
            <div className="flowcard-head"><span><span className="muted">Money flow</span><br /><b style={{ fontWeight: "500" }}>Nov 1 to Nov 6, 2026</b></span><span className="chip">By agent</span></div>
            <svg className="flow" id="flow" viewBox="0 0 860 300" role="img" aria-label="Money flow from vault to three agents and their payees">
              <g className="bands">
                <path className="band" d="M18 20 C 300 20, 300 20, 430 20 L430 160 C 300 160, 300 160, 18 160 Z" fill="#ffe9df"/>
                <path className="band" d="M18 166 C 300 166, 300 182, 430 182 L430 196 C 300 196, 300 180, 18 180 Z" fill="#dcd9d6"/>
                <path className="band" d="M18 186 C 300 186, 300 218, 430 218 L430 280 C 300 280, 300 248, 18 248 Z" fill="#e4f2e8"/>
                <path className="band" d="M442 20 C 640 20, 640 14, 840 14 L840 84 C 640 84, 640 90, 442 90 Z" fill="#ffe9df"/>
                <path className="band" d="M442 90 C 640 90, 640 100, 840 100 L840 160 C 640 160, 640 160, 442 160 Z" fill="#ffe9df"/>
                <path className="band" d="M442 218 C 640 218, 640 206, 840 206 L840 236 C 640 236, 640 243, 442 243 Z" fill="#e4f2e8"/>
                <path className="band" d="M442 243 C 640 243, 640 252, 840 252 L840 290 C 640 290, 640 280, 442 280 Z" fill="#e4f2e8"/>
              </g>
              <rect className="bar" x="6" y="20" width="12" height="260" fill="#22201d"/>
              <rect className="bar" x="430" y="20" width="12" height="140" fill="#ff692d"/>
              <rect className="bar" x="430" y="182" width="12" height="14" fill="#777573"/>
              <rect className="bar" x="430" y="218" width="12" height="62" fill="#2f8a4c"/>
              <rect className="bar" x="840" y="14" width="12" height="70" fill="#ff692d"/>
              <rect className="bar" x="840" y="100" width="12" height="60" fill="#ff692d"/>
              <rect className="bar" x="840" y="206" width="12" height="30" fill="#2f8a4c"/>
              <rect className="bar" x="840" y="252" width="12" height="38" fill="#2f8a4c"/>
              <text x="28" y="146">Vault</text><text className="sub" x="28" y="162">12,480 USDC</text>
              <text x="452" y="84">Payables</text><text className="sub" x="452" y="100">3,560 USDC</text>
              <text x="452" y="194">Ops</text><text className="sub" x="490" y="194">6.40 USDC</text>
              <text x="452" y="262">Revenue</text><text className="sub" x="516" y="262">1,200 USDC</text>
              <text x="832" y="44" textAnchor="end">Payroll</text><text className="sub" x="832" y="60" textAnchor="end">2,800</text>
              <text x="832" y="128" textAnchor="end">Invoices</text><text className="sub" x="832" y="144" textAnchor="end">760</text>
              <text x="832" y="225" textAnchor="end">Savings</text>
              <text x="832" y="275" textAnchor="end">Tax and team</text>
            </svg>
          </div>
        </div>
      </div>
    </div>
  </section>

  <section className="features" id="features">
    <div className="wrap">
      <div className="sec-head">
        <div className="eyebrow">Features</div>
        <h2>Everything your agents need, in one vault</h2>
      </div>

      <div className="feat">
        <div className="feat-copy">
          <div className="eyebrow">Agents</div>
          <h3>All your agents in one place</h3>
          <p>See what each agent spent today and how much room it has left. Pause any agent with one tap.</p>
          <a className="btn btn-outline" href="#demo">See the dashboard</a>
        </div>
        <div className="stagecard">
          <div className="card">
            <div className="card-pad" style={{ paddingBottom: "8px" }}><div className="muted">Total spent today</div><div className="stat-big">2,806.40 USDC</div></div>
            <div className="arow"><span className="av on"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 3h7l4 4v14H7z"/></svg></span><span><span className="r-name">Payables agent</span><span className="r-note addr">payables.guard.testnet</span></span><span className="r-amt">2,800.00<small>1 min ago</small></span></div>
            <div className="arow"><span className="av on"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M13 3L5 13h6l-1 8 8-10h-6z"/></svg></span><span><span className="r-name">Ops agent</span><span className="r-note">ops.guard.testnet</span></span><span className="r-amt" id="ops-amt">6.40<small id="ops-calls">2,130 calls</small></span></div>
            <div className="arow"><span className="av on"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 21V12M12 12L5 4M12 12l7-8"/></svg></span><span><span className="r-name">Revenue agent</span><span className="r-note">revenue.guard.testnet</span></span><span className="r-amt gain">+1,200.00<small>split</small></span></div>
          </div>
          <div className="floater f-tl" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="var(--color-ember-orange)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6l7-3z"/></svg>All agents within limits</div>
        </div>
      </div>

      <div className="feat flip">
        <div className="feat-copy">
          <div className="eyebrow">Payments</div>
          <h3>Every payment in one list</h3>
          <p>Each payment shows who got paid, on which chain and which rule allowed it. Tag it once and the agent learns.</p>
          <a className="btn btn-outline" href="#gate">See how checks work</a>
        </div>
        <div className="stagecard">
          <div className="card card-pad">
            <div className="payee">
              <div><div className="payee-logo">L</div><div style={{ marginTop: "12px", fontWeight: "500", fontSize: "18px" }}>Lumen Studio invoice</div></div>
              <div className="payee-amt"><b>840.00 USDC</b><span className="muted ring-dot">Paid on Arbitrum</span></div>
            </div>
            <div className="hr"></div>
            <div className="muted">Agent</div>
            <div className="pills" data-group="agent">
              <button className="pill" type="button" aria-pressed="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 3h7l4 4v14H7z"/></svg>Payables</button>
              <button className="pill" type="button" aria-pressed="false"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M13 3L5 13h6l-1 8 8-10h-6z"/></svg>Ops</button>
              <button className="pill" type="button" aria-pressed="false"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 21V12M12 12L5 4M12 12l7-8"/></svg>Revenue</button>
            </div>
            <div className="hr"></div>
            <div className="muted">Rules it passed</div>
            <div className="pills" data-group="multi">
              <button className="pill" type="button" aria-pressed="true">Under daily cap</button>
              <button className="pill" type="button" aria-pressed="true">Known payee</button>
              <button className="pill" type="button" aria-pressed="false">Needs approval</button>
            </div>
          </div>
        </div>
      </div>

      <div className="feat">
        <div className="feat-copy">
          <div className="eyebrow">Approvals</div>
          <h3>Big moves wait for you</h3>
          <p>Anything over a limit lands in your queue. Approve it or dismiss it and the agent is told why.</p>
          <a className="btn btn-outline" href="#security">Read about safety</a>
        </div>
        <div className="stagecard">
          <div className="card card-pad" id="approval">
            <div className="card-title"><b>Needs your approval</b><span className="muted">Today</span></div>
            <div id="approval-body">
              <div className="arow" style={{ paddingLeft: "0", paddingRight: "0", marginTop: "12px" }}>
                <span className="av on"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5"/></svg></span>
                <span><span className="r-name">November payroll</span><span className="r-note">$700 over the Payables cap</span></span>
                <span className="r-amt">4,200.00<small>6 people on Base</small></span>
              </div>
              <div className="choice">
                <button className="btn btn-quiet" type="button" id="btn-dismiss">Dismiss</button>
                <button className="btn btn-primary" type="button" id="btn-approve">Approve</button>
              </div>
            </div>
          </div>
          <div className="floater f-br" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="var(--color-loss)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M6 6l12 12"/></svg>Blocked a scam payee</div>
        </div>
      </div>

      <div className="gatebox" id="gate">
        <div className="sec-head">
          <div className="eyebrow">The guard</div>
          <h2>Watch every payment get checked</h2>
        </div>
        <div className="lanes" aria-hidden="true"><span>Agent wants to pay</span><span>Guard</span><span>Paid out</span></div>
        <div className="track" id="track">
          <div className="gate" id="gateEl"><span className="pulse"></span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6l7-3z"/><path d="M9 12l2 2 4-4"/></svg></div>
          <div className="pay static"><span className="av on"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 3h7l4 4v14H7z"/></svg></span><span><span className="pay-name">Lumen Studio </span><span className="pay-amt">840 USDC</span></span></div>
          <div className="pay s2 static"><span className="av on"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-10"/></svg></span><span><span className="pay-name">Cloud hosting </span><span className="pay-amt">129 USDC</span></span></div>
        </div>
        <p className="verdict" id="verdict" aria-live="polite">Passed. Within every limit.</p>
        <div className="tally">
          <span className="chip"><b id="n-ok">1</b> paid</span>
          <span className="chip"><b id="n-hold">0</b> sent to you</span>
          <span className="chip"><b id="n-bad">0</b> blocked</span>
        </div>
      </div>
    </div>
  </section>

  <section className="security gridlines" id="security">
    <div className="wrap">
      <div className="sec-head">
        <div className="eyebrow">Security</div>
        <h2>Agents get a budget, never your keys</h2>
      </div>
      <div className="sec3">
        <div>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 018 0v3"/></svg>
          <h3>Non custodial</h3>
          <p>Funds stay in your own NEAR vault contract. We never hold them.</p>
        </div>
        <div>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M17 6l3 3"/></svg>
          <h3>Scoped agent keys</h3>
          <p>Each agent key can only spend inside its own limits.</p>
        </div>
        <div>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 4h14v16H5z"/><path d="M9 9h6M9 13h6M9 17h3"/></svg>
          <h3>Logged with reasons</h3>
          <p>Every action is stored on chain with the reason behind it.</p>
        </div>
      </div>
    </div>
  </section>

  <section className="cta">
    <div className="wrap">
      <div className="cta-box">
        <div className="eyebrow">Get started</div>
        <h2>Try AgentGuard on NEAR testnet</h2>
        <p>Create a guarded vault, add an agent and set its first limit.</p>
        <ConnectWallet className="btn btn-primary btn-lg" label="Connect MetaMask" />
      </div>
    </div>
  </section>
</main>

<footer className="foot">
  <div className="wrap">
    <p className="foot-big">Let your agents handle the money with AgentGuard in your corner.</p>
    <div className="foot-row">
      <span>Built at NEAR Hackathon 2026.</span>
      <nav className="foot-links" aria-label="Footer">
        <a href="#features">Features</a>
        <a href="#gate">How it works</a>
        <a href="#security">Security</a>
        <a href={REPO_URL} rel="noopener noreferrer">GitHub</a>
        <a href="https://near.org" rel="noopener noreferrer">NEAR</a>
      </nav>
    </div>
  </div>
</footer>


      <LandingEffects />
    </>
  );
}
