import { Show, createEffect, createMemo, createSignal, on, onMount } from "solid-js";
import { ApplicationSurfacePortal as Portal } from "../../feature-api";
import type { BlockRuntime } from "../../feature-api";
import { DEFAULT_TIMER_SIZE, MAX_TIMER_SECONDS, MIN_TIMER_SIZE, timerDuration, timerDimensions, readTimerPayload, type TimerPayload } from "./model";
import { createFloatingWindowResize, FloatingWindowResizeHandle } from "../../feature-api";
import "./view.css";

const formatDuration = (milliseconds: number) => {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
};

const parseDuration = (value: string) => {
  const match = value.trim().match(/^(\d{1,4}):([0-5]\d)$/);
  if (!match) return;
  const seconds = Number(match[1]) * 60 + Number(match[2]);
  return seconds >= 1 && seconds <= MAX_TIMER_SECONDS ? seconds : undefined;
};

export function TimerBlockView(props: { runtime: BlockRuntime }) {
  const runtime = props.runtime;
  const authored = createMemo(() => readTimerPayload(runtime.field("timer")));
  const [operational,setOperational]=createSignal<TimerPayload>();
  const protectedState=createMemo(()=>runtime.authoredStateProtected());
  createEffect(on(()=>[authored(),protectedState()] as const,()=>setOperational(undefined)));
  const timer = createMemo(() => protectedState() ? operational()??authored() : authored());
  const [now, setNow] = createSignal(Date.now());
  const [draft, setDraft] = createSignal(formatDuration(timer().durationSeconds * 1000));
  const [message, setMessage] = createSignal("");
  const [previewPosition, setPreviewPosition] = createSignal<{ x: number; y: number }>();
  let root!: HTMLDivElement;
  let durationInput!: HTMLInputElement;
  let interval: ReturnType<typeof setInterval> | undefined;
  let audio: AudioContext | undefined;
  let drag: { pointerId: number; x: number; y: number; left: number; top: number } | undefined;
  const mountedAt = Date.now();
  let deadline: number | undefined, notified: number | undefined;

  const remainingMilliseconds = createMemo(() => {
    const state = timer();
    if (state.mode === "running") return Math.max(0, Number(state.runningUntil) - now());
    if (state.mode === "paused") return Math.max(0, Number(state.remainingMilliseconds ?? state.durationSeconds * 1000));
    return state.durationSeconds * 1000;
  });
  const done = createMemo(() => timer().mode === "running" && remainingMilliseconds() <= 0);
  const size = createMemo(() => {
    const property = ((runtime.field("blockProperties") as Array<Record<string, unknown>> | undefined) ?? []).find(item => item.type === "block/size" && !item.isDeleted);
    const metadata = property?.metadata as Record<string, unknown> | undefined;
    return { width: Math.max(MIN_TIMER_SIZE, Number(metadata?.width) || DEFAULT_TIMER_SIZE), height: Math.max(MIN_TIMER_SIZE, Number(metadata?.height) || DEFAULT_TIMER_SIZE) };
  });
  const storedPosition = createMemo(() => {
    const property = ((runtime.field("blockProperties") as Array<Record<string, unknown>> | undefined) ?? []).find(item => item.type === "block/position" && !item.isDeleted);
    const metadata = property?.metadata as Record<string, unknown> | undefined;
    const x = Number(metadata?.x), y = Number(metadata?.y);
    return { x: Number.isFinite(x) ? x : 24, y: Number.isFinite(y) ? y : 80 };
  });

  const commit = (next: TimerPayload, label: string) => { if(protectedState())setOperational(next);else runtime.setField("timer", next, label); };
  const prepareAudio = () => {
    const Audio = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Audio) return;
    audio ??= new Audio();
    void audio.resume();
  };
  const sound = () => {
    try {
      prepareAudio(); if (!audio) return;
      const oscillator = audio.createOscillator(), gain = audio.createGain(), start = audio.currentTime;
      oscillator.type = "sine"; oscillator.frequency.setValueAtTime(880, start);
      gain.gain.setValueAtTime(.12, start); gain.gain.exponentialRampToValueAtTime(.001, start + .22);
      oscillator.connect(gain); gain.connect(audio.destination); oscillator.start(start); oscillator.stop(start + .22);
    } catch { /* The visual Done state remains available when browser audio is blocked. */ }
  };
  const start = () => {
    prepareAudio();
    const state = timer(), remaining = state.mode === "paused" ? remainingMilliseconds() : state.durationSeconds * 1000;
    commit({ durationSeconds: state.durationSeconds, mode: "running", runningUntil: Date.now() + Math.max(1000, remaining) }, state.mode === "paused" ? "Resume Timer" : "Start Timer");
  };
  const pause = () => {
    const state = timer(); if (state.mode !== "running" || done()) return;
    commit({ durationSeconds: state.durationSeconds, mode: "paused", remainingMilliseconds: remainingMilliseconds() }, "Pause Timer");
  };
  const reset = () => {
    const seconds = timer().durationSeconds;
    commit({ durationSeconds: seconds, mode: "idle", remainingMilliseconds: seconds * 1000 }, "Reset Timer");
  };
  const setDuration = () => {
    if(protectedState())return;
    const seconds = parseDuration(draft());
    if (!seconds) { setMessage("Enter a duration from 00:01 to 1440:00."); durationInput.focus(); return; }
    setMessage(""); commit({ durationSeconds: timerDuration(seconds), mode: "idle", remainingMilliseconds: seconds * 1000 }, "Set Timer Duration");
  };
  const remove = () => {
    if(!protectedState())runtime.removeAndFocusFallback();
  };
  const setBlockProperty = (type: string, metadata: Record<string, unknown>, label: string) => {
    if(protectedState())return;
    const properties = (runtime.field("blockProperties") as Array<Record<string, unknown>> | undefined) ?? [];
    runtime.setField("blockProperties", [...properties.filter(item => item.type !== type || item.isDeleted), { type, metadata }], label);
  };
  const timerResize = createFloatingWindowResize({
    element: () => root,
    size,
    minimum: { width: MIN_TIMER_SIZE, height: MIN_TIMER_SIZE },
    enabled:()=>!protectedState(),
    onCommit: final => setBlockProperty("block/size", { ...timerDimensions(final), "min-width": MIN_TIMER_SIZE }, "Resize Timer"),
  });
  const dimensions = timerResize.dimensions;
  createEffect(()=>{if(protectedState()){timerResize.cancel();drag=undefined;setPreviewPosition(undefined);}});
  const clampPosition = (x: number, y: number) => {
    const current = dimensions();
    return { x: Math.max(0, Math.min(x, window.innerWidth - current.width)), y: Math.max(0, Math.min(y, window.innerHeight - current.height)) };
  };
  const finishDrag = (event: PointerEvent) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    const final = previewPosition() ?? storedPosition(); drag = undefined; setPreviewPosition(undefined);
    setBlockProperty("block/position", { x: Math.round(final.x), y: Math.round(final.y), position: "fixed" }, "Move Timer");
  };

  createEffect(() => {
    const state = timer();
    clearInterval(interval); interval = undefined; setNow(Date.now());
    if (state.mode !== "running" || Number(state.runningUntil) <= Date.now()) return;
    interval = setInterval(() => { const current = Date.now(); setNow(current); if (current >= Number(state.runningUntil)) { clearInterval(interval); interval = undefined; } }, 1000);
  });
  createEffect(() => {
    const state = timer(), currentDeadline = state.mode === "running" ? state.runningUntil : undefined;
    if (currentDeadline !== deadline) { deadline = currentDeadline; notified = currentDeadline && currentDeadline <= mountedAt ? currentDeadline : undefined; }
    if (currentDeadline && done() && notified !== currentDeadline) { notified = currentDeadline; sound(); }
  });
  createEffect(() => {
    const state = timer();
    if (document.activeElement !== durationInput) setDraft(formatDuration(state.durationSeconds * 1000));
  });
  onMount(() => {
    runtime.mountWidget(root);
  });
  runtime.own(() => { clearInterval(interval); void audio?.close(); });

  const position = () => previewPosition() ?? storedPosition();
  return <Portal kind="tool"><div ref={root} class="abstract-block reactive-timer" classList={{ "reactive-timer--done": done() }} tabIndex={-1} role="dialog" aria-modal="false" aria-label="Timer"
    style={{ width: `${dimensions().width}px`, height: `${dimensions().height}px`, left: `${position().x}px`, top: `${position().y}px` }}
    onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); remove(); } }}
    data-block-id={String(runtime.field("id") ?? "")} data-client-id={runtime.nodeKey} data-runtime-key={runtime.nodeKey} data-block-type="timer-block">
    <header class="reactive-timer__header"
      onPointerDown={event => { if (protectedState() || event.button !== 0 || (event.target as Element).closest("button")) return; const current = position(); drag = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, left: current.x, top: current.y }; event.currentTarget.setPointerCapture?.(event.pointerId); event.preventDefault(); }}
      onPointerMove={event => { if (!drag || drag.pointerId !== event.pointerId) return; setPreviewPosition(clampPosition(drag.left + event.clientX - drag.x, drag.top + event.clientY - drag.y)); }}
      onPointerUp={finishDrag} onLostPointerCapture={finishDrag} onPointerCancel={() => { drag = undefined; setPreviewPosition(undefined); }}>
      <span>Timer</span><button type="button" aria-label="Close timer" title="Close timer" disabled={protectedState()} onPointerDown={event => event.stopPropagation()} onClick={remove}>×</button>
    </header>
    <output class="reactive-timer__display" role="timer" aria-label={`${formatDuration(remainingMilliseconds())} remaining`}>{formatDuration(remainingMilliseconds())}</output>
    <Show when={!done()} fallback={<div class="reactive-timer__finished"><strong role="status">Time’s up</strong><button type="button" class="reactive-timer__done" onClick={()=>protectedState()?reset():remove()}>{protectedState()?"Reset":"Done"}</button></div>}>
      <div class="reactive-timer__controls">
        <Show when={timer().mode === "running"} fallback={<button type="button" onClick={start}>{timer().mode === "paused" ? "Resume" : "Start"}</button>}><button type="button" onClick={pause}>Pause</button></Show>
        <button type="button" disabled={timer().mode === "idle"} onClick={reset}>Reset</button>
      </div>
      <div class="reactive-timer__setting">
        <label for={`${runtime.nodeKey}-duration`}>Duration</label>
        <input ref={durationInput} id={`${runtime.nodeKey}-duration`} aria-label="Timer duration in minutes and seconds" inputmode="numeric" value={draft()} disabled={protectedState() || timer().mode === "running"}
          onInput={event => { setDraft(event.currentTarget.value); setMessage(""); }} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); setDuration(); } }} />
        <button type="button" disabled={protectedState() || timer().mode === "running"} onClick={setDuration}>Set</button>
      </div>
      <Show when={message()}>{text => <small role="alert">{text()}</small>}</Show>
    </Show>
    <Show when={!protectedState()}><FloatingWindowResizeHandle controller={timerResize} class="reactive-timer__resize" label="Resize timer" /></Show>
  </div></Portal>;
}
