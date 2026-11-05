import type {BlockMenuItem} from '../../runtime/block-menu-types';
export type TextualMenuItem=BlockMenuItem & {shortcut?:string;separatorBefore?:boolean};
export function menuLabel(item:TextualMenuItem){
 const match=item.label.match(/^(.*?)\s+\(((?:Ctrl|Cmd|Alt|Shift|⌘)[^)]*)\)$/);
 return {label:match?.[1]??item.label,shortcut:item.shortcut??match?.[2]??''};
}
export function menuSize(items:TextualMenuItem[]){
 const labels=items.map(menuLabel),shortcut=Math.max(0,...labels.map(i=>Array.from(i.shortcut).length)),arrow=items.some(i=>i.children||i.loadChildren)?2:0;
 return {columns:Math.max(8,...labels.map(i=>Array.from(i.label).length+4+(shortcut?shortcut+2:0)+arrow)),rows:items.length+items.filter((i,n)=>n>0&&i.separatorBefore).length+2,shortcut,arrow};
}
export function placeMenu(columns:number,rows:number,width:number,height:number,col:number,row:number,parent?:{col:number;width:number}){
 width=Math.min(width,Math.max(4,columns-1));height=Math.min(height,Math.max(3,rows-2));
 if(parent)col=parent.col+parent.width+width+1<=columns?parent.col+parent.width:parent.col-width;
 return {col:Math.max(0,Math.min(col,columns-width-1)),row:Math.max(1,Math.min(row,rows-height-1)),width,height};
}
