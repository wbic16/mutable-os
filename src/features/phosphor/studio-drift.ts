import type { Lighting } from "../flint/lighting";

export const PHOSPHOR_STUDIO_LIGHT: Lighting["light"] = Object.freeze({
  azimuth: 235, elevation: 38, intensity: 0.9, softness: 0.65,
});

/** Occasional changes of studio pose, not a material animation. The existing
 * scene and scheduler do the rendering; no PMREM work or layout per tick. */
export function createStudioDrift(
  root: HTMLElement,
  canvas: HTMLCanvasElement,
  lighting: Lighting,
  invalidate: () => void,
) {
  const motion = matchMedia("(prefers-reduced-motion: reduce)");
  const metrics = { moving: false, paused: true, frames: 0, moves: 0 };
  let disposed = false, lost = false, inView = false, hostHidden = false, enabled = true;
  let base = lighting.light, effective = base;
  let azimuth = 0, elevation = 0, fromAzimuth = 0, fromElevation = 0;
  const frameInterval = 50;
  let targetAzimuth = -56, targetElevation = -8;
  let duration = 9000, elapsed = 0, hold = 2000, last = 0, next = 0;
  let resetPending = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const cancel = () => { if (timer !== undefined) clearTimeout(timer); timer = undefined; };
  const publish = () => {
    effective = { ...base, azimuth: base.azimuth + azimuth, elevation: base.elevation + elevation };
    metrics.frames++;
    invalidate();
  };
  const hidden = () => disposed || lost || !inView || hostHidden || document.hidden ||
    !!canvas.hidden || !root.isConnected || lighting.effects.reducedEffects;
  const reduced = () => motion.matches || lighting.effects.reducedMotion;
  const wake = () => {
    cancel();
    last = performance.now();
    next = 0;
    metrics.paused = !enabled || hidden() || reduced();
    if (reduced()) {
      metrics.moving = false;
      elapsed = 0;
      hold = 2000;
      fromAzimuth = fromElevation = 0;
      if (azimuth || elevation) {
        azimuth = elevation = 0;
        // Freeze to the unmodified studio setting. Hidden windows defer this
        // redraw until they become visible again.
        effective = base;
        resetPending = true;
      }
    }
    if (!hidden()) {
      if (resetPending) { resetPending = false; invalidate(); }
      lighting.request();
    }
  };
  const schedule = (delay: number) => {
    cancel();
    timer = setTimeout(() => { timer = undefined; lighting.request(); }, delay);
  };
  const stopTask = lighting.addTask((now) => {
    if (!enabled || hidden() || reduced()) {
      cancel(); metrics.paused = true; last = 0;
      return;
    }
    metrics.paused = false;
    if (now < next) return;
    const delta = last ? now - last : 0;
    last = now;
    if (!metrics.moving) {
      hold = Math.max(0, hold - delta);
      if (hold > 0) {
        next = now + hold;
        schedule(hold);
        return;
      }
      metrics.moving = true;
      elapsed = 0;
      fromAzimuth = azimuth;
      fromElevation = elevation;
    } else elapsed = Math.min(duration, elapsed + delta);
    const t = elapsed / duration;
    // Quintic ease gives zero velocity and acceleration at both ends. Each
    // destination is held rather than immediately sweeping back again.
    const s = t * t * t * (t * (t * 6 - 15) + 10);
    azimuth = fromAzimuth + (targetAzimuth - fromAzimuth) * s;
    elevation = fromElevation + (targetElevation - fromElevation) * s;
    publish();
    if (elapsed === duration) {
      metrics.moving = false;
      metrics.moves++;
      hold = 8000 + Math.random() * 8000;
      duration = 8000 + Math.random() * 4000;
      // Nonperiodic bounded poses and pauses. No intensity, colour, opacity,
      // roughness or environment-map changes participate in the effect.
      targetAzimuth = (Math.random() - 0.5) * 112;
      // Avoid spending an entire movement on a barely distinguishable pose.
      if (Math.abs(targetAzimuth - azimuth) < 32)
        targetAzimuth = (azimuth > 0 ? -1 : 1) * (32 + Math.random() * 24);
      targetElevation = (Math.random() - 0.5) * 16;
    }
    next = now + (metrics.moving ? frameInterval : hold);
    schedule(metrics.moving ? frameInterval : hold);
    // The scene's existing render task runs before this one. Request one
    // follow-up frame to consume its invalidation, then sleep until next tick.
    return true;
  });
  const visibility = new IntersectionObserver(([entry]) => {
    inView = entry.isIntersecting;
    wake();
  });
  visibility.observe(root);
  const ancestors: HTMLElement[] = [];
  for (let node: HTMLElement | null = root; node; node = node.parentElement) ancestors.push(node);
  const checkHost = () => {
    const value = ancestors.some(node => {
      const style = getComputedStyle(node);
      return node.hidden || style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse";
    });
    if (value !== hostHidden) { hostHidden = value; wake(); }
  };
  const hostVisibility = new MutationObserver(checkHost);
  ancestors.forEach(node => hostVisibility.observe(node, {
    attributes: true, attributeFilter: ["hidden", "class", "style"],
  }));
  checkHost();
  const contextLost = () => { lost = true; wake(); };
  const contextRestored = () => { lost = false; wake(); };
  canvas.addEventListener("webglcontextlost", contextLost);
  canvas.addEventListener("webglcontextrestored", contextRestored);
  document.addEventListener("visibilitychange", wake);
  motion.addEventListener("change", wake);
  const stopEffects = lighting.subscribe(() => {
    if (base !== lighting.light) {
      // Explicit lighting changes establish a new resting pose. Animation
      // never writes back into the shared setting or authored document.
      base = lighting.light;
      effective = base;
      resetPending = true;
      azimuth = elevation = fromAzimuth = fromElevation = 0;
      metrics.moving = false;
      hold = 8000;
      elapsed = 0;
    }
    wake();
  });
  return {
    metrics,
    get light() { return effective; },
    get enabled() { return enabled; },
    setEnabled(value: boolean) {
      if (disposed || value === enabled) return;
      enabled = value;
      wake();
    },
    dispose() {
      disposed = true;
      metrics.paused = true;
      metrics.moving = false;
      cancel();
      stopTask(); stopEffects();
      visibility.disconnect(); hostVisibility.disconnect();
      canvas.removeEventListener("webglcontextlost", contextLost);
      canvas.removeEventListener("webglcontextrestored", contextRestored);
      document.removeEventListener("visibilitychange", wake);
      motion.removeEventListener("change", wake);
    },
  };
}
