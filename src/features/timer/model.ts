import type {ExistingBlockDto} from "../../block-tree/types";

export const DEFAULT_TIMER_SECONDS = 5 * 60;
export const MAX_TIMER_SECONDS = 24 * 60 * 60;
export const DEFAULT_TIMER_SIZE = 130;
export const MIN_TIMER_SIZE = 110;

export type TimerMode = "idle" | "running" | "paused";
export interface TimerPayload {
  durationSeconds: number;
  mode: TimerMode;
  runningUntil?: number;
  remainingMilliseconds?: number;
}

const boundedSeconds = (value: unknown) => Math.max(1, Math.min(MAX_TIMER_SECONDS, Math.round(Number(value) || DEFAULT_TIMER_SECONDS)));

export function readTimerPayload(value: unknown): TimerPayload {
  const raw = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const durationSeconds = boundedSeconds(raw.durationSeconds);
  if (raw.mode === "running" && typeof raw.runningUntil === "number" && Number.isFinite(raw.runningUntil) && raw.runningUntil > 0) {
    return { durationSeconds, mode: "running", runningUntil: raw.runningUntil };
  }
  if (raw.mode === "paused") {
    const remaining = typeof raw.remainingMilliseconds === "number" ? raw.remainingMilliseconds : Number.NaN;
    return { durationSeconds, mode: "paused", remainingMilliseconds: Number.isFinite(remaining) ? Math.max(0, Math.min(durationSeconds * 1000, Math.round(remaining))) : durationSeconds * 1000 };
  }
  return { durationSeconds, mode: "idle", remainingMilliseconds: durationSeconds * 1000 };
}

export const timerParameters={durationSeconds:{type:'integer',minimum:1,maximum:MAX_TIMER_SECONDS},size:{anyOf:[{type:'object',properties:{width:{type:'number',minimum:MIN_TIMER_SIZE},height:{type:'number',minimum:MIN_TIMER_SIZE}},required:['width','height'],additionalProperties:false},{type:'null'}]}} as const;
export function timerDuration(value:unknown):number {
 if(!Number.isInteger(value)||Number(value)<1||Number(value)>MAX_TIMER_SECONDS)throw Error('Invalid timer duration');return value as number;
}
export function timerDimensions(value:unknown):{width:number;height:number} {
 if(value===null)return {width:DEFAULT_TIMER_SIZE,height:DEFAULT_TIMER_SIZE};
 const v=value as any;if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).some(k=>!['width','height'].includes(k))||!Number.isFinite(v.width)||!Number.isFinite(v.height)||v.width<MIN_TIMER_SIZE||v.height<MIN_TIMER_SIZE)throw Error('Invalid timer size');return {width:v.width,height:v.height};
}
export function timerBlockDto(position?: { x: number; y: number },duration=DEFAULT_TIMER_SECONDS,size:unknown=null): ExistingBlockDto {
  const seconds=timerDuration(duration),dimensions=timerDimensions(size);
  return {
    id: crypto.randomUUID(),
    type: "timer-block",
    timer: { durationSeconds: seconds, mode: "idle", remainingMilliseconds: seconds * 1000 },
    blockProperties: [
      { type: "block/size", metadata: { ...dimensions, "min-width": MIN_TIMER_SIZE } },
      ...(position ? [{ type: "block/position", metadata: { ...position, position: "fixed" } }] : []),
    ],
  };
}
