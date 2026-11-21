"""Inspect native, persisted occurrences, not just valid envelopes or object counts."""
import collections,json,pathlib,xml.etree.ElementTree as ET
root=pathlib.Path(__file__).parent;rows=[]
def objects(v):
 if isinstance(v,dict):
  yield v
  for x in v.values():yield from objects(x)
 elif isinstance(v,list):
  for x in v:yield from objects(x)
for variant in ['before','after']:
 texts={}
 for case in 'ABCDE':
  path=root/f'{variant}-{case}.json'
  if not path.exists():continue
  d=json.loads(path.read_text());v=d.get('response',{});ex=d['request']['exchange']
  if not d.get('admitted'):rows.append({'variant':variant,'case':case,'error':d.get('error')});continue
  for source in d['request']['structuralContext']['sources']:
   if source.get('target',{}).get('kind')=='block':texts[source['target']['blockId']]=source.get('text','')
  for n in objects(d['children']):
   if n.get('type')=='standoff-editor-block':texts[n['id']]=n['text']
  definitions={k:v for b in d['persisted'] for k,v in b['definitions'].items()}
  name=lambda id:definitions.get(id,{}).get('metadata',{}).get('scopedEntity',{}).get('entity',{}).get('name',id)
  marks=[(b['blockId'],p) for b in d['persisted'] for p in b['properties'] if p.get('metadata',{}).get('dcp',{}).get('exchangeId')==ex]
  mentions=[{'blockId':id,'start':p['start'],'end':p['end'],'text':texts.get(id,'')[p['start']:p['end']+1],'entity':name(p['metadata']['entityReference']['entityId']),'entityId':p['metadata']['entityReference']['entityId'],'sourceAuthor':p['metadata']['dcp']['sourceAuthor'],'appliedTo':p['metadata']['dcp']['appliedTo']} for id,p in marks if p['type']=='mutable/entity-reference']
  expectedMentions=sum(1 for n in objects(v['composition']) if 'markup' in n for e in ET.fromstring('<root>'+n['markup']+'</root>').iter() if e.tag=='e' or e.attrib.get('type')=='mutable/entity-reference')+sum(1 for n in objects(v['composition']) for p in n.get('ranges',[]) if p['type']=='mutable/entity-reference')+sum(1 for p in v.get('interpretations',[]) if p['type']=='mutable/entity-reference')
  assert expectedMentions==len(mentions),(variant,case,'lost mentions')
  refs=[]
  for id,p in marks:
   if p['type']=='mutable/gloss':refs.append({'target':texts.get(id,'')[p['start']:p['end']+1],'value':definitions[p['annotationId']]['value'],'sourceAuthor':p['metadata']['dcp']['sourceAuthor']})
  relations=[]
  for definition in d['definitions'].values():
   r=definition.get('metadata',{}).get('scopedEntityRelation')
   if r:relations.append([name(r['from']['entityId']),r['relation'],name(r['to']['entityId'])])
  rows.append({'variant':variant,'case':case,'newEntities':[e['name'] for e in v.get('entities',[])],'mentions':mentions,'allGeneratedMentionsPersisted':True,'entityRelations':relations,'argumentRelations':[r for r in v.get('relations',[]) if r['kind']=='argument'],'arguments':len(v.get('arguments',[])),'classifications':collections.Counter(p['type'] for _,p in marks if p['type'].startswith('dialectic/') and p['type']!='dialectic/range-anchor'),'sourceInterpretations':len(v.get('interpretations',[])),'glosses':refs,'lastOutputTokens':d['turns'][-1]['receipt']['usage']['output_tokens'],'repairs':d['repaired']})
(root/'coverage.json').write_text(json.dumps(rows,indent=2,ensure_ascii=False)+'\n')
for r in rows:
 print(r['variant'],r['case'],r.get('error') or {'new':len(r['newEntities']),'mentions':len(r['mentions']),'sourceMentions':sum(m['appliedTo']=='existing-source' for m in r['mentions']),'entityRelations':len(r['entityRelations']),'glosses':len(r['glosses']),'output':r['lastOutputTokens']})
