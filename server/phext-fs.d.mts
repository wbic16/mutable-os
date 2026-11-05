import type { promises as FsPromises } from 'node:fs';

/** The phext-fs facade mirrors node:fs promises for in-Cavern paths. */
export const promises: typeof FsPromises;
export const constants: typeof import('node:fs').constants;
export function registerPhextFs(options: { root: string; vfs: unknown; anchors?: unknown }): unknown;
export function unregisterPhextFs(root: string): void;
export function phextFsBackendFor(absPath: string): unknown;
export function sliceNativeEnvelope(data: unknown): unknown;
