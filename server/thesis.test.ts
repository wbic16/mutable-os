import {it,expect} from 'vitest';
import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';
import {SqliteKnowledgeHost} from './sqlite-knowledge-host';import {testCavern} from '../src/knowledge-sqlite/phext-test-cavern.mjs';
it('Thesis host owns the Vault lease and enforces flag, read-only and path boundaries',async()=>{
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'thesis-host-functional-')));const cavern=testCavern(root);
 let host=new SqliteKnowledgeHost({root,debounceMs:60000});
 try{
  await host.establish('.');const request={op:'create',id:crypto.randomUUID(),blockId:crypto.randomUUID(),operationId:crypto.randomUUID(),name:'Host claim',text:'Statement',annotations:[]};
  const saved=await host.propositions({vault:'.',request});expect(saved.proposition.name).toBe('Host claim');
  await expect(host.propositions({vault:'..',request:{op:'list'}})).rejects.toThrow();await host.close();
  host=new SqliteKnowledgeHost({root,readOnly:true});expect((await host.propositions({vault:'.',request:{op:'get',id:request.id}})).proposition.id).toBe(request.id);
  await expect(host.propositions({vault:'.',request})).rejects.toThrow(/read-only/);await host.close();
  host=new SqliteKnowledgeHost({root,thesisEnabled:false});await expect(host.propositions({vault:'.',request:{op:'list'}})).rejects.toThrow(/unavailable/);await host.close();
  host=new SqliteKnowledgeHost({root,entitiesEnabled:false});await expect(host.propositions({vault:'.',request:{op:'entities',request:{op:'names',ids:[]}}})).rejects.toThrow(/unavailable/);
 }finally{await host.close();cavern.close();await fs.rm(root,{recursive:true,force:true});}
});
