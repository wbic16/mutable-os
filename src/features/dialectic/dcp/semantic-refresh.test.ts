// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import {workspaceFixture} from './workspace.fixture';
import {XmlContext} from './xml-context';
import {prepare} from './exchange';
import {reconcileSemanticRefresh} from './semantic-refresh';
const cleanup:(()=>void)[]=[];afterEach(()=>{cleanup.splice(0).reverse().forEach(f=>f());vi.restoreAllMocks();});
function fixture(){const f=workspaceFixture();cleanup.push(f.dispose);const id=f.addHuman('Leonardo served Ludovico. His patron supported the artist.');return {...f,id};}
async function prepareRefresh(f:ReturnType<typeof fixture>,xml:(block:string,x:XmlContext)=>string){
 const s=f.open(),r=await f.req(s,f.id),x=new XmlContext(s,r.exchange);x.request(r);const block=r.structuralContext.sources.find((n:any)=>n.nativeType==='standoff-editor-block');
 const raw=xml(x.alias(block.handle),x),input=x.lower(raw,true);
 const result=await prepare(JSON.stringify(input),r.exchange,f.owner,f.editor.visualEffects,s,true,'ai','agent',1,1,true,undefined,true);
 const summary=reconcileSemanticRefresh(result,s,f.id,f.root.payload.linkedAnnotations as any??{});return {result,summary,s};
}
const semanticXml=(b:string)=>`<response><definitions>
 <entity id="leo" name="Leonardo" type="Person" wikidata="Q762"><description>Italian artist.</description></entity><entity id="ludo" name="Ludovico" type="Person"/>
 <mention target="${b}" quote="Leonardo" ref="leo"/><mention target="${b}" quote="Ludovico" ref="ludo"/>
 <classify target="${b}" quote="Leonardo served Ludovico." kind="claim"/>
 <argument id="a" target="${b}" quote="Leonardo served Ludovico."/><argument id="b" target="${b}" quote="His patron supported the artist."/>
 <relation kind="entity" type="served" from="leo" to="ludo"/><relation kind="argument" type="supports" from="b" to="a"/>
 <gloss target="${b}" quote="His patron" kind="context">Ludovico's patronage.</gloss>
 </definitions></response>`;
function admit(f:ReturnType<typeof fixture>,result:Awaited<ReturnType<typeof prepare>>){f.editor.commands.boundedStructuralTransaction('Fixture refresh',()=>{f.editor.commands.setPayloadField(f.root.key,'linkedAnnotations',{...JSON.parse(JSON.stringify(f.root.payload.linkedAnnotations??{})),...result.definitions});for(const [key,marks]of result.annotations)f.editor.commands.setPayloadField(key,'standoffProperties',[...JSON.parse(JSON.stringify(f.view.node(key)!.payload.standoffProperties??[])),...marks]);});}
it('adds grounded semantics without prose and a repeated refresh cannot duplicate definitions, annotations or enrichment',async()=>{
 const f=fixture(),snapshot=vi.spyOn(f.editor.repository,'snapshot'),first=await prepareRefresh(f,semanticXml);expect(first.summary.added).toBeGreaterThan(6);admit(f,first.result);
 const count=Object.keys(f.root.payload.linkedAnnotations??{}).length,second=await prepareRefresh(f,semanticXml);expect(second.summary.added).toBe(0);expect(second.summary.updated).toBe(0);expect(second.summary.skipped).toBeGreaterThan(6);expect(second.result.definitions).toEqual({});expect(second.result.annotations.size).toBe(0);expect(Object.keys(f.root.payload.linkedAnnotations??{})).toHaveLength(count);expect(f.root.children).toHaveLength(1);expect(snapshot).not.toHaveBeenCalled();
});
it('keeps relation direction and distinct source passages while rejecting content and annotations outside the selected Contribution',async()=>{
 const f=fixture(),first=await prepareRefresh(f,semanticXml);admit(f,first.result);
 const reversed=await prepareRefresh(f,b=>semanticXml(b).replace('from="leo" to="ludo"','from="ludo" to="leo"'));expect(reversed.summary.added).toBe(1);
 await expect(prepareRefresh(f,()=>'<response><p>Replacement prose.</p></response>')).rejects.toThrow();
 const other=f.addHuman('Unrelated words');const s=f.open(),r=await f.req(s,other),x=new XmlContext(s,r.exchange);x.request(r);const b=r.structuralContext.sources.find((n:any)=>n.nativeType==='standoff-editor-block');
 const value=x.lower(`<response><definitions><classify target="${x.alias(b.handle)}" quote="Unrelated" kind="claim"/></definitions></response>`,true);
 const result=await prepare(JSON.stringify(value),r.exchange,f.owner,f.editor.visualEffects,s,true,'ai','agent',1,1,true,undefined,true);expect(()=>reconcileSemanticRefresh(result,s,f.id,f.root.payload.linkedAnnotations as any)).toThrow('selected Contribution');
});
it('retains existing assertions when explicitly enriching an Entity and treats an empty refresh as a no-op',async()=>{
 const f=fixture(),first=await prepareRefresh(f,semanticXml);admit(f,first.result);
 const updated=await prepareRefresh(f,(b,x)=>{const entity=Object.values(f.root.payload.linkedAnnotations as any).find((d:any)=>d.metadata?.scopedEntity?.entity.name==='Leonardo') as any;const h=x.sources.issue({kind:'entity',resourceId:f.owner,entity:{scope:'document',resourceId:f.owner,entityId:entity.id}});return `<response><definitions><entity id="leo" ref="${x.alias(h)}" name="Leonardo" type="Person" thumbnail="https://upload.wikimedia.org/portrait.jpg"><description>A conflicting description.</description></entity></definitions></response>`;});
 expect(updated.summary.updated).toBe(1);expect(updated.summary.conflicts).toBe(1);expect((Object.values(updated.result.definitions)[0] as any).metadata.scopedEntity.entity.description).toBe('Italian artist.');admit(f,updated.result);
 const empty=await prepareRefresh(f,()=>'<response><definitions/></response>');expect(empty.summary.added).toBe(0);expect(empty.result.annotations.size).toBe(0);
});
