// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import {workspaceFixture} from './workspace.fixture';
import {XmlContext} from './xml-context';
import {NativeXmlStream} from './native-stream';
import {captureNative,nativeBytes,decodeNative} from '../../../persistence/native-resource';
import {prepareExternalImage} from '../../../block-tree/media-authoring';
const cleanup:(()=>void)[]=[];
afterEach(()=>{cleanup.splice(0).reverse().forEach(f=>f());vi.restoreAllMocks();});
async function setup(){const f=workspaceFixture();cleanup.push(f.dispose);const human=f.addHuman('Show a grid of three images.'),sources=f.open(),request=await f.req(sources,human),authority=new XmlContext(sources,request.exchange);request.dialect='xml/1';return {f,sources,request,authority};}
const urls=['https://images.example.org/a.jpg','https://images.example.org/b.png','https://images.example.org/c.webp'];
const xml='<grid><tr>'+urls.map((url,i)=>`<td><image src="${url}" alt="Image ${i+1}"/></td>`).join('')+'</tr></grid>';
const images=(blocks:any[]):any[]=>blocks.flatMap(b=>[...(b.type==='image-block'?[b]:[]),...images(b.children??[])]);
it('advertises image embedding in General XML and admits three native images in a grid with persistence and Undo/Redo',async()=>{
 const {f,sources,request,authority}=await setup();
 expect(authority.request(request).capabilities).toContain('media.external-image');
 expect(authority.describe(sources.capabilities!.describe({ids:['media.external-image']})).items[0]).toMatchObject({authorable:true,syntax:expect.stringContaining('<image src=')});
 const before=nativeBytes(captureNative(f.editor.repository.readState(),f.owner));
 const result=await f.admit(sources,authority.lower(xml),'agent-A',request);
 expect(images(result.children).map(({id,...b})=>b)).toEqual(urls.map((url,i)=>{const {id,...b}=prepareExternalImage(url,`Image ${i+1}`);return b;}));
 const saved=nativeBytes(captureNative(f.editor.repository.readState(),f.owner));expect(nativeBytes(decodeNative(saved))).toEqual(saved);
 f.editor.repository.undo();expect(nativeBytes(captureNative(f.editor.repository.readState(),f.owner))).toEqual(before);
 f.editor.repository.redo();expect(nativeBytes(captureNative(f.editor.repository.readState(),f.owner))).toEqual(saved);
});
it('prepares a streamed grid only when closed and enforces cumulative media bounds',async()=>{
 const {f,sources,request,authority}=await setup();authority.request(request);const apply=vi.fn();
 const stream=new NativeXmlStream({editor:f.editor,sources,authority,exchange:request.exchange,owner:f.owner,participant:'agent-A',apply});cleanup.push(()=>stream.stop());
 stream.write(xml.slice(0,-7));await Promise.resolve();expect(apply).not.toHaveBeenCalled();
 stream.write(xml);await stream.finish(xml);expect(images(apply.mock.calls[0][0].children)).toHaveLength(3);
 const other=await setup(),calls=vi.fn(),limited=new NativeXmlStream({editor:other.f.editor,sources:other.sources,authority:other.authority,exchange:other.request.exchange,owner:other.f.owner,participant:'agent-A',apply:calls});cleanup.push(()=>limited.stop());
 const nine=Array.from({length:9},()=>'<image src="https://images.example.org/a.jpg"/>').join('');
 await expect(limited.finish(nine)).rejects.toThrow();expect(calls).toHaveBeenCalledTimes(8);
});
it.each(['http://127.0.0.1/a.png','javascript:alert(1)','data:image/png;base64,AA'])('rejects unsafe image reference %s without admission',async url=>{
 const {f,sources,request,authority}=await setup(),revision=f.editor.repository.state.revision;
 await expect(f.admit(sources,authority.lower(`<image src="${url}"/>`),'agent-A',request)).rejects.toThrow();expect(f.editor.repository.state.revision).toBe(revision);
});
it('rejects unqualified XML attributes and unavailable native image rendering',async()=>{
 const {f,sources,request,authority}=await setup();
 expect(()=>authority.lower('<image src="https://example.org/a.png" assetId="invented"/>')).toThrow();
 const resolve=f.editor.registry.resolve.bind(f.editor.registry);vi.spyOn(f.editor.registry,'resolve').mockImplementation(type=>type==='image-block'?undefined:resolve(type));
 await expect(f.admit(sources,authority.lower(xml),'agent-A',request)).rejects.toThrow();
});
