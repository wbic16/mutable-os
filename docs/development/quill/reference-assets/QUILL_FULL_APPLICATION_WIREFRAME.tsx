/**
 * QUILL — full application layout, JSX-style SolidJS wireframe
 * DESIGN REFERENCE, NOT DROP-IN PRODUCTION CODE.
 * Purpose: specify all regions, tabs, tools, controls, and command intent for Astra.
 * The production host must connect to existing Mutable services, not duplicate them.
 */
import { createMemo, createSignal, For, Show, Switch, Match } from 'solid-js';

type Tool = 'select'|'text'|'path'|'shape'|'frame'|'ornament'|'annotation'|'points'|'transform'|'arrange'|'hand'|'zoom';
type InspectorTab = 'text'|'path'|'layout'|'effects'|'semantics';
type DockTab = 'layers'|'ornaments'|'path-presets'|'effect-presets'|'assets';
type Appearance = 'midnight'|'parchment'|'mutable';
type WorkspaceView = 'page'|'composition';
type Selection = { kind:'none'|'text'|'path'|'shape'|'layer'|'composition'|'block'; id?:string; sourceId?:string; range?:[number,number] };

type QuillPorts = {
  // Bind each action to existing native document, selection, Block, history,
  // clipboard, persistence, window/instrument, and asset services.
  openInk():void; newInk():void; saveActiveInk():void;
  returnToOrigin():void; closeOrCancel():void;
  undo():void; redo():void;
  selectBlock(id:string):void; openBlockInQuill(id:string):void;
  convertTextBlockToQuill(id:string):void; unwrapQuillToText(id:string):void;
  copySelection():void; pasteNativeFragment():void;
  createComposition():void; addNativeBlock(kind:string):void;
  addTextSource():void; addPath(kind:string):void;
  addLinkedPath():void; setPathParameter(key:string,value:number):void;
  beginPathGesture(id:string):void; previewPathGesture(p:unknown):void;
  commitPathGesture():void; cancelPathGesture():void;
  setTextStyle(key:string,value:unknown):void;
  setFlowProperty(key:string,value:unknown):void;
  addEffect(kind:string):void; setEffectParameter(id:string,key:string,value:unknown):void;
  reorderEffect(id:string,direction:number):void; toggleEffect(id:string):void;
  addOrnament(assetId:string):void; addBackground(assetId:string):void;
  toggleLayer(id:string,field:'visible'|'locked'):void;
  reorderLayer(id:string,direction:number):void;
  annotate(kind:'entity'|'gloss'|'format'|'comment'):void;
  exportPublication(kind:'svg'|'png'|'pdf'):void;
  setAppearance(value:Appearance):void; setCanvasSurround(value:'neutral'|'dark'|'light'):void;
};

const TOOLS: {id:Tool; label:string; flyout?:string[]}[] = [
  {id:'select',label:'Select'},
  {id:'text',label:'Text',flyout:['Text on path','New text source','Text frame']},
  {id:'path',label:'Path',flyout:['Line','Arc','Circle','Ellipse','Sine','Rectangle','Polygon','Spiral','Bézier','Freehand']},
  {id:'shape',label:'Shape',flyout:['Rectangle','Ellipse','Polygon','Star']},
  {id:'frame',label:'Frame',flyout:['Text region','Artboard','Image frame']},
  {id:'ornament',label:'Ornament'},
  {id:'annotation',label:'Annotation',flyout:['Entity','Gloss','Comment','Format']},
  {id:'points',label:'Edit points'},
  {id:'transform',label:'Transform'},
  {id:'arrange',label:'Arrange'},
  {id:'hand',label:'Hand'},
  {id:'zoom',label:'Zoom'}
];

