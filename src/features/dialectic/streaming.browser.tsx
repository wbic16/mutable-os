import {render} from 'solid-js/web';
import {WorkspaceSession} from '../../application/workspace-session';
import {WorkspacePresentationView} from '../../application/workspace-presentation-view';
import {materializeLocalWorkspace} from '../../reactive-editor/workspace-manifest';
import {documentApplicationPorts} from '../../application/document-application-ports';
import {DialecticProviderSession} from './dcp/live';
import {captureNative,nativeBytes,decodeNative} from '../../persistence/native-resource';
import '../../index.css';
import '../../demo/workspace-demo.css';

const wait=async(check:()=>boolean)=>{for(let i=0;i<800;i++){if(check())return;await new Promise(r=>setTimeout(r,10));}throw Error('Browser qualification timeout');};
const paint=()=>new Promise<void>(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>r())));
const check=(value:unknown,message:string)=>{if(!value)throw Error(message);};
const pause=()=>new Promise<void>(resolve=>(window as any).proof.release=resolve);
const proof:any={events:[],snapshots:0,commits:0,scans:0,openGroups:0,mode:'complete',phase:0};(window as any).proof=proof;
const mark=(kind:string)=>proof.events.push({kind,at:performance.now()});
const chunks=[
 '<synopsis>Comprehensibility and Computing Capability</synopsis><p id="first"><span id="opening"><e ref="concept">Comprehensibility</e> makes a machine open to investigation. <b>Capability</b> alone does not establish <i>understanding</i>.</span></p>',
 '<entity id="concept" name="Comprehensibility" type="Concept"/><gloss target="opening" kind="scope">Understanding is relative to a person and a purpose.</gloss><argument id="argument1" target="opening"/>',
 '<synopsis>Capability Does Not Guarantee Understanding</synopsis><synopsis target="invalid">Ignored title</synopsis><p id="conclusion"><mark kind="claim" id="claim">A better explanation preserves the limits of its evidence.</mark></p><argument id="argument2" target="claim"/><relation kind="argument" type="qualifies" from="argument2" to="argument1"/>',
];
DialecticProviderSession.prototype.configure=async function(settings){this.settings=settings;this.ready=true;return true;};
DialecticProviderSession.prototype.transport=function(){return {
 details:{version:1,adapterVersion:'4c-1',settings:this.settings,attempts:[],cost:{status:'unknown'}},commit:async()=>{},cancel:async()=>{},
 run:async(_request,_sources,chunk,signal,validate)=>{
  await new Promise(r=>setTimeout(r,150));
  mark('provider-first-text');chunk('','start');let raw='';
  for(let i=0;i<chunks.length;i++){
   const part=proof.mode==='wrapped'?(i===0?'<response>':'')+chunks[i]+(i===chunks.length-1?'</response>':''):chunks[i];
   // Deliberately split tags, attributes, escapes and semantic definitions.
   for(let j=0;j<part.length;j+=7){if(signal.aborted)throw Error('Cancelled');raw+=part.slice(j,j+7);chunk(raw,'text');}
   mark('fragment-'+i);proof.phase=i+1;await pause();if(signal.aborted)throw Error('Cancelled');
   if(proof.mode==='complete'&&i===0){chunk(raw,'continue');raw='';}
   if(proof.mode==='invalid'){raw+='<p>unfinished';chunk(raw,'text');break;}
   if(proof.mode==='repair'&&i===0){
    chunk('Repairing','status');chunk('','start');raw='<p>Corrected response.</p>';chunk(raw,'text');await paint();break;
   }
  }
  mark('provider-complete');await validate?.(raw);mark('validation-complete');return raw;
 }
}};
const session=new WorkspaceSession(materializeLocalWorkspace({type:'workspace-block',children:[]}),{features:{dialecticAutosave:false,dialecticAutomaticTitles:false,dcpTestPhaseLogging:false,nativeKnowledge:false,sqliteKnowledge:false,flintProbe:false}}),editor=session.editor;
const host=document.body.appendChild(document.createElement('div'));host.className='workspace-demo';render(()=><WorkspacePresentationView session={session}/>,host);editor.installGateway(document);
await editor.commandRegistry.execute('dialectic.open',{targetKey:session.projection.state.rootKey,args:undefined});
const port=documentApplicationPorts(editor).ports().find(p=>p.applicationId==='dialectic')!;
const root=()=>port.session()!.projection.node(port.session()!.rootKey)!;
const rows=()=>root().children.map(k=>port.session()!.projection.node(k)!).filter(n=>(n.payload.metadata as any)?.dialectic);
const committed=()=>rows().filter(n=>(n.payload.metadata as any).dialectic.state==='committed');
const draft=()=>rows().find(n=>(n.payload.metadata as any).dialectic.state==='draft')!;
const text=()=>port.session()!.projection.node(draft().children[0])!;
const button=(label:string)=>host.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)!;
const streaming=()=>host.querySelector<HTMLElement>('.dialectic-stream:not([hidden])');
const viewport=()=>host.querySelector<HTMLElement>('.dialectic-canvas')!;
// Retained conversation runtimes allow unrelated history while the response group is open.
const originalGroup=editor.repository.beginUndoGroup.bind(editor.repository);editor.repository.beginUndoGroup=(...args)=>{const group=originalGroup(...args);if(args[0]==='AI contribution'){proof.openGroups++;const finish=group.finish;let closed=false;group.finish=()=>{if(!closed){closed=true;proof.openGroups--;}finish();};}return group;};
const originalSnapshot=editor.repository.snapshot.bind(editor.repository);editor.repository.snapshot=(...args)=>{proof.snapshots++;return originalSnapshot(...args);};
editor.repository.subscribeChanges(()=>proof.commits++);
const objectValues=Object.values;Object.values=((value:any)=>{if(value===editor.repository.state.contents||value===editor.repository.state.placements)proof.scans++;return objectValues(value);}) as typeof Object.values;
Object.assign(proof,{editor,session,port,rows,committed,draft,text,streaming,viewport,mark});

