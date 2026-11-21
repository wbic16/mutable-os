/** Worker-only read authority for independently current saved projections.
 * SQL already validated these exact bytes. No rediscovery or Document decoding. */
import path from 'node:path';
import {NativeVaultStore} from './native-vault-store.mjs';
import {RecognizedDocumentStore} from './recognized-document-store.mjs';
import {verifySavedSourceBytes} from './recognized-source.mjs';

export function savedSourceVerifier(root){
 const store=new NativeVaultStore({root,readOnly:true}),recognized=new RecognizedDocumentStore(store);
 return async(resource,signal,budget)=>{
  const file=resource.path;
  const size=Number((await store.stamp(file)).split(':')[2]);
  budget.bytes+=size;if(budget.bytes>40*1024*1024)throw Error('Saved source verification byte budget exceeded');
  const pending=async()=>{if(await recognized.pending('.',resource.guid))throw Error('Document Save recovery is pending');};
  await pending();
  await verifySavedSourceBytes(store,'.',{resourceId:resource.guid,byteHash:resource.contentHash,location:{folder:path.posix.dirname(file),filename:path.posix.basename(file)}},signal);
  await pending();await store.guardReadPath(file);
 };
}