export function QuillApplicationWireframe(props:{ ports:QuillPorts }) {
  const [appearance,setAppearance] = createSignal<Appearance>('midnight');
  const [workspaceView,setWorkspaceView] = createSignal<WorkspaceView>('composition');
  const [tool,setTool] = createSignal<Tool>('text');
  const [inspector,setInspector] = createSignal<InspectorTab>('text');
  const [dock,setDock] = createSignal<DockTab>('layers');
  const [selected,setSelected] = createSignal<Selection>({kind:'text',id:'poem-body',sourceId:'body',range:[0,35]});
  const [showNavigator,setShowNavigator] = createSignal(true);
  const [showDock,setShowDock] = createSignal(true);
  const [zoom,setZoom] = createSignal(100);
  const selectionDescription = createMemo(() => selected().kind === 'none' ? 'Nothing selected' : `${selected().kind} selected`);
  function chooseAppearance(value:Appearance){setAppearance(value);props.ports.setAppearance(value); /* UI preference only; never dirty Ink */}
  function chooseTool(id:Tool){setTool(id); if(id==='path')setInspector('path'); if(id==='annotation')setInspector('semantics');}

  return <div class={`quill-app quill-theme-${appearance()}`}>
    {/* APP MENU / GLOBAL WORKSPACE CHROME — no document artwork in this region */}
    <header class="quill-titlebar">
      <div class="brand"><span class="quill-q-logo" aria-label="Quill logo">Q</span><strong>Quill</strong><small>Mutable OS</small></div>
      <nav aria-label="Application">
        <button onClick={props.ports.newInk}>New Ink</button>
        <button onClick={props.ports.openInk}>Open</button>
        <button onClick={props.ports.saveActiveInk}>Save</button>
        <button onClick={props.ports.undo}>Undo</button>
        <button onClick={props.ports.redo}>Redo</button>
        <select value={appearance()} onChange={e=>chooseAppearance(e.currentTarget.value as Appearance)} aria-label="Quill appearance">
          <option value="midnight">Midnight</option><option value="parchment">Parchment</option><option value="mutable">Follow Mutable</option>
        </select>
        <button onClick={()=>props.ports.exportPublication('svg')}>Export SVG</button>
        <button onClick={props.ports.returnToOrigin}>Return to editor</button>
      </nav>
    </header>
    <div class="document-tabs" role="tablist" aria-label="Open Ink documents">
      <button role="tab" aria-selected="true">The Raven.ink ●</button>
      <button role="tab">Notes.ink</button><button onClick={props.ports.newInk}>＋</button>
      <span class="save-status">Unsaved changes · Native Ink document</span>
    </div>
    <div class="quill-body">
      {/* DOCUMENT NAVIGATOR — mixed native Block tree, not a Quill-only document tree */}
      <Show when={showNavigator()}>
        <aside class="document-navigator" aria-label="Document navigator">
          <header><strong>Document</strong><button onClick={()=>setShowNavigator(false)}>Collapse</button></header>
          <div class="navigator-mode"><button onClick={()=>setWorkspaceView('page')}>Pages</button><button onClick={()=>setWorkspaceView('composition')}>Compositions</button></div>
          <ul class="native-block-tree">
            <li><button onClick={()=>props.ports.selectBlock('page-1')}>▤ Page 1</button>
              <ul>
                <li><button onClick={()=>props.ports.selectBlock('heading')}>T Heading: The Raven</button></li>
                <li><button onClick={()=>props.ports.openBlockInQuill('composition-1')}>◈ SVG composition: opening stanza</button></li>
                <li><button onClick={()=>props.ports.selectBlock('paragraph')}>¶ Ordinary TextBlock</button></li>
                <li><button onClick={()=>props.ports.selectBlock('image')}>▧ Image Block</button></li>
              </ul>
            </li>
            <li><button onClick={()=>props.ports.selectBlock('page-2')}>▤ Page 2</button></li>
          </ul>
          <div class="navigator-actions"><button onClick={props.ports.createComposition}>＋ Composition</button><button onClick={()=>props.ports.addNativeBlock('text')}>＋ Native Block</button></div>
          <p class="hint">All registered Mutable Blocks remain valid here; Quill is an editor, not a file format.</p>
        </aside>
      </Show>
      {/* PRIMARY TOOLBOX — icons/flyouts select modes, not independent document models */}
      <aside class="toolbox" aria-label="Quill toolbox">
        <For each={TOOLS}>{item=><button classList={{active:tool()===item.id}} title={item.flyout?.join(' · ') || item.label} aria-pressed={tool()===item.id} onClick={()=>chooseTool(item.id)}>{item.label}</button>}</For>
      </aside>
      <main class="work-area">
        <div class="canvas-toolbar">
          <div role="group" aria-label="View"><button onClick={()=>setWorkspaceView('page')}>Page</button><button onClick={()=>setWorkspaceView('composition')}>Composition</button></div>
          <span>{selectionDescription()}</span>
          <button onClick={()=>setZoom(Math.max(25,zoom()-25))}>−</button><output>{zoom()}%</output><button onClick={()=>setZoom(Math.min(400,zoom()+25))}>＋</button>
          <button onClick={()=>props.ports.setCanvasSurround('light')}>Canvas surround</button>
        </div>
        <div class="canvas-surround" aria-label="Editable composition workspace">
          <Show when={workspaceView()==='composition'} fallback={<div class="page-view">Render ordinary native page and all its mixed Blocks through BlockOutlet; selecting an SVG composition activates Quill tools.</div>}>
            <div class="artboard" role="group" aria-label="Editable SVG composition: The Raven">
              {/* REFERENCE COMPOSITION — all text remains canonical owned TextBlocks.
                  Production uses native SVG text presenter + range geometry + input gateway.
                  Artboard is not the application theme; image/colour is authored content. */}
              <svg viewBox="0 0 900 540" role="img" aria-label="The Raven typographic composition with editable paths">
                <defs>
                  <path id="quill-title-arc" d="M 75 220 Q 450 135 825 220" />
                  <path id="quill-wave-1" d="M 90 290 C 250 235 345 335 495 290 S 735 245 825 290" />
                  <path id="quill-wave-2" d="M 90 355 C 250 300 345 400 495 355 S 735 310 825 355" />
                  <path id="quill-wave-3" d="M 90 420 C 250 365 345 465 495 420 S 735 375 825 420" />
                </defs>
                <rect width="900" height="540" fill="#17131e" />
                <circle cx="710" cy="110" r="76" fill="#d7bc8c" opacity=".8" />
                <text x="62" y="115" fill="#f1d9aa" font-family="Georgia,serif" font-size="67" font-style="italic">The Raven</text>
                <text x="78" y="150" fill="#e2b77d" font-family="Georgia,serif" font-size="22">by Edgar Allan Poe</text>
                <g fill="none" stroke="#c85b50" stroke-width="1.2" opacity=".8">
                  <use href="#quill-wave-1"/><use href="#quill-wave-2"/><use href="#quill-wave-3"/>
                </g>
                <g fill="#f1d9aa" font-family="Georgia,serif" font-size="25">
                  <text><textPath href="#quill-wave-1">Once upon a midnight dreary, while I pondered, weak and weary,</textPath></text>
                  <text><textPath href="#quill-wave-2">Over many a quaint and curious volume of forgotten lore—</textPath></text>
                  <text><textPath href="#quill-wave-3">While I nodded, nearly napping, suddenly there came a tapping,</textPath></text>
                </g>
                <circle cx="495" cy="290" r="6" fill="#a776ee" stroke="white" stroke-width="2" />
                <text x="790" y="505" fill="#a776ee" font-size="12">Selected path · handles visible</text>
              </svg>
              {/* PSEUDOCODE interaction handlers:
                 pointerDown -> hitTestShapedCluster -> nativeSelectionService.setRange
                 keyBeforeInput -> nativeInputGateway -> replaceInlineRange
                 pathDragStart -> beginPathGesture; drag -> previewPathGesture
                 pointerUp -> commitPathGesture (one undo step); Escape -> cancelPathGesture
                 geometry/text change -> invalidate source fragments -> incremental reflow
                 native standoff changes -> shared range geometry/decoration adapter */}
            </div>
          </Show>
        </div>
        <div class="contextual-path-strip">
          <span>Selected: Wave path 2</span>
          <button onClick={()=>props.ports.addPath('line')}>Line</button>
          <button onClick={()=>props.ports.addPath('arc')}>Arc</button>
          <button onClick={()=>props.ports.addPath('sine')}>Wave</button>
          <button onClick={()=>props.ports.addPath('spiral')}>Spiral</button>
          <button onClick={props.ports.addLinkedPath}>＋ Linked path</button>
        </div>
      </main>
      {/* ALL INSPECTOR TABS EXIST EVEN WHEN INACTIVE. Content is selection-sensitive. */}
      <aside class="inspector" aria-label="Properties inspector">
        <div role="tablist" class="inspector-tabs">
          <For each={['text','path','layout','effects','semantics'] as InspectorTab[]}>{id=><button role="tab" aria-selected={inspector()===id} onClick={()=>setInspector(id)}>{id}</button>}</For>
        </div>
        <div class="inspector-content">
          <Switch>
            <Match when={inspector()==='text'}><TextInspector ports={props.ports} selection={selected()}/></Match>
            <Match when={inspector()==='path'}><PathInspector ports={props.ports} selection={selected()}/></Match>
            <Match when={inspector()==='layout'}><LayoutInspector ports={props.ports} selection={selected()}/></Match>
            <Match when={inspector()==='effects'}><EffectsInspector ports={props.ports} selection={selected()}/></Match>
            <Match when={inspector()==='semantics'}><SemanticsInspector ports={props.ports} selection={selected()}/></Match>
          </Switch>
        </div>
      </aside>
    </div>
    <Show when={showDock()}>
      <section class="bottom-dock" aria-label="Layers and asset library">
        <div role="tablist"><For each={['layers','ornaments','path-presets','effect-presets','assets'] as DockTab[]}>{id=><button role="tab" aria-selected={dock()===id} onClick={()=>setDock(id)}>{id}</button>}</For><button onClick={()=>setShowDock(false)}>Collapse dock</button></div>
        <Switch>
          <Match when={dock()==='layers'}><LayersDock ports={props.ports}/></Match>
          <Match when={dock()==='ornaments'}><AssetTiles title="Ornament library" entries={['Curlicue','Floral flourish','Divider','Illuminated capital','Frame']} onChoose={props.ports.addOrnament}/></Match>
          <Match when={dock()==='path-presets'}><AssetTiles title="Path presets" entries={['Line','Arc','Circle','Ellipse','Sine','Rectangle','Polygon','Spiral','Bézier']} onChoose={props.ports.addPath}/></Match>
          <Match when={dock()==='effect-presets'}><AssetTiles title="Effect presets" entries={['Centre swell','Taper','Crescendo','Baseline wave','Tracking pulse']} onChoose={props.ports.addEffect}/></Match>
          <Match when={dock()==='assets'}><AssetTiles title="Managed images and backgrounds" entries={['Raven','Moon','Texture','Paper','Gradient']} onChoose={props.ports.addBackground}/></Match>
        </Switch>
      </section>
    </Show>
    <footer class="statusbar">Ink: The Raven.ink · Native Block: mutable/svg-text-composition-block · 3 linked paths · Overflow: 0 · Zoom {zoom()}% · {appearance()}</footer>
  </div>;
}

