// @vitest-environment node
/**
 * H2 regression (bug hunt, 2026-11-05): the open-phext unseal
 * path. The 512 MiB upload cap bounds the SEALED bytes only, and
 * xz expands crafted input thousands-to-one — decompression must
 * carry its own cap, enforced while streaming to a temp file with
 * the child killed past it, instead of buffering the expansion in
 * memory until the process dies. A legitimate seal must still
 * unlock byte-identical.
 */
import { expect, it } from 'vitest';
import { MAX_UNSEALED_PHEXT_BYTES, sealPhext, unsealPhext } from './phext-cavern-transfer.mjs';

it('unseal refuses a seal expanding past the decompressed cap; a legitimate seal still unlocks (H2)', { timeout: 60000 }, async () => {
  expect(MAX_UNSEALED_PHEXT_BYTES).toBe(512 * 1024 * 1024);
  const raw = Buffer.alloc(4 * 1024 * 1024); // zeros: xz's best case
  const sealed = await sealPhext(raw);
  expect(sealed.length).toBeLessThan(raw.length / 100);
  // The cap error is the kill path's signature: the refusal arrives
  // with the decompressed-size message, not after a full expansion.
  await expect(unsealPhext(sealed, { maxBytes: 64 * 1024 }))
    .rejects.toThrow(/decompresses to more than the 65536-byte limit/);
  const back = await unsealPhext(sealed);
  expect(back.equals(raw)).toBe(true);
});
