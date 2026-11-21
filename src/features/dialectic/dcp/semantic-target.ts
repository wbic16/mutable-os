import {keys} from './markup';
/** Literal UTF-16 matching converted to native code-point Cells. Never fuzzy. */
export function quoteCells(text:string,quote:string,prefix:string,suffix:string){
 if(typeof quote!=='string'||!quote.length||quote.length>8192||typeof prefix!=='string'||prefix.length>2048||typeof suffix!=='string'||suffix.length>2048)throw Error('Invalid semantic quote selector');
 const matches:number[]=[];
 for(let at=text.indexOf(quote);at>=0;at=text.indexOf(quote,at+1))if(text.slice(0,at).endsWith(prefix)&&text.slice(at+quote.length).startsWith(suffix))matches.push(at);
 if(matches.length!==1)throw Error(matches.length?'Ambiguous semantic quote':'Missing semantic quote');
 const boundaries=new Map<number,number>();let offset=0,cell=0;boundaries.set(0,0);for(const c of text){offset+=c.length;boundaries.set(offset,++cell);}
 const start=boundaries.get(matches[0]),end=boundaries.get(matches[0]+quote.length);if(start===undefined||end===undefined)throw Error('Selector splits a Cell');return {start,end,text:quote};
}
export function declarativeTarget(value:any){
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Invalid semantic target');
 const whole=Object.hasOwn(value,'whole');keys(value,whole?['block','revision','whole']:['block','revision','quote','prefix','suffix']);
 if(typeof value.block!=='string'||!(value.revision===null||typeof value.revision==='string')||whole&&value.whole!==true)throw Error('Invalid semantic target authority');return whole;
}
