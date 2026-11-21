// @vitest-environment jsdom
import {expect,it,vi} from 'vitest';
import {VisualEffectRegistry} from '../../../runtime/visual-effect-registry';
import {markup,registerDcpTypes,INERT,legend,type Provenance} from './markup';
import {prepare,receive} from './exchange';
const provenance:Provenance={version:1,actor:'mock',protocol:'dcp/1.0',exchangeId:'exchange',sourceResourceId:'doc'};
function fixture(){const r=new VisualEffectRegistry();registerDcpTypes(r);return r;}
const claim=()=>{const seen=new Set<string>();return(id:string)=>{if(seen.has(id))throw Error('duplicate');seen.add(id);};};
export const response=()=>({protocol:'dcp/1.0',kind:'contribution',exchange:'exchange',intent:'ask',replyTargets:[],composition:[{id:'p',kind:'paragraph',markup:'Hello',ranges:[]}],anchors:[],entities:[],interpretations:[],arguments:[],glosses:[],relations:[],suggestions:[],promotionRecommendations:[]});
it('preserves exact decoded Unicode/whitespace and nested native Cell ranges',()=>{
 const parsed=markup('A<annotation type="style/bold" id="outer">😀<annotation type="dialectic/claim">é</annotation></annotation>\r\n&lt;&amp;',[],fixture(),provenance,claim());
 expect(parsed.text).toBe('A😀é\r\n<&');expect(parsed.anchors.get('outer')).toEqual({start:1,end:4});expect(parsed.marks.map(p=>[p.type,p.start,p.end])).toEqual([['dialectic/claim',2,3],['style/bold',1,3]]);
 expect(parsed.marks[0].metadata.dcp).toEqual(provenance);
});
it('maps aliases through SAX to identical native marks, Cell ranges and passage aliases',()=>{
 const old='A<annotation type="style/bold" id="outer">😀<annotation type="style/italics">é</annotation><annotation type="dialectic/claim">!</annotation></annotation>\r\n&lt;b&gt;&amp;';
 const short='A<b id="outer">😀<i>é</i><annotation type="dialectic/claim">!</annotation></b>\r\n&lt;b&gt;&amp;';
 const project=(text:string)=>{const p=markup(text,[],fixture(),provenance,claim());return {...p,marks:p.marks.map(({id,...mark})=>mark)}};
 expect(project(short)).toEqual(project(old));
 const crossed=markup('<b>A<boundary id="from"/>B</b>C<boundary id="to"/>',[{id:'range',type:'style/italics',from:'from',to:'to',ref:null,attributes:[]}],fixture(),provenance,claim());
 expect(crossed.marks.map(m=>[m.type,m.start,m.end])).toEqual([['style/bold',0,1],['style/italics',1,2]]);
});
it.each(['<b type="style/italics">x</b>','<b ref="new:e1">x</b>','<i onclick="x">x</i>','<e>x</e>','<e ref="">x</e>','<e ref="new:e1" type="style/bold">x</e>','<b><i>x</b></i>','<b/>','<constructor>x</constructor>','<b id="same">x</b><i id="same">y</i>'])('rejects malformed alias markup %s',text=>{
 expect(()=>markup(text,[],fixture(),provenance,claim())).toThrow();
});
it('represents crossing ranges through explicit boundaries',()=>{
 const parsed=markup('<boundary id="a"/>AB<boundary id="b"/>CD<boundary id="c"/>EF<boundary id="d"/>',[
 {id:'one',type:'style/bold',from:'a',to:'c',ref:null,attributes:[]},{id:'two',type:'style/italics',from:'b',to:'d',ref:null,attributes:[]}],fixture(),provenance,claim());
 expect(parsed.text).toBe('ABCDEF');expect(parsed.marks.map(p=>[p.start,p.end])).toEqual([[0,3],[2,5]]);
});
it('preserves unknown semantics inertly and derives the legend from registrations',()=>{
 const r=fixture(),stop=r.registerType({type:'unsafe',renderers:[]});
 expect(()=>markup('<annotation type="unsafe">x</annotation>',[],r,provenance,claim())).toThrow('not AI-authorable');
 const parsed=markup('<annotation type="future/idea" meaning="literal">x</annotation>',[],r,provenance,claim());
 expect(parsed.marks[0]).toMatchObject({type:INERT,metadata:{unknownSemantic:{type:'future/idea',attributes:{meaning:'literal'}}}});
 expect(legend(r).map(t=>t.type)).toContain('dialectic/claim');expect(legend(r).map(t=>t.type)).not.toContain('unsafe');stop();
});
it.each(['<!DOCTYPE a><annotation type="style/bold">x</annotation>','<script>x</script>','<annotation type="style/bold" onclick="x">text</annotation>','<annotation type="style/bold"></annotation>','<annotation type="dialectic/argument">x</annotation>','<annotation type="style/bold">x','\uD800','<annotation type="style/bold" id="a">x</annotation><boundary id="a"/>'])( 'rejects unsafe/malformed markup %s',text=>{expect(()=>markup(text,[],fixture(),provenance,claim())).toThrow();});
it('rejects Stage 4B declarations and unsupported construction without native work',async()=>{
 const r=fixture();for(const field of ['arguments','relations','glosses','entities']){const value=response() as any;value[field]=[{id:'x'}];await expect(prepare(JSON.stringify(value),'exchange','doc',r,{} as any)).rejects.toThrow('Stage 4B');}
 const value=response();value.composition[0].kind='script';await expect(prepare(JSON.stringify(value),'exchange','doc',r,{} as any)).rejects.toThrow('Unsupported DCP Block');
});

it('times out an unresponsive transport without waiting for it to cooperate',async()=>{
 vi.useFakeTimers();try{const abort=new AbortController(),pending=receive(async()=>new Promise<string>(()=>{}),{},{} as any,()=>{},abort);const rejected=expect(pending).rejects.toThrow('timed out');await vi.advanceTimersByTimeAsync(30000);await rejected;expect(abort.signal.aborted).toBe(true);}finally{vi.useRealTimers();}
});
