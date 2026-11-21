// @vitest-environment jsdom
import {expect,it} from 'vitest';
import {semanticThumbnail} from './semantic-thumbnail';
import type {EntityAuthorityState} from '../../application/entity-authority-resolution';

it('prefers the live canonical image and retains local or verified authority fallbacks',()=>{
 const asset={kind:'managed' as const,cavernId:'vault',assetId:'sha256:'+'a'.repeat(64)},canonical={id:'canonical',name:'Ada',revision:1,aliases:[],imageRef:asset};
 const state:EntityAuthorityState={status:'linked',canonical,record:{provider:'wikidata',id:'Q1',name:'Ada',description:'',aliases:[],url:'https://example.org',retrievedAt:'',thumbnail:{url:'https://example.org/authority.png'}}};
 const entity={attributes:{enrichment:{thumbnail:{url:'https://example.org/local.png'}}}};
 expect(semanticThumbnail(entity,state)).toEqual({asset,url:'https://example.org/local.png'});
 expect(semanticThumbnail({},state)).toEqual({asset,url:'https://example.org/authority.png'});
 expect(semanticThumbnail({},{...state,status:'ambiguous'})).toEqual({asset:undefined,url:undefined});
 expect(semanticThumbnail({},{...state,canonical:{...canonical,deletedUtc:'deleted'}}).asset).toBeUndefined();
 expect(semanticThumbnail({attributes:{enrichment:{thumbnail:{url:'javascript:alert(1)'}}}}).url).toBeUndefined();
});
