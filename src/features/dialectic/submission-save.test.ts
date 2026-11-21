import {afterEach,expect,it,vi} from 'vitest';
import {conversationFilename,createSubmissionSave} from './submission-save';
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();vi.useRealTimers();});
it('uses the requested local calendar filename',()=>{
 expect(conversationFilename(new Date(2026,10,10,14))).toBe('Conversation on November 10, 2026.ink');
});
it('serialises commit saves, coalesces queued commits and retains the submitted identity',async()=>{
 const finish:Array<(ok:boolean)=>void>=[],save=vi.fn((_id:string,_name:string)=>new Promise<boolean>(r=>finish.push(r)));
 const service=createSubmissionSave(save,()=>true);
 service.request('first');await vi.waitFor(()=>expect(save).toHaveBeenCalledTimes(1));
 service.request('first');service.request('first');service.request('second');
 expect(save.mock.calls.map(c=>c[0])).toEqual(['first']);expect(service.state('first')?.pending).toBe(true);
 finish.shift()!(true);await vi.waitFor(()=>expect(save).toHaveBeenCalledTimes(2));
 expect(save.mock.calls[1][0]).toBe('first');finish.shift()!(true);
 await vi.waitFor(()=>expect(save).toHaveBeenCalledTimes(3));expect(save.mock.calls[2][0]).toBe('second');
 finish.shift()!(true);await vi.waitFor(()=>expect(service.state('second')?.pending).toBe(false));service.dispose();
});
it('retains a save error without retry storms, and supports an explicit retry',async()=>{
 const save=vi.fn().mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValue(true),service=createSubmissionSave(save,()=>true);
 service.request('first');await vi.waitFor(()=>expect(service.state('first')?.error).toContain('Failed to fetch'));
 expect(save).toHaveBeenCalledTimes(1);service.request('first');await vi.waitFor(()=>expect(service.state('first')).toEqual({pending:false,error:''}));
 expect(save).toHaveBeenCalledTimes(2);service.dispose();
});
it('does no save work when disabled or disposed',async()=>{
 const save=vi.fn(),off=createSubmissionSave(save,()=>false),closed=createSubmissionSave(save,()=>true);
 off.request('first');closed.request('second');closed.dispose();await Promise.resolve();expect(save).not.toHaveBeenCalled();off.dispose();
});
it('keeps pending state through a rendering opportunity and until durable completion',async()=>{
 vi.useFakeTimers();const frames:Array<FrameRequestCallback>=[];
 vi.stubGlobal('document',{hidden:false});vi.stubGlobal('requestAnimationFrame',(f:FrameRequestCallback)=>(frames.push(f),frames.length));vi.stubGlobal('cancelAnimationFrame',vi.fn());
 let finish!:(ok:boolean)=>void;const save=vi.fn(()=>new Promise<boolean>(r=>finish=r)),service=createSubmissionSave(save,()=>true);
 service.request('doc');await Promise.resolve();expect(save).not.toHaveBeenCalled();expect(service.state('doc')?.pending).toBe(true);
 frames.shift()!(0);await Promise.resolve();expect(save).not.toHaveBeenCalled();
 frames.shift()!(16);await Promise.resolve();expect(save).toHaveBeenCalledTimes(1);expect(service.state('doc')?.pending).toBe(true);
 finish(true);await Promise.resolve();expect(service.state('doc')).toEqual({pending:false,error:''});service.dispose();
});
it('persists when frames are suspended, and cancels queued capture on disposal',async()=>{
 vi.useFakeTimers();vi.stubGlobal('document',{hidden:false});vi.stubGlobal('requestAnimationFrame',vi.fn(()=>1));vi.stubGlobal('cancelAnimationFrame',vi.fn());
 const save=vi.fn().mockResolvedValue(true),service=createSubmissionSave(save,()=>true);
 service.request('doc');await vi.advanceTimersByTimeAsync(250);expect(save).toHaveBeenCalledTimes(1);
 service.request('doc');service.dispose();await vi.advanceTimersByTimeAsync(250);expect(save).toHaveBeenCalledTimes(1);
});
