// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import {workspaceFixture} from './workspace.fixture';
import {authorityDetails,searchAuthority} from '../../autocomplete/authorities';
import {lookupAuthority} from './authority-lookup';
import {registerStandaloneEntityService} from '../../../application/entity-service';
import {XmlContext} from './xml-context';
vi.mock('../../autocomplete/authorities',()=>({authorityDetails:vi.fn(),searchAuthority:vi.fn()}));
const clean:(()=>void)[]=[];afterEach(()=>{clean.splice(0).reverse().forEach(f=>f());vi.resetAllMocks();});
const record={provider:'wikidata' as const,id:'Q5592',name:'Michelangelo',description:'Italian artist and architect',aliases:['Michelangelo Buonarroti'],url:'https://www.wikidata.org/wiki/Q5592',retrievedAt:'2026-11-16T01:06:58Z',thumbnail:{url:'https://upload.wikimedia.org/fixture-michelangelo.jpg',source:'https://commons.wikimedia.org/wiki/File:Fixture',attribution:'Fixture artist',license:'Public domain'}};
it('sources portraits through the advertised DCP tool and embeds the returned URL without lookup mutating the Document',async()=>{
 const f=workspaceFixture();clean.push(f.dispose);const human=f.addHuman('Show portraits of Michelangelo.'),s=f.open(),r=await f.req(s,human);r.dialect='xml/1';const x=new XmlContext(s,r.exchange);x.request(r);
 clean.push(registerStandaloneEntityService(f.editor,()=>({historyScope:async()=>'/current-vault',dispose(){}} as any)));vi.mocked(searchAuthority).mockResolvedValue([record]);vi.mocked(authorityDetails).mockResolvedValue(record);
 const revision=f.editor.repository.state.revision,snapshots=vi.spyOn(f.editor.repository,'snapshot'),result=await s.tool({id:'portraits',tool:'lookup_authority',arguments:{queries:['Michelangelo'],limit:1}});
 expect(result.results[0].items[0]).toMatchObject({id:'Q5592',thumbnail:record.thumbnail,identityStatus:'candidate; verify against context'});expect(f.editor.repository.state.revision).toBe(revision);expect(snapshots).not.toHaveBeenCalled();expect(searchAuthority).toHaveBeenCalledWith('wikidata','Michelangelo',expect.any(AbortSignal),'/current-vault');expect(s.trail.at(-1)?.result).toBe(result);
 const image=result.results[0].items[0].thumbnail;await f.admit(s,x.lower(`<p>Portrait of Michelangelo. Source: ${image.source}. ${image.license}.</p><image src="${image.url}" alt="Portrait of Michelangelo"/>`),'agent-A',r);expect([...Object.values(f.editor.repository.readState().contents)].some(c=>c.viewType==='image-block')).toBe(true);
});
it('returns lookup failures to the agent and rejects disabled, oversized and cancelled calls',async()=>{
 vi.mocked(searchAuthority).mockRejectedValue(Error('Authority unavailable (HTTP 429)'));const signal=new AbortController();const result=await lookupAuthority({queries:['Michelangelo'],limit:1},signal.signal,'/vault',()=>signal.signal.throwIfAborted());expect(result.results[0]).toMatchObject({status:'unavailable',reason:expect.stringContaining('429')});
 await expect(lookupAuthority({queries:['a','b','c','d'],limit:1},signal.signal,'.',()=>{})).rejects.toThrow('budget');signal.abort();await expect(lookupAuthority({queries:['Michelangelo'],limit:1},signal.signal,'.',()=>signal.signal.throwIfAborted())).rejects.toThrow();
 const f=workspaceFixture(true,true,{authorityCache:false});clean.push(f.dispose);f.addHuman('Source');await expect(f.open().tool({id:'off',tool:'lookup_authority',arguments:{queries:['Michelangelo'],limit:1}})).rejects.toThrow('disabled');
});
