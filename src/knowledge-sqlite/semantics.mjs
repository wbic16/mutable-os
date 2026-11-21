import {resolveDocumentEntity} from './entity-resolution.mjs';
import {guid,expected,canonicalTables} from './canonical-ledger.mjs';
import {sqlRevision} from './reconcile.mjs';
import {decodeAuthoredValue} from '../history/preplan-spike/authored-values.mjs';
import {canonicalEntities,entityMutation,entityCommand} from './entities.mjs';
const own=(o,k)=>Object.hasOwn(o,k);
const text=(v,nullable=false,max=100000)=>{if(nullable&&v===null)return v;if(typeof v!=='string'||v.length>max||!nullable&&!v.trim())throw Error('Invalid text field');return v;};
const integer=v=>{if(v!==null&&!Number.isSafeInteger(v))throw Error('Invalid integral component');return v;};
const ordinal=v=>{expected(v);return v;};
const authored=v=>{decodeAuthoredValue(v);return JSON.stringify(v);};
const valueType=v=>v===null?'null':Array.isArray(v)?'array':typeof v;
const timeParts=['start','end'].flatMap(p=>['Year','Month','Day','Hour','Minute','Second'].map(c=>p+c));
const columns={
 Time:['expression',...timeParts,'precision','approximation','certainty','extentKind','qualifier','normalizationProfile','lowerBoundDay','upperBoundDayExclusive'],
 Claim:['expression','typename'],ClaimParticipant:['claimGuid','entityGuid','role','ordinal'],ClaimQualifier:['claimGuid','entityGuid','role','ordinal'],
 ClaimEvidence:['claimGuid','resourceGuid','blockGuid','authoredPropertyId','sourceContentHash','startIndex','endIndex','coordinate','evidenceKind','excerpt'],
 DataSet:['name'],DataPoint:['name','valueJson','valueType','normalizedNumber','normalizationProfile'],
 DataPointDimension:['dataPointGuid','entityGuid','role','ordinal'],DataSetMembership:['dataSetGuid','dataPointGuid']
};
const childParent={ClaimParticipant:['Claim','claimGuid'],ClaimQualifier:['Claim','claimGuid'],ClaimEvidence:['Claim','claimGuid'],DataPointDimension:['DataPoint','dataPointGuid'],DataSetMembership:['DataSet','dataSetGuid']};
const aggregateChildren=t=>t==='Claim'?[['participants','ClaimParticipant'],['qualifiers','ClaimQualifier']]:t==='DataPoint'?[['dimensions','DataPointDimension']]:[];
function validateWrite(t,input){
 if(t==='DataPoint'&&(own(input,'datasetGuid')||own(input,'dataSetGuid')))throw Error('DataPoint has no collection ownership; use DataSetMembership');
 const allowed=new Set([...columns[t].filter(f=>f!=='valueJson'),'attributes','guid','op','recordType','operationId','actorGuid','expectedRevision','expectedParentRevision','expectedDataSetRevision',
  ...(t==='Time'?['entityGuid','entity','expectedEntityRevision']:t==='Claim'?['kind','participants','qualifiers']:t==='DataPoint'?['value','dimensions']:[])]);
 for(const key of Object.keys(input))if(!allowed.has(key))throw Error(`Unsupported ${t} field: ${key}`);
 if(t==='Claim'&&own(input,'kind')&&own(input,'typename')&&input.kind!==input.typename)throw Error('Claim kind and typename differ');
 if(t==='Time'&&own(input,'guid')&&own(input,'entityGuid')&&input.guid!==input.entityGuid)throw Error('Time and Entity identities differ');
 if(t==='Time'&&own(input,'entity')){
  if(input.op!=='create'&&input.op!=='add')throw Error('Update Time display metadata through the Entity service');
  if(!input.entity||typeof input.entity!=='object'||Array.isArray(input.entity))throw Error('Invalid Time Entity metadata');
  for(const key of Object.keys(input.entity))if(!['name','attributes'].includes(key))throw Error(`Unsupported Time Entity field: ${key}`);
 }
}
const identity=t=>t==='Time'?'entityGuid':'guid';
const read=(db,t,id)=>db.prepare(`SELECT * FROM ${t} WHERE ${identity(t)}=?`).get(id);
function wire(row){if(!row)return undefined;const r={...row};delete r.id;for(const f of ['attributes','valueJson'])if(r[f]!==undefined&&r[f]!==null)r[f]=JSON.parse(r[f]);if(own(r,'valueJson')){r.value=r.valueJson;delete r.valueJson;}return r;}
function present(db,t,id){guid(id);const row=read(db,t,id);if(!row)throw Error(`${t} endpoint missing`);return row;}
function fresh(db,t,id){guid(id);for(const table of canonicalTables){if(table===t||t==='Time'&&table==='Entity')continue;const exists=db.prepare(`SELECT 1 FROM ${table} WHERE ${identity(table)}=?`).get(id);if(exists)throw Error('Canonical GUID belongs to another record kind');}}
function fields(t,input,old){
 const r={};for(const f of [...columns[t],'attributes']){
  if(f==='attributes'){r[f]=own(input,f)?authored(input[f]):old?.[f]??null;continue;}
  if(t==='Claim'&&f==='typename'&&own(input,'kind'))r[f]=input.kind;
  else if(t==='DataPoint'&&f==='valueJson')r[f]=own(input,'value')?authored(input.value):old?.valueJson;
  else r[f]=own(input,f)?input[f]:old?.[f]??null;
 }
 if(['Time','Claim','DataSet','DataPoint'].includes(t))for(const f of ['expression','typename','name'])if(own(r,f))text(r[f],true);
 if(t==='Time'){
  for(const f of [...timeParts,'lowerBoundDay','upperBoundDayExclusive'])integer(r[f]);
  for(const f of ['precision','approximation','certainty','extentKind','qualifier','normalizationProfile'])text(r[f],true,256);
  // Phase 1 stores raw components; no inferred temporal normalization profile is adopted.
  if(r.normalizationProfile!==null||r.lowerBoundDay!==null||r.upperBoundDayExclusive!==null)throw Error('Temporal normalization profile unsupported; retain raw components');
 }
 if(t==='DataPoint'){
  if(r.valueJson===undefined)throw Error('Authored observation value required');const v=decodeAuthoredValue(JSON.parse(r.valueJson));
  if(input.valueType===undefined&&(own(input,'value')||!old))r.valueType=valueType(v);
  if(r.valueType!==valueType(v))throw Error('Observation valueType differs from authored value');
  if(r.normalizedNumber!==null||r.normalizationProfile!==null)throw Error('Numeric normalization profile unsupported; retain raw value');
 }
 if(childParent[t]){
  guid(r[childParent[t][1]]);
  if(own(r,'entityGuid'))guid(r.entityGuid);
  if(own(r,'ordinal'))ordinal(r.ordinal);
  if(own(r,'role'))text(r.role,t==='ClaimParticipant',256);
 }
 if(t==='ClaimEvidence'){
  text(r.resourceGuid);text(r.blockGuid);text(r.authoredPropertyId,true);text(r.sourceContentHash,false,512);text(r.evidenceKind,false,256);text(r.excerpt,true);
  ordinal(r.startIndex);ordinal(r.endIndex);if(r.endIndex<r.startIndex||!['cell','utf16'].includes(r.coordinate))throw Error('Invalid evidence span');
 }
 if(t==='DataSetMembership')guid(r.dataPointGuid);
 return r;
}
function targets(db,t,row){
 if(childParent[t])present(db,...[childParent[t][0],row[childParent[t][1]]]);
 if(row.entityGuid){const e=present(db,'Entity',row.entityGuid);
  if((t==='ClaimQualifier'&&row.role==='at-time'||t==='DataPointDimension'&&row.role==='time')&&(e.typename!=='Time'||!read(db,'Time',row.entityGuid)))throw Error('Temporal qualification/dimension requires Entity(Time) extension');
  if(t==='ClaimQualifier'&&row.role==='type-of'&&e.typename!=='Concept')throw Error('type-of Claim qualification requires Concept Entity');
 }
 if(t==='DataSetMembership')present(db,'DataPoint',row.dataPointGuid);
}
function bump(db,ctx,t,id,revision){
 expected(revision);ctx.change(t,id,()=>{if(!db.prepare(`UPDATE ${t} SET revision=revision+1,lastUpdatedByActorGuid=?,modifiedUtc=? WHERE ${identity(t)}=? AND revision=?`).run(ctx.actorGuid,ctx.now,id,revision).changes)throw Error(`${t} revision changed or missing`);});
}
function childCheck(db,t,input,row){
 const [parent,key]=childParent[t],parentRow=present(db,parent,row[key]);
 const revision=t==='DataSetMembership'?input.expectedDataSetRevision:input.expectedParentRevision;
 if(parentRow.revision!==expected(revision))throw Error(`${parent} revision changed or missing`);return [parent,row[key],revision];
}
function write(db,ctx,t,input,{aggregate=false}={}){
 if(!columns[t])throw Error('Unsupported semantic record type');
 validateWrite(t,input);
 if(own(input,'recordType')&&input.recordType!==t)throw Error('Incidence record type differs');
 if(aggregate&&(own(input,'operationId')||own(input,'actorGuid')))throw Error('Aggregate operation identity/Actor belong to the outer mutation');
 const id=guid(input.guid??input.entityGuid),old=read(db,t,id),op=input.op;
 if(!['create','add','update','remove'].includes(op))throw Error('Unsupported semantic mutation');
 if(op==='remove'&&!childParent[t])throw Error('Parent deletion is unavailable in Phase 1');
 if(op==='update'||op==='remove'){if(!old||old.revision!==expected(input.expectedRevision))throw Error(`${t} revision changed or missing`);}
 let row=op==='remove'?old:fields(t,input,old);
 if(old&&childParent[t]){
  const immutable=t==='DataSetMembership'?['dataSetGuid','dataPointGuid']:[childParent[t][1]];
  for(const f of immutable)if(row[f]!==old[f])throw Error('Incidence endpoints are immutable; remove/add explicitly');
 }
 if(op!=='remove')targets(db,t,row);
 let parent;
 if(childParent[t]&&!aggregate)parent=childCheck(db,t,input,row);
 if(op==='create'||op==='add'){
  fresh(db,t,id);
  if(t==='DataSetMembership'){
   const pair=db.prepare('SELECT * FROM DataSetMembership WHERE dataSetGuid=? AND dataPointGuid=?').get(row.dataSetGuid,row.dataPointGuid);
   if(pair&&pair.guid!==id)throw Error('Membership pair already exists with another GUID');
  }
  if(old){
   const equal=[...columns[t],'attributes'].every(f=>old[f]===row[f]);if(!equal)throw Error(`${t} GUID already exists with different data`);
   if(t==='Time'&&own(input,'entity')){
    const entity=present(db,'Entity',id),attrs=own(input.entity,'attributes')?authored(input.entity.attributes):null;
    if(entity.name!==text(input.entity.name)||entity.attributes!==attrs)throw Error('Time Entity GUID already exists with different data');
   }
   for(const [key,child]of aggregateChildren(t))if(own(input,key)){
    if(!Array.isArray(input[key])||input[key].length>100)throw Error('Aggregate incidence budget exceeded');
    const stored=db.prepare(`SELECT * FROM ${child} WHERE ${childParent[child][1]}=? ORDER BY ordinal LIMIT 101`).all(id);
    const wanted=input[key].map(item=>{
     if(own(item,'operationId')||own(item,'actorGuid'))throw Error('Aggregate operation identity/Actor belong to the outer mutation');
     const command={...item,op:'create',[childParent[child][1]]:id};validateWrite(child,command);guid(item.guid);
     return {guid:item.guid,...fields(child,command)};
    }).sort((a,b)=>a.ordinal-b.ordinal);
    if(stored.length!==wanted.length||stored.some((record,i)=>['guid',...columns[child],'attributes'].some(f=>record[f]!==wanted[i][f])))throw Error(`${t} GUID already exists with different ${key}`);
   }
   return {record:wire(old),outcome:'already-equivalent'};
  }
  if(t==='Time'){
   const entity=read(db,'Entity',id);
   if(entity){if(entity.typename!=='Time'||entity.revision!==expected(input.expectedEntityRevision))throw Error('Existing Time Entity type/revision differs');if(own(input,'entity'))throw Error('Existing Time display metadata must be updated through the Entity service');}
   else{
    const name=text(input.entity?.name),attrs=input.entity?.attributes===undefined?null:authored(input.entity.attributes);
    ctx.change('Entity',id,()=>db.prepare('INSERT INTO Entity(guid,typename,name,nameKey,attributes,createdByActorGuid,createdUtc,lastUpdatedByActorGuid,modifiedUtc) VALUES(?,?,?,?,?,?,?,?,?)').run(id,'Time',name,name.normalize('NFKC').toLowerCase(),attrs,ctx.actorGuid,ctx.now,ctx.actorGuid,ctx.now));
   }
  }
  ctx.change(t,id,()=>{const data={[identity(t)]:id,...row,createdByActorGuid:ctx.actorGuid,createdUtc:ctx.now,lastUpdatedByActorGuid:ctx.actorGuid,modifiedUtc:ctx.now};db.prepare(`INSERT INTO ${t}(${Object.keys(data).join(',')}) VALUES(${Object.keys(data).map(()=>'?').join(',')})`).run(...Object.values(data));});
 }else if(op==='update'){
  if(t==='Time'&&present(db,'Entity',id).typename!=='Time')throw Error('Time Entity type changed');
  ctx.change(t,id,()=>db.prepare(`UPDATE ${t} SET ${Object.keys(row).map(f=>f+'=?').join(',')},revision=revision+1,lastUpdatedByActorGuid=?,modifiedUtc=? WHERE ${identity(t)}=? AND revision=?`).run(...Object.values(row),ctx.actorGuid,ctx.now,id,input.expectedRevision));
 }else ctx.change(t,id,()=>db.prepare(`DELETE FROM ${t} WHERE guid=? AND revision=?`).run(id,input.expectedRevision));
 if(parent)bump(db,ctx,...parent);
 if(op==='remove')return {removed:true,guid:id};
 const record=wire(read(db,t,id));
 if(t==='Claim'&&(own(input,'participants')||own(input,'qualifiers'))||t==='DataPoint'&&own(input,'dimensions')){
  if(op==='update')throw Error('Edit aggregate children with revision-checked child commands in a batch');
  for(const [key,child]of aggregateChildren(t)){
   if(!own(input,key))continue;if(!Array.isArray(input[key])||input[key].length>100)throw Error('Aggregate incidence budget exceeded');
   for(const item of input[key])write(db,ctx,child,{...item,op:'create',[childParent[child][1]]:id},{aggregate:true});
  }
 }
 return {record};
}
function query(db,request,check){
 const t=request.recordType;if(!columns[t])throw Error('Unsupported semantic record type');
 const queryFields=new Set(['recordType','op','filters','limit','after','revision',...aggregateChildren(t).map(([key])=>key),...(t==='DataPoint'?['dataSetGuids','membershipMode']:[])]);
 for(const key of Object.keys(request))if(!queryFields.has(key))throw Error(`Unsupported ${t} query field: ${key}`);
 const limit=request.limit??100;if(!Number.isInteger(limit)||limit<1||limit>100)throw Error('Invalid query limit');
 const where=[],args=[],alias='r';
 const filters=request.filters??{};if(typeof filters!=='object'||filters===null||Array.isArray(filters))throw Error('Invalid semantic filters');
 const orderedParent=childParent[t]&&columns[t].includes('ordinal')&&typeof filters[childParent[t][1]]==='string';
 if(request.after!==undefined){
  if(request.op==='count')throw Error('Count queries do not accept a pagination cursor');text(request.after,false,512);
  if(orderedParent){const cursor=JSON.parse(request.after);if(!Array.isArray(cursor)||cursor.length!==2)throw Error('Invalid incidence cursor');ordinal(cursor[0]);guid(cursor[1]);where.push('(r.ordinal>? OR (r.ordinal=? AND r.guid>?))');args.push(cursor[0],cursor[0],cursor[1]);}
  else{where.push(`r.${identity(t)}>?`);args.push(request.after);}
 }
 const allowed=[...columns[t].filter(f=>f!=='valueJson'),identity(t)];
 for(const [key,value]of Object.entries(filters)){
  if(!allowed.includes(key))throw Error('Unsupported semantic filter');
  if(t==='Time'&&['normalizationProfile','lowerBoundDay','upperBoundDayExclusive'].includes(key)&&value!==null)throw Error('Temporal normalization profile unsupported');
  if(t==='DataPoint'&&['normalizationProfile','normalizedNumber'].includes(key)&&value!==null)throw Error('Numeric normalization profile unsupported');
  if(value===null)where.push(`r.${key} IS NULL`);else{if(!['string','number'].includes(typeof value))throw Error('Invalid semantic filter');where.push(`r.${key}=?`);args.push(value);}
 }
 const incidences=t==='Claim'?[['participants','ClaimParticipant','claimGuid'],['qualifiers','ClaimQualifier','claimGuid']]:t==='DataPoint'?[['dimensions','DataPointDimension','dataPointGuid']]:[];
 for(const [key,child,parent]of incidences){
  const rows=request[key]??[];if(!Array.isArray(rows)||rows.length>32)throw Error('Invalid incidence query');
  for(const row of rows){check();if(!row||typeof row!=='object'||Array.isArray(row)||Object.keys(row).some(k=>!['role','entityGuid'].includes(k)))throw Error('Invalid incidence filter');const terms=[`x.${parent}=r.guid`];for(const f of ['role','entityGuid'])if(own(row,f)){if(f==='entityGuid')guid(row[f]);else text(row[f],child==='ClaimParticipant',256);if(row[f]===null)terms.push(`x.${f} IS NULL`);else{terms.push(`x.${f}=?`);args.push(row[f]);}}
   where.push(`EXISTS(SELECT 1 FROM ${child} x WHERE ${terms.join(' AND ')})`);
  }
 }
 if(t==='DataPoint'&&request.dataSetGuids!==undefined){
  const ids=request.dataSetGuids;if(!Array.isArray(ids)||!ids.length||ids.length>32)throw Error('Invalid collection query');ids.forEach(guid);
  if(request.membershipMode!==undefined&&!['union','intersection'].includes(request.membershipMode))throw Error('Invalid membership mode');
  if(request.membershipMode==='intersection')for(const id of new Set(ids)){where.push('EXISTS(SELECT 1 FROM DataSetMembership m WHERE m.dataPointGuid=r.guid AND m.dataSetGuid=?)');args.push(id);}
  else{where.push(`EXISTS(SELECT 1 FROM DataSetMembership m WHERE m.dataPointGuid=r.guid AND m.dataSetGuid IN (${ids.map(()=>'?').join(',')}))`);args.push(...ids);}
 }
 const clause=where.length?' WHERE '+where.join(' AND '):'';
 if(request.op==='count')return {count:db.prepare(`SELECT count(*) AS n FROM ${t} r${clause}`).get(...args).n,complete:true,diagnostics:[]};
 const rows=db.prepare(`SELECT r.* FROM ${t} ${alias}${clause} ORDER BY ${orderedParent?'r.ordinal,r.guid':`r.${identity(t)}`} LIMIT ?`).all(...args,limit+1),complete=rows.length<=limit;
 return {items:rows.slice(0,limit).map(wire),complete,nextAfter:complete?undefined:orderedParent?JSON.stringify([rows[limit-1].ordinal,rows[limit-1].guid]):rows[limit-1][identity(t)],diagnostics:[]};
}
export const semanticMutation=r=>r?.op==='identity-commit'||r?.op==='batch'||['create','add','update','remove'].includes(r?.op);
/** Typed canonical operations; shared transaction ledger owns audit and revisions. */
export function canonicalSemantics(db,ledger,request,check=()=>{}){
 check();if(!request||typeof request!=='object'||Buffer.byteLength(JSON.stringify(request))>32768)throw Error('Semantic request budget exceeded');
 if(['identity-preview','identity-commit'].includes(request.op))return resolveDocumentEntity(db,ledger,request,check);
 if(semanticMutation(request))return ledger.mutate(request,ctx=>{
  if(request.op==='batch'){
   if(!Array.isArray(request.commands)||!request.commands.length||request.commands.length>100)throw Error('Canonical batch budget exceeded');
   const results=[];for(const command of request.commands){check();if(own(command,'operationId')||own(command,'actorGuid'))throw Error('Batch operation identity/Actor belong to the outer mutation');if(command.recordType==='Entity'||command.recordType==='Relationship'){
    const input={...entityCommand(command),operationId:request.operationId,actorGuid:request.actorGuid};
    if(!entityMutation(input.op))throw Error('Batch Entity mutation required');
    // Reuse Entity validation/actions in the enclosing transaction, without a nested receipt.
    results.push(canonicalEntities(db,input,check,{mutate:(_r,perform)=>perform(ctx)}));
   }else results.push(write(db,ctx,command.recordType,command));}
   return {results};
  }
  return write(db,ctx,request.recordType,request);
 },check);
 return db.transaction(()=>{
  check();const revision=sqlRevision(db);if(request.revision!==undefined&&request.revision!==revision)throw Error('Canonical query snapshot expired');let result;
  if(request.op==='current')result={};
  else if(request.op==='get'){
   if(!columns[request.recordType])throw Error('Unsupported semantic record type');guid(request.guid);const record=wire(read(db,request.recordType,request.guid));
   if(record&&request.recordType==='Claim')for(const [key,t]of [['participants','ClaimParticipant'],['qualifiers','ClaimQualifier'],['evidence','ClaimEvidence']]){
    const rows=db.prepare(`SELECT * FROM ${t} WHERE claimGuid=? ORDER BY ${t==='ClaimEvidence'?'guid':'ordinal'} LIMIT 101`).all(request.guid);record[key]=rows.slice(0,100).map(wire);if(rows.length>100)record.childrenIncomplete=true;
   }
   if(record&&request.recordType==='DataPoint'){const rows=db.prepare('SELECT * FROM DataPointDimension WHERE dataPointGuid=? ORDER BY ordinal LIMIT 101').all(request.guid);record.dimensions=rows.slice(0,100).map(wire);if(rows.length>100)record.childrenIncomplete=true;}
   result={record,complete:!record?.childrenIncomplete,diagnostics:record?.childrenIncomplete?['Aggregate incidences truncated; page child records']:[]};
  }else if(request.op==='query'||request.op==='count')result=query(db,request,check);
  else if(request.op==='members'){const {dataSetGuid,...options}=request;result=query(db,{...options,op:'query',recordType:'DataPoint',dataSetGuids:[guid(dataSetGuid)]},check);}
  else if(request.op==='collections'){
   if(request.after!==undefined)text(request.after,false,512);
   guid(request.dataPointGuid);const limit=request.limit??100;if(!Number.isInteger(limit)||limit<1||limit>100)throw Error('Invalid query limit');
   const rows=db.prepare('SELECT s.* FROM DataSetMembership m JOIN DataSet s ON s.guid=m.dataSetGuid WHERE m.dataPointGuid=? AND m.dataSetGuid>? ORDER BY m.dataSetGuid LIMIT ?').all(request.dataPointGuid,request.after??'',limit+1);
   result={items:rows.slice(0,limit).map(wire),complete:rows.length<=limit,nextAfter:rows.length>limit?rows[limit-1].guid:undefined,diagnostics:[]};
  }else throw Error('Unsupported semantic read');
  check();if(Buffer.byteLength(JSON.stringify(result))>2*1024*1024)throw Error('Semantic response budget exceeded');return {...result,revision};
 }).deferred();
}
