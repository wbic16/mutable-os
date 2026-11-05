import {createMemo,createSignal,For,Index,onCleanup,onMount,Show} from 'solid-js';
import {cellStyle,type TextualGrid} from './grid';
import {menuLabel,menuSize,placeMenu,type TextualMenuItem} from './menu-layout';
/** Textual presentation only: the supplied actions remain the command owners. */
export function TextualCommandMenu(props:{items:TextualMenuItem[];grid:TextualGrid;anchor:HTMLElement;label?:string;close():void;execute(action:()=>unknown):void}){
 const [levels,setLevels]=createSignal([{items:props.items,active:props.items.findIndex(i=>!i.disabled),parentRow:0}]);
 const [form,setForm]=createSignal<TextualMenuItem>(),[value,setValue]=createSignal(''),[error,setError]=createSignal('');
 let root!:HTMLDivElement;
 const focus=(depth:number)=>queueMicrotask(()=>{const item=root.querySelector<HTMLElement>(form()?'input':`[data-menu-depth="${depth}"] [data-active=true]`)??root.querySelector<HTMLElement>(`[data-menu-depth="${depth}"]`);item?.focus({preventScroll:true});item?.scrollIntoView?.({block:'nearest',inline:'nearest'});});
 const back=(depth:number)=>{if(form()){setForm(undefined);setError('');focus(depth);}else if(depth){setLevels(p=>p.slice(0,depth));focus(depth-1);}else props.close();};
 const select=(depth:number,index:number)=>setLevels(p=>p.slice(0,depth+1).map((level,n)=>n===depth?{...level,active:index}:level));
 const activate=(depth:number,index:number,onlyChildren=false)=>{
  const item=levels()[depth].items[index];if(!item||item.disabled)return;setError('');
  try{const children=item.loadChildren?.()??item.children;if(children){setLevels(p=>[...p.slice(0,depth+1),{items:children,active:children.findIndex(i=>!i.disabled),parentRow:index}]);focus(depth+1);return;}
   if(onlyChildren)return;
   if(item.input){setForm(item);setValue(item.input.value??'');focus(depth);return;}
   if(item.run)props.execute(item.run);
  }catch(e){setError(String(e));}
 };
 const anchorPosition=createMemo(()=>{
  const grid=props.grid,scope=props.anchor.closest('.textual-workspace')!.getBoundingClientRect(),anchor=props.anchor.getBoundingClientRect();
  return {col:Math.round((anchor.left-scope.left)/grid.cellWidthPx),row:Math.round((anchor.bottom-scope.top)/grid.cellHeightPx)};
 });
 const positions=createMemo(()=>{
  const grid=props.grid,anchor=anchorPosition();
  const result:ReturnType<typeof placeMenu>[]=[];
  for(const [depth,level]of levels().entries()){
   const showingForm=form()&&depth===levels().length-1;
   const size=menuSize(level.items),parent=result[depth-1],previous=levels()[depth-1];
   const parentRow=level.parentRow+(previous?.items.slice(0,level.parentRow+1).filter((i,n)=>n>0&&i.separatorBefore).length??0);
   result.push(placeMenu(grid.columns,grid.rows,showingForm?Math.max(size.columns,36):size.columns,showingForm?7:size.rows,anchor.col,parent?parent.row+parentRow:anchor.row,parent&&{col:parent.col,width:parent.width}));
  }return result;
 });
 onMount(()=>{focus(0);const outside=(e:PointerEvent)=>{if(!root.contains(e.target as Node)&&!props.anchor.contains(e.target as Node))props.close();};document.addEventListener('pointerdown',outside,true);onCleanup(()=>document.removeEventListener('pointerdown',outside,true));});
 const border=(width:number,left:string,right:string)=><div class="tw-menu-border" aria-hidden="true"><span>{left}</span><For each={Array.from({length:width-2})}>{()=> <span>─</span>}</For><span>{right}</span></div>;
 return <div ref={root} class="tw-menu-stack" onKeyDown={e=>{
  if(e.isComposing)return;
  const depth=Number((e.target as Element).closest('[data-menu-depth]')?.getAttribute('data-menu-depth')??levels().length-1),level=levels()[depth];
  if(e.key==='Escape'||(!form()&&e.key==='ArrowLeft')){e.preventDefault();e.stopPropagation();back(depth);return;}
  if(form())return;
  if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){
   e.preventDefault();e.stopPropagation();const enabled=level.items.map((i,n)=>i.disabled?-1:n).filter(n=>n>=0),at=enabled.indexOf(level.active);
   const next=e.key==='Home'?enabled[0]:e.key==='End'?enabled.at(-1):enabled[(at+(e.key==='ArrowDown'?1:-1)+enabled.length)%enabled.length];
   if(next!==undefined){select(depth,next);focus(depth);}return;
  }
  if(e.key==='ArrowRight'){e.preventDefault();e.stopPropagation();activate(depth,level.active,true);}
  if(e.key==='Tab'){e.preventDefault();props.close();}
 }}><Index each={levels()}>{(entry,levelIndex)=>{
  const depth=()=>levelIndex,level={get items(){return entry().items;},get active(){return entry().active;}};
  const position=()=>positions()[depth()],size=()=>menuSize(level.items);
  return <div class="tw-command-menu tw-popup" data-menu-depth={depth()} tabIndex={-1} role={form()&&depth()===levels().length-1?'dialog':'menu'} aria-label={props.label??'Commands'} style={{...cellStyle(props.grid,{col:position().col,row:position().row,widthCells:position().width,heightCells:position().height}),'z-index':20+depth()}}>
   {border(position().width,'┌','┐')}
   <Show when={form()&&depth()===levels().length-1} fallback={<div class="tw-menu-rows" style={{height:`${(position().height-2)*props.grid.cellHeightPx}px`}}><For each={level.items}>{(item,index)=><>
    <Show when={index()>0&&item.separatorBefore}>{border(position().width,'├','┤')}</Show>
    <div class="tw-menu-row"><span aria-hidden="true">│</span><button role="menuitem" disabled={item.disabled} title={item.reason??item.label} aria-label={`${menuLabel(item).label}${menuLabel(item).shortcut?`, ${menuLabel(item).shortcut}`:''}`} data-active={level.active===index()} tabIndex={level.active===index()?0:-1} aria-haspopup={item.children||item.loadChildren?'menu':undefined} aria-expanded={item.children||item.loadChildren?levels().length>depth()+1&&level.active===index():undefined}
     onPointerDown={e=>e.preventDefault()} onPointerEnter={()=>{if(!item.disabled&&level.active!==index()){select(depth(),index());focus(depth());}}} onClick={()=>activate(depth(),index())}
     style={{'grid-template-columns':`minmax(0,1fr) ${(size().shortcut?size().shortcut+2:0)*props.grid.cellWidthPx}px ${size().arrow*props.grid.cellWidthPx}px`}}><span class="tw-menu-label">{menuLabel(item).label}</span><span class="tw-menu-shortcut">{menuLabel(item).shortcut}</span><span class="tw-menu-arrow">{item.children||item.loadChildren?'►':''}</span></button><span aria-hidden="true">│</span></div>
   </>}</For></div>}>
    <form class="tw-menu-input" onSubmit={e=>{e.preventDefault();if(!value().trim()){setError('Enter a value first.');return;}props.execute(()=>form()!.input!.submit(value().trim()));}}><label>{form()!.input!.label}<input value={value()} onInput={e=>setValue(e.currentTarget.value)}/></label><button type="submit">Apply</button><button type="button" onClick={()=>back(depth())}>Back</button></form>
   </Show>
   {border(position().width,'└','┘')}
  </div>;
 }}</Index><Show when={error()}><div class="tw-menu-error" role="alert">{error()} <button onClick={()=>setError('')}>Dismiss</button></div></Show></div>;
}
