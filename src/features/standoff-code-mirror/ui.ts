import { Compartment, EditorState, StateEffect } from '@codemirror/state';
import { EditorView, showPanel } from '@codemirror/view';
import { startCompletion, type CompletionContext, type Completion } from '@codemirror/autocomplete';
import { affiliateEditorInput } from '../../runtime/editor-input';
import { entityService } from '../../application/entity-service';
import { scryCommands } from '../autocomplete/commands';
import { Coordinates, propertiesOf } from './model';
import { annotationsAt } from './projection';
import type { StandoffCodeMirror } from './controller';

export const nativeActions=['code.annotate','code.inspect','code.visibility','entity.open','cross.entity','gloss.create','autocomplete.open','menu.open','history.undo','history.redo','entity.list.open','cross.entityList'];
export class CodeAnnotationUI {
  code!:StandoffCodeMirror;
  private panel=new Compartment();private closePanel?:()=>void;
  constructor(private notice:(message:string)=>void){}
  install(code:StandoffCodeMirror){this.code=code;code.view.dispatch({effects:StateEffect.appendConfig.of(this.panel.of([]))});}
  supported=(id:string)=>nativeActions.includes(id)&&(!['entity.open','cross.entity'].includes(id)||this.code.editor.features.entityReferences)&& (id!=='gloss.create'||this.code.editor.features.glossMode);
  run=(id:string):boolean=>{
    if(!this.supported(id))return false;
    try{
      if(id==='entity.list.open'||id==='cross.entityList'){void this.code.editor.commandRegistry.execute(id,{targetKey:this.code.nodeKey,args:undefined});}
      else if(id==='history.undo')this.code.editor.repository.undo();
      else if(id==='history.redo')this.code.editor.repository.redo();
      else if(id==='code.visibility')this.code.toggleAnnotations();
      else if(id==='autocomplete.open')startCompletion(this.code.view);
      else this.open(id==='entity.open'||id==='cross.entity'?'codex/entity-reference':id==='gloss.create'?'mutable/gloss':undefined,id==='code.inspect');
    }catch(e){this.notice(String(e));}return true;
  };
  completion=(context:CompletionContext)=>{
    const line=context.state.doc.lineAt(context.pos),prefix=line.text.slice(0,context.pos-line.from),slash=/^\s*\/([\w -]*)$/.exec(prefix);
    if(!slash&&!context.explicit)return null;
    const from=slash?line.from+prefix.indexOf('/'):context.pos;
    const rows=scryCommands(this.code.editor,this.code.nodeKey,slash?.[1]??'',id=>this.supported(id)||id==='code.standoff.create');
    const options:Completion[]=rows.filter(r=>this.supported(r.id==='entity'?'entity.open':r.id)||['date','code.standoff.create'].includes(r.id)).filter(r=>r.id!=='gloss.create'||!context.state.selection.main.empty).map(row=>({label:row.name,detail:row.reason,type:'keyword',apply:(view)=>{
      try{
        if(view.state.doc!==context.state.doc)throw Error('The command source changed. Invoke it again.');
        if(slash)view.dispatch({changes:{from,to:context.pos,insert:''},selection:{anchor:from}});
        if(row.id==='date'){const d=new Date(),text=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;view.dispatch(view.state.replaceSelection(text));}
        else if(row.id==='code.standoff.create')void this.code.editor.commandRegistry.execute(row.id,{targetKey:this.code.nodeKey,args:undefined});
        else this.run(row.id==='entity'?'entity.open':row.id);
      }catch(e){this.notice(String(e));}
    }}));
    return {from,options,filter:!slash};
  };
  extensions(){return [EditorState.languageData.of(()=>[{autocomplete:this.completion}]),EditorView.domEventHandlers({contextmenu:(event)=>{event.preventDefault();this.open();return true;},click:(event,view)=>{if(!event.altKey)return false;const pos=view.posAtCoords({x:event.clientX,y:event.clientY});if(pos===null)return false;this.open(undefined,true,pos);return true;}})];}
  open(type?:string,inspect=false,at?:number){
    const code=this.code,target=code.target(),doc=code.view.dom.ownerDocument;
    const hits=annotationsAt(code.view,at??target.from,at??target.to);
    this.closePanel?.();const abort=new AbortController();let service:ReturnType<typeof entityService>|undefined,alive=true;
    const box=doc.createElement('section');box.className='cm-mutable-panel';box.setAttribute('aria-label','Code annotations');box.style.cssText='padding:10px;border-top:1px solid #aaa;max-height:320px;overflow:auto';
    const status=doc.createElement('div');status.setAttribute('role','status');
    const controls=doc.createElement('div');box.append(controls,status);
    const button=(label:string,fn:()=>unknown,parent=controls)=>{const b=doc.createElement('button');b.type='button';b.textContent=label;b.onclick=()=>{try{const result=fn();if(result instanceof Promise)void result.catch(e=>{if(alive)status.textContent=String(e);});}catch(e){status.textContent=String(e);}};parent.append(b);return b;};
    const body=doc.createElement('div');box.append(body);
    const field=(label:string,value:string,area=false)=>{const l=doc.createElement('label');l.textContent=label+' ';const input=area?doc.createElement('textarea'):doc.createElement('input');input.setAttribute('aria-label',label);input.value=value;l.append(input);body.append(l);return input;};
    const close=()=>{this.closePanel?.();code.view.focus();};
    const validate=()=>{if(!alive)throw Error('Annotation panel closed.');code.validate(target);};
    button('Close',close);button('New annotation',()=>form());button('Duplicate block',()=>{validate();close();code.editor.commands.copy(code.nodeKey,{kind:'after',anchorKey:code.nodeKey});});button('Delete block',()=>{validate();close();void code.editor.commandRegistry.execute('block.remove',{targetKey:code.nodeKey,args:undefined});});for(const direction of [-1,1])button(direction<0?'Move up':'Move down',()=>{validate();const n=code.editor.node(code.nodeKey)!,parent=code.editor.projections.get(n.viewId)?.parentOf(n.key),siblings=parent?.children??[],index=siblings.indexOf(n.key),neighbor=siblings[index+direction];if(neighbor){close();code.editor.commands.move(n.key,{kind:direction<0?'before':'after',anchorKey:neighbor});}});button('Entity',()=>form('codex/entity-reference'));if(code.editor.features.glossMode)button('Gloss',()=>form('mutable/gloss'));
    const form=(kind='style/highlight',index?:number)=>{
      body.replaceChildren();const raw=index===undefined?undefined:propertiesOf(target.content.payload.standoffProperties)[index],p=raw&&code.resolve(raw);
      const typeInput=field('Annotation type',String(p?.type??kind));
      const datalist=doc.createElement('datalist');datalist.id='code-types-'+crypto.randomUUID();for(const definition of code.editor.visualEffects.definitions()){const o=doc.createElement('option');o.value=definition.type;datalist.append(o);}body.append(datalist);typeInput.setAttribute('list',datalist.id);
      const value=field('Value (JSON)',JSON.stringify(p?.value??''),true),meta=field('Metadata (JSON)',JSON.stringify(p?.metadata??{},null,2),true);
      if(raw){const id=doc.createElement('p');id.textContent=`Property: ${String(raw.id??'(imported without ID)')} · ${raw.start}–${raw.end}`;body.append(id);}
      if((p?.type??kind)==='mutable/gloss')meta.readOnly=true;
      const actions=doc.createElement('div');body.append(actions);
      button('Apply',()=>{
        validate();const v=JSON.parse(value.value),metadata=JSON.parse(meta.value),type=typeInput.value.trim();if(!type)throw Error('Choose an annotation type.');
        if(type==='mutable/gloss'){
          if(typeof v!=='string')throw Error('Gloss value must be text.');
          const coords=new Coordinates(String(target.content.payload.text??''));
          code.editor.gloss.nativeCode(code.nodeKey,target.content.revision,coords.canonical(target.from),coords.canonical(target.to),v,typeof raw?.annotationId==='string'?raw.annotationId:undefined);
        } else if(raw?.annotationId)throw Error('This property uses a shared definition. Edit it through its owning semantic service.');
        else if(index===undefined)code.annotate(target,type,v,metadata);
        else code.edit(target,index,{type,value:v,metadata});
        close();
      },actions);
      if(index!==undefined)button('Delete annotation',()=>{validate();code.edit(target,index,{isDeleted:true});close();},actions);
      if((p?.type??kind)==='codex/entity-reference'){
        service??=entityService(code.editor,code.nodeKey);
        const query=field('Find Entity','');const results=doc.createElement('div');body.append(results);let epoch=0;
        button('Search Entities',async()=>{validate();const ticket=++epoch;const result=await service!.search({query:query.value,stream:'all',match:'partial',scope:'vault'},abort.signal);if(!alive||ticket!==epoch)return;validate();result.current();results.replaceChildren();for(const entity of result.candidates)button(entity.name,()=>{validate();result.current();value.value=JSON.stringify(entity.id);meta.value=JSON.stringify({entityName:entity.name});},results);},actions);
        button('Inspect Entity',async()=>{validate();const id=JSON.parse(value.value);if(typeof id!=='string'||!id)throw Error('Select an Entity first.');const entity=await service!.get(id,abort.signal);if(!alive)return;validate();status.textContent=entity?`${entity.name} — ${entity.description??''} (${entity.id})`:'Entity unavailable in this Vault.';},actions);
        button('Open Entity',async()=>{validate();const id=JSON.parse(value.value);if(typeof id!=='string'||!id)throw Error('Select an Entity first.');await code.editor.commandRegistry.execute('cardex.entity.open',{targetKey:code.nodeKey,args:{id}});},actions);
      }
    };
    if(hits.length){const list=doc.createElement('div');box.insertBefore(list,body);for(const hit of hits)button(`${String(hit.property.type)} · ${hit.identity}`,()=>form(String(hit.property.type),hit.index),list);}
    if(type)form(type);else if(inspect&&hits.length)form(String(hits[0].property.type),hits[0].index);else form();
    let release=()=>{};
    this.closePanel=()=>{if(!alive)return;alive=false;abort.abort();service?.dispose();release();this.closePanel=undefined;code.view.dispatch({effects:this.panel.reconfigure([])});};
    code.view.dispatch({effects:this.panel.reconfigure(showPanel.of(()=>({dom:box,top:false})))});
    release=affiliateEditorInput(code.input.handle,box);box.querySelector<HTMLInputElement>('input')?.focus();
  }
  dispose(){this.closePanel?.();}
}