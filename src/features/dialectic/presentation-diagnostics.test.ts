// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import {observeContributionPresentation} from './presentation-diagnostics';
afterEach(()=>{vi.useRealTimers();vi.restoreAllMocks();vi.unstubAllGlobals();document.body.replaceChildren();});

it('collects bounded passive evidence after panel publication without measuring or polling DOM',()=>{
 vi.useFakeTimers();
 let intersect!:(entries:any[])=>void,frame!:(list:any)=>void;
 const watch=vi.fn(),stopIntersection=vi.fn(),watchFrame=vi.fn(),stopFrames=vi.fn();
 vi.stubGlobal('IntersectionObserver',class {constructor(callback:any){intersect=callback;}observe=watch;disconnect=stopIntersection;});
 vi.stubGlobal('PerformanceObserver',class {static supportedEntryTypes=['long-animation-frame'];constructor(callback:any){frame=callback;}observe=watchFrame;disconnect=stopFrames;});
 const canvas=document.body.appendChild(document.createElement('div'));canvas.className='dialectic-canvas';
 const element=canvas.appendChild(document.createElement('div')),measure=vi.spyOn(element,'getBoundingClientRect');
 const publish=vi.fn(),trace=observeContributionPresentation(element,publish,()=>true);
 expect(watch).toHaveBeenCalledTimes(1);expect(watch).toHaveBeenCalledWith(element);expect(watchFrame).toHaveBeenCalledTimes(1);expect(watchFrame).toHaveBeenCalledWith({type:'long-animation-frame'});
 trace.panelPublished();
 intersect(Array.from({length:100},()=>({time:performance.now(),isIntersecting:true,intersectionRatio:1,boundingClientRect:{top:10,left:10,width:100,height:100}})));
 frame({getEntries:()=>Array.from({length:100},()=>({startTime:performance.now(),duration:120,blockingDuration:70,scripts:[]}))});
 vi.advanceTimersByTime(10000);
 expect(publish).toHaveBeenCalledTimes(1);const report=publish.mock.calls[0][0];
 expect(report.visibility).toHaveLength(32);expect(report.frames).toHaveLength(32);expect(report.panelPublishedMs).toBeGreaterThanOrEqual(0);
 expect(measure).not.toHaveBeenCalled();expect(stopIntersection).toHaveBeenCalledTimes(1);expect(stopFrames).toHaveBeenCalledTimes(1);
 expect(vi.getTimerCount()).toBe(0);
});

it('releases observers on disposal and suppresses stale-session reports',()=>{
 vi.useFakeTimers();vi.stubGlobal('IntersectionObserver',undefined);vi.stubGlobal('PerformanceObserver',undefined);
 const element=document.body.appendChild(document.createElement('div')),publish=vi.fn();
 const cancelled=observeContributionPresentation(element,publish,()=>true);cancelled.dispose();
 observeContributionPresentation(element,publish,()=>false);
 vi.advanceTimersByTime(10000);expect(publish).not.toHaveBeenCalled();expect(vi.getTimerCount()).toBe(0);
});
