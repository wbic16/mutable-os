import { LIMITS } from './fragment';
import { detectFormat, safeFilename, type ImportFormat } from './formats';
import { diagnostic } from './diagnostics';
export interface SuppliedFile { name: string; blob: Blob }
export function checkFiles(files: readonly SuppliedFile[]) {
  if (!files.length || files.length > 20 || files.reduce((n,f)=>n+f.blob.size,0)>40*1024*1024 || files.some(f=>f.blob.size>(/\.epub$/i.test(f.name)?32:10)*1024*1024)) throw Error('Choose 1–20 files, at most 10 MiB each and 40 MiB total.');
}
export function decodeSource(bytes: Uint8Array) {
  let encoding = 'utf-8', bom = 0;
  if (bytes[0]===255&&bytes[1]===254) { encoding='utf-16le';bom=2; }
  else if (bytes[0]===254&&bytes[1]===255) { encoding='utf-16be';bom=2; }
  else if (bytes[0]===239&&bytes[1]===187&&bytes[2]===191) bom=3;
  let source: string;
  try { source=new TextDecoder(encoding,{fatal:true,ignoreBOM:true}).decode(bytes.subarray(bom)); }
  catch { throw Error('Invalid text encoding. Resave as UTF-8, or UTF-16 with a BOM.'); }
  if (source.includes('\0') || /[\u0001-\u0008\u000b\u000e-\u001f]/.test(source)) throw Error('Binary control characters are not supported in text imports.');
  if ([...source].length>LIMITS.cells) throw Error('Text exceeds the 200,000-character import limit.');
  return { source, encoding, bom:!!bom };
}
export async function readSelectedFile(file: SuppliedFile, explicit?: ImportFormat) {
  const bytes=new Uint8Array(await file.blob.arrayBuffer());
  const format=detectFormat(file.name,file.blob.type,bytes,explicit), title=safeFilename(file.name);
  if (format==='tei') throw Error('TEI requires full-document native import; fragment insertion and source embedding are not enabled.');
  const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',bytes));
  const byteHash=[...digest].map(b=>b.toString(16).padStart(2,'0')).join('');
  if (format==='academic'||format==='png'||format==='jpeg'||format==='pdf') return {format,title,filename:`${title}.ink`,byteHash,diagnostics:[],source:''};
  if (bytes.length>LIMITS.bytes) throw Error('Text files are limited to 8 MiB.');
  const decoded=decodeSource(bytes), diagnostics=[];
  if (format!=='structured' && /\r/.test(decoded.source)) diagnostics.push(diagnostic('normalized-newlines','Source line endings become logical newlines in Ink.',false,file.name));
  if (format==='markdown' && /^\s*(?:<!doctype\s+html|<html\b)/i.test(decoded.source) && !explicit) throw Error('This looks like an HTML document. Choose HTML explicitly.');
  return {format,title,filename:`${title}.ink`,byteHash,diagnostics,...decoded};
}
