import {validQuill,type QuillComposition,type QuillPath} from './model';
/** A gesture draft is presentation state only. The native command is the only
 * commit/history boundary. A changed canonical composition invalidates the draft. */
export class GeometrySession {
 private original?:string;
 draft?:QuillComposition;
 constructor(private read:()=>QuillComposition,private write:(value:QuillComposition)=>void){}
 begin(){this.original=JSON.stringify(this.read());this.draft=JSON.parse(this.original);}
 update(id:string,change:Partial<QuillPath>){if(!this.draft)this.begin();const next={...this.draft!,paths:this.draft!.paths.map(p=>p.id===id?{...p,...change}:p)};if(!validQuill(next))throw Error('Path parameters are outside supported bounds.');this.draft=next;return next;}
 replace(next:QuillComposition){if(!this.draft)this.begin();if(!validQuill(next))throw Error('Invalid composition geometry.');return this.draft=next;}
 commit(){const next=this.draft,original=this.original;this.cancel();if(!next)return;if(JSON.stringify(this.read())!==original)throw Error('Geometry changed elsewhere. The preview was cancelled.');if(JSON.stringify(next)!==original)this.write(JSON.parse(JSON.stringify(next)));}
 cancel(){this.original=undefined;this.draft=undefined;}
}
export function linkedWaves(c:QuillComposition,count=3,role=c.sources[0].role):QuillComposition {
 const flow=c.flows.find(f=>f.sourceRole===role)!,first=c.paths.find(p=>p.id===flow.pathIds[0])!,spacing=c.pathSpacing??76,otherIds=new Set(c.flows.filter(f=>f!==flow).flatMap(f=>f.pathIds));
 const kept=c.paths.filter(p=>otherIds.has(p.id)),prefix=c.sources.length===1?'wave':role+'-wave';
 const paths=Array.from({length:count},(_,i)=>{let id=`${prefix}-${i+1}`;while(kept.some(p=>p.id===id))id+='x';return {id,kind:'sine' as const,x:first.x,y:(c.sources.length===1?50:first.y)+i*spacing,width:first.width,amplitude:20,cycles:1,phase:0};});
 return {...c,pathSpacing:spacing,viewport:{...c.viewport,height:Math.max(c.viewport.height,paths.at(-1)!.y+60)},paths:[...kept,...paths],flows:c.flows.map(f=>f===flow?{...f,pathIds:paths.map(p=>p.id)}:f)};
}
