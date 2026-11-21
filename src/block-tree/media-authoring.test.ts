import {expect,it,vi} from 'vitest';
import {externalMediaUrl,prepareExternalImage,prepareImage,prepareVideoReference,prepareWebsiteEmbed} from './media-authoring';
import {resourceBlock} from '../interchange/resource-url';
import {inspectUri,videoFragment} from '../interchange/uri';
import {materializeFragment} from '../interchange/materialize';
import {prepareYouTube} from './native-authoring';
import {standoffStyleSchemas} from '../rendering/standoff-styles';
const root=(fragment:ReturnType<typeof materializeFragment>)=>fragment.state.contents[fragment.state.placements[fragment.roots[0]].contentKey];
it('shares native image, URI video and explicit iframe preparation without acquiring or probing',()=>{
 const fetcher=vi.spyOn(globalThis,'fetch');
 try{
  const image=prepareExternalImage('https://images.example.org/a.jpg','Architecture');expect({...image,id:null}).toEqual({...prepareImage('https://images.example.org/a.jpg','Architecture'),id:null});expect(image.asset).toBeUndefined();
  expect(prepareImage('/local/image.png').metadata).toEqual({url:'/local/image.png'});expect(prepareImage('blob:https://example.org/id').type).toBe('image-block');
  const url='https://vimeo.com/76979871',video=root(prepareVideoReference(url)),human=root(materializeFragment(videoFragment(inspectUri(url).video!)));
  expect({...video.payload,id:null}).toEqual({...human.payload,id:null});expect(video.viewType).toBe('mutable/video-block');
  const web='https://example.org/page',embed=root(prepareWebsiteEmbed(web)),native=root(resourceBlock(web).native);
  expect({...embed.payload,id:null}).toEqual({...native.payload,id:null});expect(embed.payload.metadata).toMatchObject({resourceEmbed:true,height:600});expect(fetcher).not.toHaveBeenCalled();
 }finally{fetcher.mockRestore();}
});
it.each(['javascript:alert(1)','data:image/png,abc','file:///tmp/a','blob:https://example.org/id','/local.png','//example.org/image','https://user:secret@example.org/a','https://example.org:8443/a','https://localhost/a','http://localhost./a','https://host.local/a','http://intranet/a','http://127.0.0.1/a','http://2130706433/a','http://0x7f000001/a','http://10.1.2.3/a','http://192.168.1.1/a','http://172.20.1.1/a','http://169.254.169.254/a','http://100.64.0.1/a','http://[::1]/a','http://[fc00::1]/a','http://[::ffff:8.8.8.8]/a','https://example.org/\\evil','https://example.org/a\nb'])('rejects unsafe external media input %s',url=>{
 for(const prepare of [(u:string)=>prepareExternalImage(u,'image'),prepareVideoReference,prepareWebsiteEmbed])expect(()=>prepare(url)).toThrow();
});
it('validates provider IDs and share URLs without silently making unsupported videos into iframes',()=>{
 for(const url of ['https://vimeo.com/76979871?share=copy','https://youtu.be/M7lc1UVf-VE?si=share','https://youtube.com/watch?v=M7lc1UVf-VE&t=10'])expect(root(prepareVideoReference(url)).payload.video).toBeDefined();
 for(const url of ['https://example.org/a.mp4','https://vimeo.com/76979871?h=secret','https://vimeo.com/not-id','https://youtube.com.attacker.test/watch?v=M7lc1UVf-VE','https://youtube.com/watch?v=bad','https://youtube.com/watch?v=M7lc1UVf-VE&v=abcdefghijk'])expect(()=>prepareVideoReference(url)).toThrow();
 for(const url of ['https://user:pass@youtube.com/watch?v=M7lc1UVf-VE','https://youtube.com:8443/watch?v=M7lc1UVf-VE'])expect(()=>prepareYouTube(url)).toThrow();
 expect(prepareYouTube('M7lc1UVf-VE').type).toBe('youtube-video-block');
 expect(()=>prepareWebsiteEmbed('https://example.org/image.png')).toThrow();expect(()=>prepareExternalImage('https://example.org/image','x'.repeat(1025))).toThrow();
 expect(externalMediaUrl('https://example.org:443/a')).toBe('https://example.org/a');
});
it('keeps PDF/IIIF and website hyperlinks as native references, without fabricated captures',()=>{
 const prepare=standoffStyleSchemas['reference/url'].authoring!.prepare;
 for(const value of ['https://example.org/paper.pdf','https://example.org/iiif/manifest.json','https://example.org/page','mailto:reader@example.org'])expect(prepare({value},'standoff-editor-block')).toEqual({value});
 expect(()=>prepare({value:'https://user:secret@example.org/paper.pdf'},'standoff-editor-block')).toThrow();
});
