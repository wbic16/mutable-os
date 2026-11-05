import {expect,it} from 'vitest';
import {notifyFontLayoutChange,observeFontLayout} from './font-layout';
it('invalidates only mounted content inside the changed font scope and releases listeners',()=>{
 const a=document.createElement('div'),b=document.createElement('div'),child=document.createElement('span');a.append(child);document.body.append(a,b);
 let reads=0,unrelated=0;const stop=observeFontLayout(child,()=>reads++),stopOther=observeFontLayout(b,()=>unrelated++);
 notifyFontLayoutChange(a);expect(reads).toBe(1);expect(unrelated).toBe(0);
 stop();notifyFontLayoutChange(a);expect(reads).toBe(1);stopOther();a.remove();b.remove();
});
