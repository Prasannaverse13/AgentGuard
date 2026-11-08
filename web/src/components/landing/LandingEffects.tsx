"use client";

import { useEffect } from "react";

/**
 * Behaviour for the static marketing page: hero motion, the live guard gate,
 * tag pills and the approval card. The markup is server rendered, so this only
 * touches DOM nodes that React never re-renders.
 */
export function LandingEffects() {
  useEffect(() => {
    const cleanups: Array<() => void> = [];
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
    const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T | null;

    const I: Record<string, string> = {
      check: '<path d="M5 12l5 5 9-10"/>',
      block: '<circle cx="12" cy="12" r="9"/><path d="M6 6l12 12"/>',
      doc: '<path d="M7 3h7l4 4v14H7z"/>',
      bolt: '<path d="M13 3L5 13h6l-1 8 8-10h-6z"/>',
      warn: '<path d="M12 3l9 16H3z"/><path d="M12 10v4M12 17v.5"/>',
      people: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5"/>',
      coin: '<circle cx="12" cy="12" r="8"/><path d="M9.5 9.5h4a1.5 1.5 0 010 3h-3a1.5 1.5 0 000 3h4"/>',
    };
    const svg = (k: string) =>
      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${I[k]}</svg>`;
    const esc = (s: string) =>
      s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);
    const onView = (el: Element, cb: (v: boolean) => void, t = 0.3) => {
      if (!("IntersectionObserver" in window)) return cb(true);
      const io = new IntersectionObserver((es) => es.forEach((x) => cb(x.isIntersecting)), { threshold: t });
      io.observe(el);
      cleanups.push(() => io.disconnect());
    };

    /* Hero background motion */
    const hero = document.querySelector<HTMLElement>(".hero");
    if (hero) {
      if (reduce) {
        document.querySelectorAll(".motion").forEach((m) => m.remove());
      } else {
        const layers = [...hero.querySelectorAll<HTMLElement>(".px")];
        let raf = 0;
        const move = (e: PointerEvent) => {
          if (e.pointerType !== "mouse") return;
          const r = hero.getBoundingClientRect();
          const nx = (e.clientX - r.left) / r.width - 0.5;
          const ny = (e.clientY - r.top) / r.height - 0.5;
          cancelAnimationFrame(raf);
          raf = requestAnimationFrame(() =>
            layers.forEach((l) => {
              const d = Number(l.dataset.depth);
              l.style.transform = `translate(${nx * d}px, ${ny * d}px)`;
            }),
          );
        };
        const leave = () => layers.forEach((l) => (l.style.transform = ""));
        hero.addEventListener("pointermove", move);
        hero.addEventListener("pointerleave", leave);
        cleanups.push(() => {
          hero.removeEventListener("pointermove", move);
          hero.removeEventListener("pointerleave", leave);
        });

        // The hero numbers come from the live vault (LiveVault). No made up ticking.

      }
    }

    /* Money flow bands grow in */
    const flow = $("flow");
    if (flow && !reduce) {
      const bands = [...flow.querySelectorAll<SVGPathElement>(".band")];
      bands.forEach((b) => {
        b.style.transformOrigin = "left center";
        b.style.opacity = "0";
      });
      onView(
        flow,
        (v) => {
          if (!v) return;
          bands.forEach((b, i) => {
            b.style.opacity = "";
            b.style.animationDelay = i * 90 + "ms";
            b.classList.add("grow");
          });
        },
        0.4,
      );
    }

    /* Tag pills */
    document.querySelectorAll<HTMLElement>(".pills").forEach((g) => {
      const single = g.dataset.group !== "multi";
      g.querySelectorAll<HTMLButtonElement>(".pill").forEach((p) =>
        p.addEventListener("click", () => {
          if (single) g.querySelectorAll(".pill").forEach((q) => q.setAttribute("aria-pressed", String(q === p)));
          else p.setAttribute("aria-pressed", String(p.getAttribute("aria-pressed") !== "true"));
        }),
      );
    });

    /* Approval card */
    const body = $("approval-body");
    if (body) {
      const pending = body.innerHTML;
      const finish = (ok: boolean, title: string, note: string) => {
        const tone = ok ? "gain" : "loss";
        body.innerHTML = `<div class="done" style="margin-top:16px"><span class="av" style="background:var(--color-${tone}-tint);color:var(--color-${tone})">${svg(
          ok ? "check" : "block",
        )}</span><span><span class="r-name">${title}</span><span class="r-note">${note}</span></span></div><button class="btn btn-quiet btn-sm" type="button" id="btn-again" style="margin-top:16px">Show the request again</button>`;
        const again = $("btn-again");
        again?.focus({ preventScroll: true });
        again?.addEventListener("click", () => {
          body.innerHTML = pending;
          wire();
          $("btn-approve")?.focus({ preventScroll: true });
        });
      };
      const wire = () => {
        $("btn-approve")?.addEventListener("click", () => finish(true, "Approved", "4,200 USDC sent to 6 people on Base."));
        $("btn-dismiss")?.addEventListener("click", () =>
          finish(false, "Dismissed", "Nothing was paid. The agent was told why."),
        );
      };
      wire();
    }

    /* Ops counter */
    const opsAmt = $("ops-amt");
    const opsCalls = $("ops-calls");
    if (opsAmt && opsCalls && !reduce) {
      let calls = 2130;
      let on = false;
      onView(opsAmt, (v) => (on = v));
      const t = setInterval(() => {
        if (!on || document.hidden || !opsAmt.firstChild) return;
        calls += 1 + Math.floor(Math.random() * 3);
        opsAmt.firstChild.nodeValue = (calls * 0.003).toFixed(2);
        opsCalls.textContent = calls.toLocaleString("en-US") + " calls";
      }, 900);
      cleanups.push(() => clearInterval(t));
    }

    /* Guard gate */
    const track = $("track");
    const gate = $("gateEl");
    const verdict = $("verdict");
    let stopped = false;
    if (track && gate && verdict && !reduce) {
      const tally: Record<string, number> = { ok: 1, hold: 0, bad: 0 };
      const pays = [
        { name: "Lumen Studio", amt: "840 USDC", icon: "doc", out: "ok", why: "Passed. Within every limit." },
        { name: "Weather API", amt: "0.36 USDC", icon: "bolt", out: "ok", why: "Passed. Small paid call." },
        { name: "Urgent invoice", amt: "2,000 USDC", icon: "warn", out: "bad", why: "Blocked. Payee matches a scam pattern." },
        { name: "Payroll", amt: "4,200 USDC", icon: "people", out: "hold", why: "Sent to you. Over the daily cap." },
        { name: "Cloud hosting", amt: "129 USDC", icon: "check", out: "ok", why: "Passed. Known payee." },
        { name: "New token swap", amt: "5,000 XYZ", icon: "coin", out: "bad", why: "Blocked. Token not on your list." },
      ];
      let gateOn = false;
      let wake: (() => void) | null = null;
      onView(
        track,
        (v) => {
          gateOn = v;
          if (v && wake) {
            wake();
            wake = null;
          }
        },
        0.5,
      );
      const waitVisible = () =>
        gateOn && !document.hidden
          ? Promise.resolve()
          : new Promise<void>((r) => {
              wake = r;
            });
      const vis = () => {
        if (!document.hidden && gateOn && wake) {
          wake();
          wake = null;
        }
      };
      document.addEventListener("visibilitychange", vis);
      cleanups.push(() => document.removeEventListener("visibilitychange", vis));
      cleanups.push(() => {
        stopped = true;
      });

      track.querySelectorAll(".pay.static").forEach((p) => p.remove());
      (async () => {
        for (let i = 0; !stopped; i++) {
          await waitVisible();
          if (stopped) return;
          const p = pays[i % pays.length];
          const chip = document.createElement("div");
          chip.className = "pay";
          chip.innerHTML = `<span class="av on">${svg(p.icon)}</span><span><span class="pay-name">${esc(
            p.name,
          )} </span><span class="pay-amt">${esc(p.amt)}</span></span>`;
          track.appendChild(chip);
          const W = track.clientWidth;
          const cw = chip.offsetWidth;
          const xg = W / 2 - cw / 2;
          const xe = W - cw;
          const T = (x: number, y: number) => `translate(${x}px, calc(-50% + ${y}px))`;
          await chip.animate([{ transform: T(-12, 0), opacity: 0 }, { transform: T(0, 0), opacity: 1 }], {
            duration: 300,
            easing: "ease-out",
            fill: "forwards",
          }).finished;
          await chip.animate([{ transform: T(0, 0) }, { transform: T(xg, 0) }], {
            duration: 1100,
            easing: "cubic-bezier(0.4, 0, 0.2, 1)",
            fill: "forwards",
          }).finished;
          gate.className = "gate scan";
          verdict.className = "verdict";
          verdict.textContent = "Checking rules";
          await sleep(900);
          gate.className = "gate " + p.out;
          verdict.textContent = p.why;
          void verdict.offsetWidth;
          verdict.className = "verdict show " + p.out;
          tally[p.out]++;
          const n = $("n-" + p.out);
          if (n) n.textContent = String(tally[p.out]);
          const exit =
            p.out === "ok"
              ? chip.animate(
                  [
                    { transform: T(xg, 0), opacity: 1 },
                    { transform: T(xe, 0), opacity: 1, offset: 0.8 },
                    { transform: T(xe, 0), opacity: 0 },
                  ],
                  { duration: 1300, easing: "cubic-bezier(0.4, 0, 0.2, 1)", fill: "forwards" },
                )
              : p.out === "bad"
                ? chip.animate(
                    [
                      { transform: T(xg, 0) + " rotate(0deg)", opacity: 1 },
                      { transform: T(xg, 80) + " rotate(-6deg)", opacity: 0 },
                    ],
                    { duration: 900, easing: "cubic-bezier(0.5, 0, 0.75, 0)", fill: "forwards" },
                  )
                : chip.animate(
                    [
                      { transform: T(xg, 0), opacity: 1 },
                      { transform: T(xg, -80), opacity: 0 },
                    ],
                    { duration: 900, easing: "cubic-bezier(0.4, 0, 0.2, 1)", fill: "forwards" },
                  );
          await sleep(700);
          gate.className = "gate";
          exit.finished.then(() => chip.remove());
          await sleep(500);
        }
      })();
    }

    return () => cleanups.forEach((fn) => fn());
  }, []);

  return null;
}
