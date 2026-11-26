import {structuredExtensions} from '../structured/model';
export type ImportFormat = 'tei' | 'html' | 'markdown' | 'text' | 'png' | 'jpeg' | 'structured' | 'academic' | 'pdf';
export type ExportFormat = 'html' | 'markdown' | 'text';
export const formats = [
  {id:'tei',label:'TEI P5 XML',extensions:['tei'],mediaTypes:['application/tei+xml'],operations:['import'],adapter:'tei-native',profile:'tei/milestone-1'},
  {id:'academic',label:'Academic bibliography / OCR / EPUB',extensions:['bib','bibtex','ris','alto','page','epub'],mediaTypes:['application/x-bibtex','application/x-research-info-systems','application/epub+zip'],operations:['import','insert'],adapter:'academic-resource',profile:'mutable-academic-v1'},
  {id:'structured',label:'Read-only code / data / diagram',extensions:structuredExtensions,mediaTypes:['application/json','application/yaml','text/yaml','text/csv','text/tab-separated-values','application/javascript','text/javascript'],operations:['import','insert'],adapter:'structured-resource',profile:'mutable-structured-v1'},
  { id: 'html', label: 'HTML', extensions: ['html', 'htm'], mediaTypes: ['text/html'], operations: ['import', 'insert', 'convert', 'export'], adapter: 'semantic-html', profile: 'mutable-semantic-html-v1' },
  { id: 'markdown', label: 'Markdown', extensions: ['md', 'markdown'], mediaTypes: ['text/markdown', 'text/x-markdown'], operations: ['import', 'insert', 'convert', 'export'], adapter: 'commonmark', profile: 'mutable-commonmark-gfm-table-v1' },
  { id: 'text', label: 'Plain text', extensions: ['txt'], mediaTypes: ['text/plain'], operations: ['import', 'insert', 'export'], adapter: 'plain', profile: 'mutable-plain-v1' },
  { id: 'png', label: 'PNG', extensions: ['png'], mediaTypes: ['image/png'], operations: ['import', 'insert'], adapter: 'managed-original', profile: 'mutable-raster-original-v1' },
  { id: 'jpeg', label: 'JPEG', extensions: ['jpg', 'jpeg'], mediaTypes: ['image/jpeg'], operations: ['import', 'insert'], adapter: 'managed-original', profile: 'mutable-raster-original-v1' },
  { id: 'pdf', label: 'PDF document', extensions: ['pdf'], mediaTypes: ['application/pdf'], operations: ['import', 'insert'], adapter: 'liteparse-resource', profile: 'mutable-liteparse-v1' },
] as const;
export const fileAccept = formats.flatMap(f => f.extensions.map(e => `.${e}`)).join(',');
export const exportFormats = formats.filter(f => (f.operations as readonly string[]).includes('export'));
export function detectFormat(name: string, mime: string, bytes: Uint8Array, explicit?: ImportFormat): ImportFormat {
  if (/\.(ink|phosphor|mutable\.json)$/i.test(name)) throw Error('Use Open existing Ink document for native files. Import creates a new document from external content.');
  const ext = name.split('.').at(-1)?.toLowerCase();
  const named = formats.find(f => (f.extensions as readonly string[]).includes(ext ?? ''));
  const signed = bytes.length >= 8 && [137,80,78,71,13,10,26,10].every((b,i)=>bytes[i]===b) ? 'png'
    : bytes[0]===255 && bytes[1]===216 && bytes[2]===255 ? 'jpeg'
    : bytes.length >= 5 && [37,80,68,70,45].every((b,i)=>bytes[i]===b) ? 'pdf' : undefined;
  const selected = explicit ?? named?.id;
  if (!selected) throw Error('Unsupported extension. Choose a supported file or explicitly select Plain text.');
  if (signed && selected !== signed || !signed && ['png','jpeg','pdf'].includes(selected)) throw Error(`File contents do not match ${selected}: ${name}`);
  const declared = formats.find(f => (f.mediaTypes as readonly string[]).includes(mime.toLowerCase()));
  if (declared && declared.id !== selected && selected!=='structured' && !(mime==='text/plain' && !signed) && !explicit) throw Error(`File type and extension disagree: ${name}. Choose the intended text format explicitly.`);
  return selected;
}
export const safeFilename = (name: string) => (name.split(/[\\/]/).at(-1) ?? 'Document').replace(/\.(html?|md|markdown|txt|png|jpe?g|pdf)$/i,'').replace(/[\u0000-\u001f<>:"/\\|?*]/g,'_').replace(/[. ]+$/,'').slice(0,100) || 'Document';
