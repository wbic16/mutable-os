import {expect,it} from 'vitest';
import {verifyAuthorityCandidate} from './entity-authority-resolution';
import type {AuthorityRecord} from '../feature-api/entities';
const record:AuthorityRecord={provider:'wikidata',id:'Q762',name:'Leonardo da Vinci',description:'Italian Renaissance artist and engineer',aliases:['Leonardo'],url:'https://www.wikidata.org/wiki/Q762',retrievedAt:'2026-11-16T00:00:00Z',typeIds:['Q5'],classifications:['human','artist']};
it('never accepts a QID or name alone and requires type and contextual corroboration',()=>{
 expect(verifyAuthorityCandidate({name:'Leonardo',typename:'Person',description:'Italian artist and engineer'},record).accepted).toBe(true);
 for(const candidate of [{name:'Mercury',typename:'Person',description:record.description},{name:'Leonardo',typename:'Planet',description:record.description},{name:'Leonardo',typename:'Person',description:''}])expect(verifyAuthorityCandidate(candidate,record).accepted).toBe(false);
});

it('rejects contradictory significant dates even when the description agrees',()=>{
 const external={...record,dates:[{type:'birth',startYear:1452,precision:'year'}]};
 const local={name:record.name,typename:'Person',description:record.description,attributes:{enrichment:{dates:[{type:'birth',startYear:1453}]}}};
 expect(verifyAuthorityCandidate(local,external).accepted).toBe(false);
});
