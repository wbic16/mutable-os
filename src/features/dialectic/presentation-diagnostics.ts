/** Short-lived, passive browser evidence for an admitted contribution. No DOM
 * measurement loop, screenshots, text capture, repository reads or mutations.
 * Intersection and frame timing are evidence, not proof that pixels were seen. */
export function observeContributionPresentation(element: Element, publish: (details: unknown) => void, current: () => boolean) {
 const start=performance.now(),visibility:unknown[]=[],frames:unknown[]=[];
 let alive=true,panelPublishedMs:number|undefined;
 const hiddenAtStart=document.hidden;
 const intersection=typeof IntersectionObserver==='undefined'?undefined:new IntersectionObserver(entries=>{
  if(!alive)return;
  for(const e of entries.slice(0,32-visibility.length))visibility.push({ms:e.time-start,intersecting:e.isIntersecting,ratio:e.intersectionRatio,
   bounds:{top:e.boundingClientRect.top,left:e.boundingClientRect.left,width:e.boundingClientRect.width,height:e.boundingClientRect.height}});
 },{root:element.closest('.dialectic-canvas')});
 intersection?.observe(element);
 const types=typeof PerformanceObserver==='undefined'?[]:PerformanceObserver.supportedEntryTypes??[];
 const type=types.includes('long-animation-frame')?'long-animation-frame':types.includes('longtask')?'longtask':undefined;
 let observer:PerformanceObserver|undefined;
 try{observer=type?new PerformanceObserver(list=>{
  if(!alive)return;
  for(const entry of list.getEntries().slice(0,32-frames.length)){
   const e=entry as PerformanceEntry&{blockingDuration?:number;renderStart?:number;styleAndLayoutStart?:number;scripts?:Array<{duration:number;forcedStyleAndLayoutDuration:number;sourceURL:string;sourceFunctionName:string}>};
   frames.push({ms:e.startTime-start,duration:e.duration,blockingDuration:e.blockingDuration,renderStart:e.renderStart?e.renderStart-start:undefined,
    styleAndLayoutStart:e.styleAndLayoutStart?e.styleAndLayoutStart-start:undefined,
    scripts:e.scripts?.slice(0,8).map(s=>({duration:s.duration,forcedStyleAndLayoutDuration:s.forcedStyleAndLayoutDuration,
     source:s.sourceURL?.split('?')[0].slice(0,240),function:s.sourceFunctionName?.slice(0,120)}))});
  }
 }):undefined;
 observer?.observe({type:type!});
 }catch{intersection?.disconnect();observer?.disconnect();throw Error('Browser presentation observation unavailable');}
 const dispose=()=>{if(!alive)return;alive=false;clearTimeout(timer);intersection?.disconnect();observer?.disconnect();};
 const timer=setTimeout(()=>{
  if(!alive)return;
  const details={observationMs:performance.now()-start,panelPublishedMs,hiddenAtStart,hiddenAtEnd:document.hidden,connected:element.isConnected,
   frameEntryType:type??'unsupported',intersectionSupported:!!intersection,visibility,frames};
  dispose();if(current())publish(details);
 },10000);
 return {panelPublished(){if(alive)panelPublishedMs=performance.now()-start;},dispose};
}
