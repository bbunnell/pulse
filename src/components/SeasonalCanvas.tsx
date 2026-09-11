"use client";

import { useEffect, useRef, useState } from "react";

import { effectById, effectForDate } from "@/lib/seasonal";

/** Persisted on the client, read on the server, so a dismissed effect never
 *  flashes on before an effect can hide it. */
const DISMISS_COOKIE = "pulse_seasonal_off";

interface Particle {
  x: number; y: number;
  vx: number; vy: number;
  size: number;
  rot: number; vrot: number;
  life: number;      // fireworks only: 1 → 0
  hue: number;       // fireworks only
  sprite: string;    // fall only
}

/**
 * Seasonal decoration for the dashboard.
 *
 * THE CONSTRAINT THAT SHAPED THIS: the board has to keep working underneath it.
 * That rules out the obvious implementation — a pile of absolutely-positioned
 * DOM nodes animated by React — on three counts, so instead:
 *
 *   * ONE <canvas>, `pointer-events: none`, so nothing it draws can ever
 *     swallow a click. Punching in stays a click on the button, not on a
 *     snowflake that happens to be in front of it.
 *   * The animation lives entirely in refs and one requestAnimationFrame loop.
 *     It never calls setState, so it cannot re-render the board — which matters
 *     here because the dashboard already re-renders every second on its own.
 *   * It is layered at z-index 45: above the board so you can see it, below the
 *     top nav (49) and well below dialogs (200), so a confirmation prompt is
 *     never read through a shower of pumpkins.
 *
 * It also stops when nobody is looking — `document.hidden` pauses the loop —
 * which matters for the wall display this thing sits on all day.
 */
export function SeasonalCanvas({ todayIso, dismissedId, preview }: {
  /** Today in the ORG's timezone, resolved on the server. Computing it here
   *  would use the viewer's device clock and hydrate a mismatch — the trap the
   *  punch times and the board clock both hit earlier. */
  todayIso: string;
  /** Which effect this browser has already turned off, from the cookie. */
  dismissedId?: string;
  /** `?fx=halloween` forces an effect on any day. Without it there is no way to
   *  see how one looks until the day arrives, which is a poor way to find out
   *  the pumpkins are too big. Preview ignores the dismissal cookie. */
  preview?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const previewed = preview ? effectById(preview) : null;
  const effect = previewed ?? effectForDate(todayIso);
  const [dismissed, setDismissed] = useState(
    previewed ? false : effect ? dismissedId === effect.id : true,
  );

  useEffect(() => {
    if (!effect || dismissed) return;
    // Honoured here rather than in state: someone who asked their OS for less
    // motion gets no loop at all, not a hidden canvas still burning frames.
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let w = 0, h = 0, dpr = 1;
    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2); // cap: a 3x phone gains nothing here
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    const rnd = (a: number, b: number) => a + Math.random() * (b - a);
    let parts: Particle[] = [];

    const spawnFall = (atTop: boolean): Particle => ({
      x: rnd(0, w),
      y: atTop ? rnd(-h * 0.4, -20) : rnd(-20, h),
      vx: rnd(-14, 14),
      vy: rnd(26, 62),
      size: rnd(16, 30),
      rot: rnd(0, Math.PI * 2),
      vrot: rnd(-0.7, 0.7),
      life: 1,
      hue: 0,
      sprite: effect.sprites[Math.floor(Math.random() * effect.sprites.length)] ?? "",
    });

    if (effect.kind === "fall") {
      parts = Array.from({ length: effect.density }, () => spawnFall(false));
    }

    let nextBurst = 0;
    const burst = (t: number) => {
      const cx = rnd(w * 0.15, w * 0.85);
      const cy = rnd(h * 0.12, h * 0.5);
      const hue = Math.floor(rnd(0, 360));
      const n = 38;
      for (let i = 0; i < n; i++) {
        const a = (Math.PI * 2 * i) / n + rnd(-0.06, 0.06);
        const sp = rnd(60, 190);
        parts.push({
          x: cx, y: cy,
          vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
          size: rnd(1.6, 3.2), rot: 0, vrot: 0,
          life: 1, hue, sprite: "",
        });
      }
      nextBurst = t + rnd(700, 1800);
    };

    let raf = 0;
    let last = performance.now();

    const frame = (t: number) => {
      // Clamp dt so a backgrounded tab does not resume with one enormous step
      // that teleports everything across the screen.
      const dt = Math.min((t - last) / 1000, 0.05);
      last = t;
      ctx.clearRect(0, 0, w, h);

      if (effect.kind === "fall") {
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        for (const p of parts) {
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.rot += p.vrot * dt;
          if (p.y - p.size > h) Object.assign(p, spawnFall(true));
          if (p.x < -40) p.x = w + 40;
          if (p.x > w + 40) p.x = -40;
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.font = `${p.size}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
          ctx.fillText(p.sprite, 0, 0);
          ctx.restore();
        }
      } else {
        if (t >= nextBurst) burst(t);
        for (const p of parts) {
          p.vy += 110 * dt;              // gravity
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.life -= dt * 0.55;
        }
        parts = parts.filter((p) => p.life > 0 && p.y < h + 40);
        for (const p of parts) {
          ctx.globalAlpha = Math.max(0, p.life);
          ctx.fillStyle = `hsl(${p.hue} 90% 62%)`;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }

      raf = requestAnimationFrame(frame);
    };

    const start = () => { last = performance.now(); raf = requestAnimationFrame(frame); };
    const stop  = () => { cancelAnimationFrame(raf); raf = 0; };

    // A wall display left on overnight should not burn a core drawing snow that
    // nobody is watching.
    const onVisibility = () => {
      if (document.hidden) stop();
      else if (!raf) start();
    };

    start();
    window.addEventListener("resize", resize);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [effect, dismissed]);

  if (!effect || dismissed) return null;

  return (
    <>
      <canvas ref={canvasRef} className="seasonal-canvas" aria-hidden="true" />
      <button
        type="button"
        className="seasonal-dismiss"
        title={`Turn off the ${effect.label} decoration`}
        aria-label={`Turn off the ${effect.label} decoration`}
        onClick={() => {
          // A year is plenty: by the next Halloween the choice is stale anyway.
          document.cookie =
            `${DISMISS_COOKIE}=${effect.id}; path=/; max-age=31536000; samesite=lax`;
          setDismissed(true);
        }}
      >
        ✕
      </button>
    </>
  );
}
