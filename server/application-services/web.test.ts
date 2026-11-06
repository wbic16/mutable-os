// @vitest-environment node
import { it, expect, afterEach, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { testCavern } from "../../src/knowledge-sqlite/phext-test-cavern.mjs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { WebResourceService } from "../../src/application-services/web-service";
import { CavernJobStorage } from "./job-storage";
import { NodePreparationExecutor } from "./executor";
import { ManagedAssetStore } from "../managed-assets.mjs";
vi.setConfig({ testTimeout: 30000 });
const cleanup: (() => any)[] = [];
afterEach(async () => {
  for (const f of cleanup.splice(0).reverse()) await f();
});
async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "web-g-")),
    cavernId = randomUUID();
  cleanup.push(() => rm(root, { recursive: true, force: true }));
  const cavern = testCavern(root); cleanup.push(() => cavern.close());
  const jobs = new CavernJobStorage(root, cavernId),
    executor = new NodePreparationExecutor(),
    assets = new ManagedAssetStore({ root, cavernId, session: "test" });
  cleanup.push(async () => {
    await jobs.close();
    await executor.close();
    await assets.close();
  });
  let fetches = 0;
  const ports: any = {
    jobs,
    executor,
    uuid: randomUUID,
    now: () => new Date().toISOString(),
    acquire: async (url: string) => {
      fetches++;
      return {
        endpoint: url,
        body: '<title>Retained title</title><meta name="description" content="Text">',
      };
    },
    retain: async (bytes: Uint8Array) => {
      const l = await assets.begin(),
        a = await assets.stage(l, Buffer.from(bytes), {
          mediaType: "application/json",
        });
      await assets.publish(l);
      await assets.finish(l, "test");
      return { kind: "managed", cavernId, assetId: a.assetId };
    },
    read: async (ref: any) =>
      new Uint8Array((await assets.get(ref.assetId, ref.cavernId)).bytes),
  };
  const service = new WebResourceService(ports);
  cleanup.push(() => service.close());
  return { service, ports, jobs, assets, fetches: () => fetches };
}
it("captures immutable sources with real worker/journal, resumes completed jobs without acquisition", async () => {
  const f = await fixture(),
    id = randomUUID(),
    source = "https://example.org/article?track=1#section",
    r = await f.service.call("web.import", { id, source });
  expect(r.capture.projection.title).toBe("Retained title");
  expect(r.capture.source).toBe(source);
  expect((await f.service.call("web.resume", { id })).capture).toEqual(
    r.capture,
  );
  expect(f.fetches()).toBe(1);
  const bytes = await f.ports.read(r.capture.asset);
  expect(JSON.parse(new TextDecoder().decode(bytes)).body).toContain(
    "<title>Retained title</title>",
  );
  expect((await f.jobs.load(id)).summary.state).toBe("completed");
});
it("recovers retained checkpoint after worker failure without reacquiring and rejects different job kinds", async () => {
  const f = await fixture(),
    id = randomUUID(),
    run = f.ports.executor.run.bind(f.ports.executor);
  f.ports.executor.run = async () => {
    throw Error("worker interrupted");
  };
  await expect(
    f.service.call("web.import", { id, source: "https://example.org" }),
  ).rejects.toThrow("mutable-web-job:");
  expect((await f.jobs.load(id)).summary.state).toBe("failed");
  f.ports.executor.run = run;
  expect(
    (await f.service.call("web.resume", { id })).capture.projection.title,
  ).toBe("Retained title");
  expect(f.fetches()).toBe(1);
  const other = randomUUID();
  await f.jobs.create(other, { kind: "convert", format: "text", source: "x" });
  await expect(f.service.call("web.resume", { id: other })).rejects.toThrow(
    "Wrong job",
  );
});
it("keeps provider failure as diagnosed fallback, map is network-free and configured key is activation-only", async () => {
  const f = await fixture();
  f.ports.acquire = async () => {
    throw Error("HTTP 403");
  };
  expect(
    (
      await f.service.call("web.import", {
        id: randomUUID(),
        source: "https://x.com/jack/status/20",
      })
    ).capture.projection.status,
  ).toBe("unavailable");
  const source = "https://maps.google.com/?q=-33.8,151.2",
    r = await f.service.call("web.import", { id: randomUUID(), source });
  expect(r.capture.projection.location?.coordinates).toEqual([-33.8, 151.2]);
  expect((await f.service.call("web.embed", { source })).message).toContain(
    "not configured",
  );
  f.ports.mapsKey = "restricted-browser-key-123456789";
  const embed = await f.service.call("web.embed", { source });
  expect(embed.url).toContain("/maps/embed/v1/place?key=");
  expect(JSON.stringify(r)).not.toContain(f.ports.mapsKey);
});
it("cancels acquisition without an inserted result and enforces queue admission before async job creation", async () => {
  const f = await fixture(),
    c = new AbortController();
  f.ports.acquire = (_u: any, _f: any, s: AbortSignal) =>
    new Promise((_, reject) =>
      s.addEventListener("abort", () => reject(Error("cancelled")), {
        once: true,
      }),
    );
  const id = randomUUID(),
    p = f.service.call(
      "web.import",
      { id, source: "https://example.org" },
      c.signal,
    );
  while (
    (await f.jobs.load(id).catch(() => undefined))?.summary.state !== "running"
  )
    await new Promise((r) => setTimeout(r, 10));
  c.abort();
  await expect(p).rejects.toThrow();
  expect((await f.jobs.load(id)).summary.state).toBe("cancelled");
  const stop = new AbortController();
  const pending = Array.from({ length: 8 }, () =>
    f.service
      .call(
        "web.import",
        { id: randomUUID(), source: "https://example.org" },
        stop.signal,
      )
      .catch((e) => e),
  );
  await expect(
    f.service.call("web.import", {
      id: randomUUID(),
      source: "https://example.org",
    }),
  ).rejects.toThrow("queue full");
  stop.abort();
  await Promise.all(pending);
});
it("rejects extra capability fields and specialised URLs", async () => {
  const f = await fixture();
  await expect(
    f.service.call("web.import", {
      id: randomUUID(),
      source: "https://example.org",
      sql: "DROP TABLE",
    } as any),
  ).rejects.toThrow();
  await expect(
    f.service.call("web.import", {
      id: randomUUID(),
      source: "https://youtu.be/dQw4w9WgXcQ",
    }),
  ).rejects.toThrow("specialized");
});
it('retains local ICS original byte-for-byte, resumes without acquisition, and gates H separately from G',async()=>{
 const f=await fixture();f.ports.everydayEnabled=true;const source='mutable-file:invite.ics',body='\uFEFFBEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:1\r\nSUMMARY:Invitation\r\nDTSTART:20261020T120000Z\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n';
 const r=await f.service.call('web.import',{id:randomUUID(),source,file:{name:'invite.ics',body,format:'calendar'}});expect(f.fetches()).toBe(0);expect(r.capture.projection.title).toBe('Invitation');expect(JSON.parse(new TextDecoder().decode(await f.ports.read(r.capture.asset))).body).toBe(body);expect((await f.service.call('web.resume',{id:r.jobId})).capture).toEqual(r.capture);
 f.ports.everydayEnabled=false;await expect(f.service.call('web.resume',{id:r.jobId})).rejects.toThrow('disabled');await expect(f.service.call('web.import',{id:randomUUID(),source,file:{name:'invite.ics',body,format:'calendar'}})).rejects.toThrow('disabled');
 f.ports.everydayEnabled=true;const legacy=await f.service.call('web.import',{id:randomUUID(),source:'https://open.spotify.com/track/0Lr4kGOYn9l83EjuK6cZFQ',everyday:false});expect(legacy.capture.projection.provider).toBe('web');
});
it('uses one public API request, records rate-limit failures, and makes no calls for private Drive/product fallbacks',async()=>{
 const f=await fixture();f.ports.everydayEnabled=true;let calls=0;f.ports.acquire=async()=>{calls++;throw Error('HTTP 429');};
 const limited=await f.service.call('web.import',{id:randomUUID(),source:'https://github.com/solidjs/solid'});expect(limited.capture.projection.status).toBe('unavailable');expect(calls).toBe(1);await f.service.call('web.resume',{id:limited.jobId});expect(calls).toBe(1);
 for(const source of ['https://amazon.com/dp/B012345678','https://drive.google.com/file/d/abcdefghij12345/view'])expect((await f.service.call('web.import',{id:randomUUID(),source})).capture.projection.status).toBe('link-only');expect(calls).toBe(1);
 await expect(f.service.call('web.import',{id:randomUUID(),source:'https://example.org/a.pdf',format:'feed'})).rejects.toThrow();
});
