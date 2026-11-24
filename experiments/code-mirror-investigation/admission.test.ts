// Investigation of existing repository behavior, not a CodeMirror integration.
import {describe,it,expect,vi} from 'vitest';
import {CanonicalRepository} from '../../src/block-tree/repository';
import {decodeDocument,encodeDocument} from '../../src/block-tree/codecs';

describe.each(['code-mirror-block','standoff-code-mirror-block'])('canonical payload admission: %s',type=>{
  it.each([0,2000])('updates, undoes and redoes with %i unrelated blocks',count=>{
    const repository=new CanonicalRepository(decodeDocument({id:'root',type:'document-block',children:[
      {id:'code',type,text:'abc',standoffProperties:[{id:'p',type:'codex/entity-reference',start:0,end:1,value:'entity'}]},
      ...Array.from({length:count},(_,i)=>({id:'unrelated-'+i,type:'plain-text-block',text:'other'})),
    ]}).state);
    const state=repository.readState(), content=Object.values(state.contents).find(c=>c.payload.id==='code')!;
    const snapshot=vi.spyOn(repository,'snapshot');
    let unrelatedReads=0;
    // A full planner/validator that reads other content payloads trips this.
    for(const c of Object.values(state.contents)) if(String(c.payload.id).startsWith('unrelated-')){
      const payload=c.payload;
      Object.defineProperty(c,'payload',{configurable:true,enumerable:true,get(){unrelatedReads++;return payload;}});
    }
    const events:any[]=[];repository.subscribeChanges(change=>events.push(change));
    repository.commit('Probe code edit',[{kind:'put-content',record:{...content,payload:{...content.payload,text:'xabc',standoffProperties:[{id:'p',type:'codex/entity-reference',start:1,end:2,value:'entity'}]}}}],true,{requireBounded:true});
    repository.undo();repository.redo();
    expect(snapshot).not.toHaveBeenCalled();expect(unrelatedReads).toBe(0);
    expect(events).toHaveLength(3);
    expect(events.every(c=>c.previousContents.size===1&&!!c.structural)).toBe(true);
    expect(repository.readState().contents[content.key].payload.text).toBe('xabc');
    // Serialization is deliberate, after bounded-work measurements.
    const wire=encodeDocument(repository.readState());
    expect(wire.children?.[0]).toMatchObject({type,text:'xabc',standoffProperties:[{id:'p',start:1,end:2}]});
  });
});
