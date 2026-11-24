import {Easing, interpolate} from 'remotion';

// Cue times are in seconds. Each evaluation describes an absolute frame, including after a seek.
export function ease(time: number, start: number, end: number) {
  return interpolate(time, [start, end], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.bezier(0.42, 0, 0.22, 1),
  });
}

export function hold(time: number, start: number, end: number, fade = 0.45) {
  return ease(time, start, start + fade) * (1 - ease(time, end - fade, end));
}
