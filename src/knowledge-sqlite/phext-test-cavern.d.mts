/** Test helper: establish a Cavern phext at `root` and register every
 * phext backend (fs facade, gates, knowledge) for it. The handle's
 * members are the PhextVFS instance and this helper's convenience
 * wrappers; typed loosely — the helper is JavaScript. */
export interface TestCavern {
  vfs: any;
  phextPath: string;
  writeFile(rel: string, text: string): void;
  readFile(rel: string): string;
  unlink(rel: string): void;
  rename(from: string, to: string): void;
  flush(): any;
  close(): any;
}
export function testCavern(root: string, options?: { create?: boolean }): TestCavern;
