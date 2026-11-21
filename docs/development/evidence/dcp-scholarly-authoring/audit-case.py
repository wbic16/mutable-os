"""Read-only comparison of retained provider output and a saved native Document."""
import collections, hashlib, json, pathlib, sys, xml.etree.ElementTree as ET
native,log=map(pathlib.Path,sys.argv[1:3]);envelope=json.loads(native.read_text());blocks=envelope['document']['blocks']
defs={k:v for b in blocks for k,v in b.get('properties',{}).get('linkedAnnotations',{}).items()}
turns={};errors=[];settings={};incomplete=[]
for line in log.open():
 r=json.loads(line);event=r['event'];data=r['data'];exchange=r.get('exchangeId')
 if event=='provider.turn' and data.get('text'):turns[exchange]=data
 if event=='exchange.error':errors.append({'exchange':exchange,**data})
 if event=='provider.response-body':
  for frame in data.get('body','').splitlines():
   if not frame.startswith('data: '):continue
   try:eventData=json.loads(frame[6:])
   except ValueError:continue
   if eventData.get('type')=='response.incomplete':
    response=eventData['response'];incomplete.append({'exchange':exchange,'status':response['status'],'reason':response.get('incomplete_details'),'usage':response.get('usage')})
 if event=='provider.request' and data.get('body'):
  body=json.loads(data['body'])
  if 'max_output_tokens' in body:settings[exchange]=body['max_output_tokens']
def nodes(value):
 if isinstance(value,dict):
  if 'markup' in value:yield value
  for v in value.values():yield from nodes(v)
 elif isinstance(value,list):
  for v in value:yield from nodes(v)
result={'nativeFile':str(native),'nativeSha256':hashlib.sha256(native.read_bytes()).hexdigest(),'logFile':str(log),'exchanges':[],'errors':errors,'incompleteProviderReceipts':incomplete}
for b in sorted(blocks,key=lambda b:b.get('properties',{}).get('metadata',{}).get('dialectic',{}).get('ordinal',0)):
 meta=b.get('properties',{}).get('metadata',{}).get('dialectic',{});dc=meta.get('dcp')
 if not dc:continue
 raw=dc['response'];value=json.loads(raw);ex=value['exchange'];turn=turns[ex];assert raw==turn['text']
 ids={k:v.get('entity',{}).get('entityId') for k,v in dc['identityMap'].items()}
 ids.update({e['handle']:e['identity']['entityId'] for e in dc['request'].get('semanticWorkspace',{}).get('entities',[])})
 expected=[]
 for node in nodes(value['composition']):
  assert not node.get('ranges');text='';marks=[]
  def visit(e):
   global text
   start=len(text);text+=e.text or ''
   for child in e:visit(child);text+=child.tail or ''
   if e.tag=='annotation' or e.tag in ['e','b','i']:
    kind=e.attrib.get('type') or {'e':'mutable/entity-reference','b':'style/bold','i':'style/italics'}[e.tag]
    marks.append((kind,start,len(text)-1,ids[e.attrib['ref']] if 'ref' in e.attrib else None))
  visit(ET.fromstring('<root>'+node['markup']+'</root>'))
  expected.extend((text,*p) for p in marks)
 actual=[]
 for n in blocks:
  text=''.join(c.get('text','') for c in n.get('inline',[]))
  for p in n.get('properties',{}).get('standoffProperties',[]):
   if p.get('metadata',{}).get('dcp',{}).get('exchangeId')==ex and p['type']!='dialectic/range-anchor':
    actual.append((text,p['type'],p['start'],p['end'],p.get('metadata',{}).get('entityReference',{}).get('entityId')))
 assert collections.Counter(expected)==collections.Counter(actual),(ex,'marks differ')
 for e in value.get('entities',[]):
  assert defs[ids[e['id']]]['metadata']['scopedEntity']['entity']['name']==e['name']
 for rel in value.get('relations',[]):
  ref=dc['identityMap'][rel['id']];d=defs[ref['definitionId']]['metadata'];r=d.get('scopedEntityRelation') or d['dialecticArgumentRelation'];assert r['relation']==rel['type']
  for side in ['from','to']:
   if rel['kind']=='entity':assert r[side]['entityId']==ids[rel[side]]
   else:assert r[side]['argumentId']==dc['identityMap'][rel[side]]['argumentId']
 result['exchanges'].append({'ordinal':meta['ordinal'],'exchange':ex,'responseMatchesWire':True,'allRequestedInlinePropertiesPersistedWithExactRangesAndIdentities':True,'entities':[e['name'] for e in value.get('entities',[])],'nativeMentions':sum(p[1]=='mutable/entity-reference' for p in actual),'inlineClassifications':sum(p[1].startswith('dialectic/') for p in actual),'sourceInterpretations':len(value.get('interpretations',[])),'arguments':len(value.get('arguments',[])),'relations':value.get('relations',[]),'glosses':len(value.get('glosses',[])),'responseBytes':len(raw.encode()),'maxOutputTokens':settings[ex],'receipt':turn['receipt']})
result['totals']={'entities':sum(len(r['entities']) for r in result['exchanges']),'mentions':sum(r['nativeMentions'] for r in result['exchanges']),'relations':sum(len(r['relations']) for r in result['exchanges'])}
print(json.dumps(result,indent=2,ensure_ascii=False))
