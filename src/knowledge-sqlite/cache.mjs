/** Generic versioned JSON cache. Canonical identity mappings remain in ExternalIdentity. */
export function sharedCache(db,request,now=Date.now()){
 const {op,key}=request??{};
 if(typeof key!=='string'||!key||key.length>1024||/[\x00-\x1f]/.test(key))throw Error('Invalid cache key');
 if(op==='get'){
  const row=db.prepare('SELECT * FROM Cache WHERE key=?').get(key);if(!row)return null;
  let value;try{value=JSON.parse(row.value);}catch{return null;}
  return {key,value,createdAt:row.createdAt,updatedAt:row.updatedAt,expiresAt:row.expiresAt,stale:row.expiresAt!==null&&Date.parse(row.expiresAt)<=now};
 }
 if(op==='invalidate'){db.prepare('DELETE FROM Cache WHERE key=?').run(key);return {invalidated:true};}
 if(op!=='set')throw Error('Unsupported cache operation');
 const {value,ttl=86400000}=request;
 if(!value||typeof value!=='object'||Array.isArray(value)||!Number.isSafeInteger(value.schemaVersion)||value.schemaVersion<1)throw Error('Cache values need a schemaVersion');
 const encoded=JSON.stringify(value);if(Buffer.byteLength(encoded)>2_000_000||!Number.isFinite(ttl)||ttl<1000||ttl>365*86400000)throw Error('Cache budget exceeded');
 const stamp=new Date(now).toISOString(),expires=new Date(now+ttl).toISOString();
 db.prepare('INSERT INTO Cache(key,value,createdAt,updatedAt,expiresAt) VALUES(?,?,?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updatedAt=excluded.updatedAt,expiresAt=excluded.expiresAt').run(key,encoded,stamp,stamp,expires);
 // Bounded storage; stale data is retained until the cache reaches its capacity.
 db.prepare('DELETE FROM Cache WHERE key IN (SELECT key FROM Cache ORDER BY updatedAt DESC LIMIT -1 OFFSET 4096)').run();
 return {stored:true};
}
