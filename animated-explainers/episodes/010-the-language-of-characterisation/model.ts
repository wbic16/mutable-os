import {namedRange} from '../../shared/TextRun';

function entity(id:string,label:string) { return {id,name:[label]}; }
export const entities = {
  venetians:entity('venetians','Venetians'),landucci:entity('landucci','Luca Landucci'),
  merchants:entity('merchants','Merchants'),ambassadors:entity('ambassadors','Ambassadors'),courtiers:entity('courtiers','Courtiers'),
  a:entity('a','Observer A'),b:entity('b','Observer B'),c:entity('c','Observer C'),d:entity('d','Observer D'),e:entity('e','Observer E'),
};
export const concepts = {
  distrust:'Untrustworthy',resourceful:'Resourceful',ambitious:'Ambitious',unreliable:'Unreliable',
  dimension:'Trustworthiness',opposite:'Trustworthy',
};
export type EntityId=keyof typeof entities;
export type ConceptId=keyof typeof concepts;

function record(id:string,subject:EntityId,observer:EntityId,trait:ConceptId,document:string,
  text:string,subjectWords:string,expression:string,diary=false) {
  return {id,subject,observer,trait,source:{document,text,diary,
    title:diary?'Florentine Diary':'Hypothetical passage',
    qualification:diary?'Illustrative English rendering':'Hypothetical example',
    context:diary?'Recorded in Landucci’s Florentine Diary':undefined,
    subject:namedRange('subject',text,subjectWords),expression:namedRange('expression',text,expression)}};
}

export const records=[
  record('A','venetians','landucci','distrust','01','The Venetians are untrustworthy.','Venetians','untrustworthy',true),
  record('B','venetians','a','resourceful','02','The Venetians were resourceful in negotiation.','Venetians','resourceful'),
  record('C','venetians','b','ambitious','03','The Venetians seemed ambitious.','Venetians','ambitious'),
  record('D','merchants','c','distrust','04','These merchants were untrustworthy.','merchants','untrustworthy'),
  record('E','ambassadors','d','distrust','05','The ambassadors were not to be trusted.','ambassadors','not to be trusted'),
  record('F','courtiers','e','unreliable','06','The courtiers proved unreliable.','courtiers','unreliable'),
];
export type TraitStatement=typeof records[number];
export const anchor=records[0];
export const usage=(r:TraitStatement)=>r.source.text.slice(r.source.expression.start,r.source.expression.end);

type Inquiry={role:'subject'|'observer';id:EntityId}|{role:'trait';id:ConceptId};
export function retrieve(query:Inquiry,corpus=records) {
  return corpus.filter(r=>r[query.role]===query.id);
}
export const neighbours:{from:ConceptId;to:ConceptId;relation:string}[]=[
  {from:'distrust',to:'dimension',relation:'Broader concept'},
  {from:'distrust',to:'opposite',relation:'Opposing concept'},
  {from:'distrust',to:'unreliable',relation:'Related concept'},
];
