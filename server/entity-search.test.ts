import { afterEach, describe, expect, it } from "vitest";
import express from "express";
import type { Server } from "node:http";
import { Surreal } from "surrealdb";
import { createNodeEngines } from "@surrealdb/node";
import { createEntitySearchRouter } from "./entity-search";
const cleanup: (() => Promise<unknown>)[] = [];
afterEach(async () => { for (const fn of cleanup.splice(0).reverse()) await fn(); });
async function setup(available = true, readOnly = false) {
  const db = new Surreal({ engines: createNodeEngines() });
  await db.connect("mem://"); await db.use({ namespace: "test", database: "entities" });
  cleanup.push(() => db.close());
  const app = express(); app.use(express.json()); app.use("/api", createEntitySearchRouter(() => available ? db : undefined, { readOnly }));
  const server = await new Promise<Server>(resolve => { const s = app.listen(0, "127.0.0.1", () => resolve(s)); });
  cleanup.push(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${(server.address() as any).port}/api`;
  const search = (alias: boolean, parameters: Record<string,string>) => fetch(`${base}/findAgentsBy${alias ? "Alias" : "Name"}Json?${new URLSearchParams(parameters)}`);
  const summaries = (ids: unknown) => fetch(`${base}/entities/summary`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids }) });
  const create = (id: unknown, name: unknown) => fetch(`${base}/entities`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, name }) });
  return { db, search, summaries, create };
}
describe("SurrealDB entity search", () => {
  it("creates a searchable canonical name, confirms retries and never overwrites another name", async () => {
    const { create, search, summaries } = await setup(), id = crypto.randomUUID(), name = "O’Keeffe — 山";
    expect(await (await create(id, name)).json()).toEqual({ Success: true, Entity: { id, name } });
    expect(await (await create(id, name)).json()).toEqual({ Success: true, Entity: { id, name } });
    expect((await create(id, "Changed name")).status).toBe(409);
    expect(await (await search(false, { search: name })).json()).toMatchObject({ Count: 1, Results: [{ id, name }] });
    expect(await (await summaries([id])).json()).toMatchObject({ Results: [{ id, name, mentions: 0 }] });
  });
  it("rejects invalid, offline and read-only creation and handles SQL-like names as data", async () => {
    const f = await setup(), id = crypto.randomUUID(), name = "'; REMOVE TABLE Agent; --";
    expect((await f.create("Agent:other", "Name")).status).toBe(400);
    expect((await f.create(id, "  ")).status).toBe(400);
    expect((await f.create(id, "x".repeat(1001))).status).toBe(400);
    expect((await f.create(id, name)).status).toBe(200);
    expect(await (await f.summaries([id])).json()).toMatchObject({ Results: [{ id, name }] });
    const offline = await setup(false); expect((await offline.create(crypto.randomUUID(), "Name")).status).toBe(503);
    const readOnly = await setup(true, true); expect((await readOnly.create(crypto.randomUUID(), "Name")).status).toBe(403);
    expect(await (await readOnly.search(false, { search: "Name" })).json()).toMatchObject({ Count: 0 });
  });
  it("queries real in-memory names and aliases with mentions and stable string IDs", async () => {
    const { db, search } = await setup();
    await db.query("CREATE Agent:blake SET name = 'Vernon Blake'; CREATE StandoffProperty:mention SET text = 'Blake'; RELATE StandoffProperty:mention->standoff_property_refers_to_agent->Agent:blake;");
    const name = await (await search(false, { search: "Vernon", byPartial: "true" })).json();
    expect(name).toMatchObject({ Success: true, Count: 1, Page: 1, MaxPage: 1, Results: [{ id: "blake", name: "Vernon Blake", mentions: 1 }] });
    const alias = await (await search(true, { search: "Blake", byPartial: "false", order: "ByText" })).json();
    expect(alias).toMatchObject({ Success: true, Count: 1, Results: [{ id: "blake", name: "Vernon Blake", text: "Blake", mentions: 1 }] });
    expect(await (await search(false, { search: "Vernon", byPartial: "false" })).json()).toMatchObject({ Count: 0, Page: 1, MaxPage: 1, Results: [] });
  });
  it("handles paging, validation, unavailable database and SQL-like search as data", async () => {
    const { db, search } = await setup();
    for (let i = 0; i < 12; i++) await db.query("CREATE Agent CONTENT {name:$name}", { name: `Entity ${i}` });
    const page = await (await search(false, { search: "Entity", byPartial: "true", page: "99" })).json();
    expect(page).toMatchObject({ Count: 12, Page: 2, MaxPage: 2 }); expect(page.Results).toHaveLength(2);
    expect((await search(false, { search: "test", page: "-1" })).status).toBe(400);
    expect(await (await search(false, { search: "'; REMOVE TABLE Agent; --", byPartial: "true" })).json()).toMatchObject({ Success: true, Count: 0 });
    const offline = await setup(false); expect((await offline.search(false, { search: "Entity" })).status).toBe(503);
  });
  it("returns bulk entity summaries without requiring a name query", async () => {
    const { db, summaries } = await setup();
    await db.query("CREATE Agent:blake SET name = 'Vernon Blake'; CREATE Agent:other SET name = 'Other'; CREATE StandoffProperty:one SET text = 'Blake'; CREATE StandoffProperty:two SET text = 'Blake'; RELATE StandoffProperty:one->standoff_property_refers_to_agent->Agent:blake; RELATE StandoffProperty:two->standoff_property_refers_to_agent->Agent:blake;");
    const response = await summaries(["blake", "other", "blake", "missing"]);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ Success: true, Results: expect.arrayContaining([{ id: "blake", name: "Vernon Blake", mentions: 2 }, { id: "other", name: "Other", mentions: 0 }]) });
    expect(await (await summaries([])).json()).toEqual({ Success: true, Results: [] });
    expect((await summaries("blake")).status).toBe(400);
    const offline = await setup(false); expect((await offline.summaries(["blake"])).status).toBe(503);
  });
});
