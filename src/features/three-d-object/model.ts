export type ViewAngles = { azimuth: number; elevation: number };
export type Lighting = "neutral" | "warm" | "dramatic";
export interface ObjectState {
  version: 1; scene: string; view: ViewAngles; autoRotate: boolean; lighting: Lighting;
  settings: Record<string, unknown>;
}
export const presets = {
  Front: { azimuth: 0, elevation: 20 }, Side: { azimuth: 90, elevation: 20 },
  "Three-quarter": { azimuth: 45, elevation: 25 }, Isometric: { azimuth: 45, elevation: 35.264 },
  "Top-ish": { azimuth: 0, elevation: 65 },
} satisfies Record<string, ViewAngles>;
export const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const finite = (value: unknown, fallback: number) => typeof value === "number" && Number.isFinite(value) ? value : fallback;
export function angles(value: unknown): ViewAngles {
  const v = record(value);
  return { azimuth: ((finite(v.azimuth, 45) % 360) + 360) % 360, elevation: Math.max(10, Math.min(70, finite(v.elevation, 25))) };
}
export function readObject(value: unknown): ObjectState | undefined {
  const v = record(value), settings = record(v.settings);
  if (v.version !== undefined && v.version !== 1 || v.scene !== undefined && v.scene !== "coffee-cup") return;
  return { version: 1, scene: "coffee-cup", view: angles(v.view), autoRotate: v.autoRotate === true,
    lighting: ["warm", "dramatic"].includes(String(v.lighting)) ? v.lighting as Lighting : "neutral",
    settings: { steam: settings.steam !== false, coffeeStain: settings.coffeeStain === true } };
}
export const defaults = (): ObjectState => readObject({})!;
/** Preserve future fields even within objects touched by a semantic action. */
export function patchObject(value: unknown, patch: Partial<ObjectState>): Record<string, unknown> {
  const before = record(value);
  return { ...before, ...patch,
    ...(patch.view ? { view: { ...record(before.view), ...patch.view } } : {}),
    ...(patch.settings ? { settings: { ...record(before.settings), ...patch.settings } } : {}),
  };
}
export function objectSize(properties: unknown) {
  const entry = Array.isArray(properties) ? properties.find(p => p?.type === "block/size" && !p.isDeleted) : undefined;
  const width = Math.max(160, Math.min(640, finite(entry?.metadata?.width, 280)));
  return { width, height: width };
}
export function sizeProperties(properties: unknown, width: number) {
  const list = Array.isArray(properties) ? properties : [];
  let found = false;
  const next = list.map(p => {
    if (p?.type !== "block/size" || p.isDeleted || found) return p;
    found = true; return { ...p, metadata: { ...record(p.metadata), width, height: width } };
  });
  if (!found) next.push({ type: "block/size", metadata: { width, height: width } });
  return next;
}
export const objectParameters={scene:{type:'string',enum:['coffee-cup']},view:{type:'object',properties:{azimuth:{type:'number',minimum:0,maximum:360},elevation:{type:'number',minimum:10,maximum:70}},required:['azimuth','elevation'],additionalProperties:false},lighting:{type:'string',enum:['neutral','warm','dramatic']},autoRotate:{type:'boolean'},steam:{type:'boolean'},coffeeStain:{type:'boolean'},size:{type:'number',minimum:160,maximum:640}} as const;
export function objectConfiguration(value:unknown) {
 const v=value as any;
 if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).length!==Object.keys(objectParameters).length||Object.keys(v).some(k=>!Object.hasOwn(objectParameters,k))||v.scene!=='coffee-cup'||!v.view||Object.keys(v.view).length!==2||!Number.isFinite(v.view.azimuth)||v.view.azimuth<0||v.view.azimuth>360||!Number.isFinite(v.view.elevation)||v.view.elevation<10||v.view.elevation>70||!['neutral','warm','dramatic'].includes(v.lighting)||['autoRotate','steam','coffeeStain'].some(k=>typeof v[k]!=='boolean')||!Number.isFinite(v.size)||v.size<160||v.size>640)throw Error('Invalid native 3D object configuration');
 return {state:readObject({version:1,scene:v.scene,view:v.view,lighting:v.lighting,autoRotate:v.autoRotate,settings:{steam:v.steam,coffeeStain:v.coffeeStain}})!,size:v.size as number};
}
export function objectDto(configuration:unknown=null) {
 const prepared=configuration===null?{state:defaults(),size:280}:objectConfiguration(configuration);
 return {id:crypto.randomUUID(),type:'3d-object-block',object3D:prepared.state,blockProperties:sizeProperties([],prepared.size)};
}
