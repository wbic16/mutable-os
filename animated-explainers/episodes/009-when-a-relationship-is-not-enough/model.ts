import {namedRange, type StandoffRange} from '../../shared/TextRun';

export const entities = {
  michelangelo: {id:'michelangelo',name:['Michelangelo']},
  florence: {id:'florence',name:['Florence']},
  money: {id:'money',name:['Money']},
  brothers: {id:'brothers',name:['His brothers']},
  rome: {id:'rome',name:['Rome']},
  letter: {id:'letter',name:['A letter']},
  friend: {id:'friend',name:['A friend']},
} as const;

export type EntityId = keyof typeof entities;
export type Role = 'Sender' | 'Theme' | 'Recipient' | 'Origin';
export type Participant = {role:Role; entity:EntityId; mention:StandoffRange};
export type Claim = {
  id:'A'|'B'; type:'Sending'; participants:Participant[];
  source:{id:string; text:string; wrap:number; range:StandoffRange};
};

function sending(id: Claim['id'], documentId:string, text:string,
  refs:[Role,EntityId,string][]):Claim {
  return {id,type:'Sending',
    source:{id:documentId,text,wrap:text.indexOf(' to ')+1,range:namedRange('assertion-'+id,text,text)},
    participants:refs.map(([role,entity,words])=>({role,entity,mention:namedRange(entity,text,words)}))};
}

export const claims = [
  sending('A','02','Michelangelo sent money to his brothers from Rome.',[
    ['Sender','michelangelo','Michelangelo'],['Theme','money','money'],
    ['Recipient','brothers','his brothers'],['Origin','rome','Rome']]),
  sending('B','03','Michelangelo sent a letter to a friend from Florence.',[
    ['Sender','michelangelo','Michelangelo'],['Theme','letter','a letter'],
    ['Recipient','friend','a friend'],['Origin','florence','Florence']]),
];
export const residence = {from:'michelangelo',to:'florence',relation:'Lived in',
  documentId:'01',text:'Michelangelo lived in Florence.'} as const;

const verbs = {Theme:'sent',Recipient:'sent to',Origin:'sent from'};
export function flatten(claim:Claim) {
  const sender=claim.participants.find(p=>p.role==='Sender')!.entity;
  return claim.participants.flatMap(p=>p.role==='Sender' ? [] :
    [{from:sender,to:p.entity,label:verbs[p.role]}]);
}