function TextInspector(p:{ports:QuillPorts;selection:Selection}){return <section>
  <h3>Text content</h3><p>Source: body · native TextBlock (edit on canvas)</p>
  <button onClick={p.ports.addTextSource}>＋ Text source</button>
  <h3>Typography</h3>
  <label>Font <select onChange={e=>p.ports.setTextStyle('fontFamily',e.currentTarget.value)}><option>Georgia</option><option>EB Garamond</option><option>Cormorant</option></select></label>
  <label>Size <input type="number" value="24" onChange={e=>p.ports.setTextStyle('fontSize',+e.currentTarget.value)}/></label>
  <button onClick={()=>p.ports.setTextStyle('italic',true)}>Italic</button><button onClick={()=>p.ports.setTextStyle('bold',true)}>Bold</button>
  <label>Tracking <input type="range" min="-10" max="30" onChange={e=>p.ports.setTextStyle('tracking',+e.currentTarget.value)}/></label>
  <h3>Text on path</h3><label>Path assignment <select><option>Wave 1–3 flow</option><option>Single arc</option></select></label>
  <label>Path offset <input type="range" onChange={e=>p.ports.setFlowProperty('startOffset',+e.currentTarget.value)}/></label>
  <p>Alignment · Baseline · Flip · Orientation · Overflow indicator</p>
</section>}
function PathInspector(p:{ports:QuillPorts;selection:Selection}){return <section>
  <h3>Geometry</h3><label>Primitive <select onChange={e=>p.ports.addPath(e.currentTarget.value)}>{['line','arc','circle','ellipse','sine','rectangle','polygon','spiral','bezier','freehand'].map(x=><option>{x}</option>)}</select></label>
  <p>Node mode · Add/remove anchors · Smooth/corner · Convert to freeform</p>
  <For each={['x','y','length','amplitude','frequency','phase','pathSpacing']}>{name=><label>{name}<input type="number" onChange={e=>p.ports.setPathParameter(name,+e.currentTarget.value)}/></label>}</For>
  <button onClick={p.ports.addLinkedPath}>Add linked path</button>
  <p>Reverse path · Snap · Offset · Distribute · Overflow diagnostics</p>
</section>}
function LayoutInspector(p:{ports:QuillPorts;selection:Selection}){return <section>
  <h3>Artboard / page</h3><p>Size · Orientation · Margins · Bleed · ViewBox</p>
  <h3>Arrangement</h3><p>Position X/Y · Width/height · Align · Distribute · Guides · Grid · Snap</p>
  <h3>Text flow</h3><p>Flow order · Source order · Linked path family · Paragraph spacing · Overflow</p>
  <h3>Background</h3><button onClick={()=>p.ports.addBackground('gradient')}>Add gradient</button><button onClick={()=>p.ports.addBackground('image')}>Add image</button>
  <p>Note: authored backgrounds belong to the composition, not the app theme.</p>
</section>}
function EffectsInspector(p:{ports:QuillPorts;selection:Selection}){return <section>
  <h3>Transformation stack</h3>
  <For each={['Centre swell','Baseline wave','Rotation','Tracking envelope','Opacity gradient']}>{(name,i)=><div class="effect-row"><label><input type="checkbox" onChange={()=>p.ports.toggleEffect(String(i()))}/>{name}</label><button onClick={()=>p.ports.reorderEffect(String(i()),-1)}>↑</button><button onClick={()=>p.ports.reorderEffect(String(i()),1)}>↓</button><input type="range" onChange={e=>p.ports.setEffectParameter(String(i()),'strength',+e.currentTarget.value)}/></div>}</For>
  <button onClick={()=>p.ports.addEffect('centre-swell')}>＋ Add transformation</button>
  <h3>Effect policy</h3><p>Layout-affecting: font size, tracking, variable axes. Visual-only: opacity, colour, optional transforms. Composition order is explicit.</p>
  <p>Function editor: envelope graph, easing, amplitude, phase, repeat, per-glyph/per-word/per-run target.</p>
</section>}
function SemanticsInspector(p:{ports:QuillPorts;selection:Selection}){return <section>
  <h3>Native annotations</h3><button onClick={()=>p.ports.annotate('entity')}>Entity</button><button onClick={()=>p.ports.annotate('gloss')}>Gloss</button><button onClick={()=>p.ports.annotate('comment')}>Comment</button><button onClick={()=>p.ports.annotate('format')}>Format</button>
  <h3>Selected canonical range</h3><p>Source ID · Start/end · Native revision · Overlapping properties</p>
  <h3>Reading order & accessibility</h3><p>Text remains available in canonical logical order, independent of visual path order.</p>
</section>}
function LayersDock(p:{ports:QuillPorts}){return <div class="layers-dock"><For each={['Title text','Body text · three waves','Flourishes','Raven illustration','Moon','Background']}>{(name,i)=><div class="layer"><span>{name}</span><button onClick={()=>p.ports.toggleLayer(String(i()),'visible')}>Eye</button><button onClick={()=>p.ports.toggleLayer(String(i()),'locked')}>Lock</button><button onClick={()=>p.ports.reorderLayer(String(i()),-1)}>↑</button><button onClick={()=>p.ports.reorderLayer(String(i()),1)}>↓</button></div>}</For></div>}
function AssetTiles(p:{title:string;entries:string[];onChoose:(id:string)=>void}){return <div><h3>{p.title}</h3><div class="asset-grid"><For each={p.entries}>{name=><button onClick={()=>p.onChoose(name.toLowerCase().replaceAll(' ','-'))}>{name}</button>}</For></div></div>}

/*
 * PRODUCTION BINDING NOTES
 * - Inspector controls are illustrative; wire to selected native source and Block schema.
 * - Convert/copy/paste operations are available in native Block context menus as well as Quill.
 * - Selection-sensitive disabled states must prevent edits to locked, stale, unknown or shared sources.
 * - Mixed Document rendering delegates to BlockOutlet; do not flatten unsupported Blocks.
 * - All geometry gesture previews are ephemeral; commit only on pointer release / explicit input commit.
 * - Theme is a persisted app preference; canvas surround is a view preference; authored background is Ink content.
 * - Preserve native rich clipboard semantics; copying a text range never replaces path geometry.
 * - Accessibility: logical text reading order, keyboard handles, labels, focus, numeric geometry inputs.
 * - CSS/illustrations are design tasks; this file is a layout/function specification, not the final styling.
 */