proof.run=async()=>{
 await wait(()=>!!button('Submit contribution'));
 const receiving=()=>rows().find(n=>(n.payload.metadata as any).dialectic.state==='receiving');
 const begin=async()=>{proof.phase=0;proof.events=[];editor.commands.replaceInlineRange(text().key,0,text().inlineContent.length,'Please discuss comprehensibility and capability in depth.');mark('submit');button('Submit contribution').click();await wait(()=>!!receiving()?.children.length);await paint();};
 await begin();mark('first-native-display');
 check((receiving()!.payload.metadata as any).dialectic.synopsis.text==='Comprehensibility and Computing Capability','early synopsis stored on receiving contribution');
 button('Expand Contributions').click();await paint();check(host.querySelector('.dialectic-contribution-list')!.textContent!.includes('Comprehensibility and Computing Capability'),'receiving entry updates immediately');
 const first=receiving()!,firstKey=first.children[0],mount=editor.mounts.get(firstKey)!.root,firstId=port.session()!.projection.node(firstKey)!.payload.id;
 check(mount.textContent!.includes('Comprehensibility'),'first actual native Block is readable');check(mount.querySelector('[contenteditable=true]')===null,'receiving content is read-only');check(proof.openGroups===1,'native response Undo group remains open');
 proof.providerRelease=proof.release;proof.firstScreenshot=true;await new Promise<void>(resolve=>proof.continueScreenshot=resolve);
 const snapshots=proof.snapshots,scans=proof.scans;
 editor.commands.replaceInlineRange(text().key,0,0,'Draft typing retained.');
 proof.providerRelease();await wait(()=>proof.phase===2);await wait(()=>!!mount.querySelector('.dialectic-entity-mention'));await paint();
 check(port.session()!.projection.node(firstKey)!.payload.standoffProperties instanceof Array,'native standoff properties');
 check((port.session()!.projection.node(firstKey)!.payload.standoffProperties as any[]).some(p=>p.type==='mutable/gloss'),'Gloss added to same native Block');
 proof.release();await wait(()=>proof.phase===3);await wait(()=>receiving()!.children.length===2);await paint();
 check(editor.mounts.get(firstKey)!.root===mount,'late Blocks do not remount earlier Blocks');
 proof.release();await wait(()=>!receiving());await wait(()=>!!button('Submit contribution'));await paint();mark('final-native-display');
 const complete=committed().at(-1)!;check(proof.openGroups===0,'completion closes the response Undo group');check((complete.payload.metadata as any).dialectic.synopsis.text==='Capability Does Not Guarantee Understanding','last valid synopsis wins');check(complete.children[0]===firstKey&&editor.mounts.get(firstKey)!.root===mount,'final commit preserves exact native mount and identity');check(complete.children.length===2,'no duplicate Blocks');
 check(proof.snapshots===snapshots&&proof.scans===scans,'no full snapshots or full repository map enumerations during native streaming');
 const owner=String(root().payload.id),saved=captureNative(editor.repository.readState(),owner);check(new TextDecoder().decode(nativeBytes(decodeNative(nativeBytes(saved))))===new TextDecoder().decode(nativeBytes(saved)),'native persistence round trip');
 const count=committed().length;editor.repository.undo();check(committed().length===count-1,'one Undo removes whole response');check(String(text().payload.text).includes('Draft typing retained')||text().inlineContent.length>0,'interleaved draft typing remains');editor.repository.redo();check(committed().length===count,'one Redo restores whole response');
 proof.completeEvents=[...proof.events];
 await begin();const interrupted=receiving()!,interruptedKey=interrupted.children[0];button('Cancel response').click();await wait(()=>!receiving());await paint();
 check((port.session()!.projection.node(interrupted.key)!.payload.metadata as any).dialectic.synopsis.text==='Comprehensibility and Computing Capability','synopsis survives cancellation');check(!!editor.mounts.get(interruptedKey),'cancel retains completed native Block');check((port.session()!.projection.node(interrupted.key)!.payload.metadata as any).dialectic.notices?.length,'interruption is recorded');const afterCancel=committed().length;editor.repository.undo();check(committed().length===afterCancel-1,'cancelled response is one Undoable operation');proof.release();
 proof.result={passed:true,earlySynopsis:true,lastValidSynopsis:true,cancelledSynopsis:true,events:proof.completeEvents,firstNativeBlockId:firstId,sameNativeMountThroughCompletion:true,toolContinuationRetainsNativeBlock:true,lateNativeEntityAndGloss:true,oneUndoAndRedo:true,interleavedTyping:true,cancellationRetainsNativeBlock:true,cancellationOneUndo:true,persistence:true,streamingWork:{snapshots:proof.snapshots-snapshots,fullMapScans:proof.scans-scans}};
 return proof.result;
};
proof.ready=true;
