/** Deterministic wire fixtures used by adapter and trusted-browser qualification. */
export const plainContribution=(exchange:string,text='Thanks! Let’s plan a picnic for Saturday.')=>({protocol:'dcp/1.0',kind:'contribution',exchange,intent:'reply',replyTargets:[],composition:[{id:'p',kind:'paragraph',markup:text,ranges:[]}],anchors:[],entities:[],interpretations:[],arguments:[],glosses:[],relations:[],suggestions:[],promotionRecommendations:[]});
export function streamFixture(provider:'openai'|'anthropic',text:string,tool?:{id:string;name:string;arguments:any},stop?:string){
 if(provider==='openai')return [
  ...(text?[{type:'response.output_text.delta',delta:text.slice(0,25)},{type:'response.output_text.delta',delta:text.slice(25)}]:[]),
  {type:stop==='incomplete'?'response.incomplete':'response.completed',response:{id:'response-fixture',model:'fixture-openai',status:stop??'completed',usage:{input_tokens:50,output_tokens:20,total_tokens:70},output:tool?[{type:'function_call',id:'item-fixture',call_id:tool.id,name:tool.name,arguments:JSON.stringify(tool.arguments)}]:[{type:'message',role:'assistant',content:[{type:'output_text',text}]}]}}
 ];
 return [
  {type:'message_start',message:{id:'message-fixture',model:'fixture-anthropic',usage:{input_tokens:50,output_tokens:0}}},
  {type:'content_block_start',index:0,content_block:tool?{type:'tool_use',id:tool.id,name:tool.name,input:{}}:{type:'text',text:''}},
  {type:'content_block_delta',index:0,delta:tool?{type:'input_json_delta',partial_json:JSON.stringify(tool.arguments)}:{type:'text_delta',text}},
  {type:'content_block_stop',index:0},
  {type:'message_delta',delta:{stop_reason:stop??(tool?'tool_use':'end_turn')},usage:{output_tokens:20}},
  {type:'message_stop'},
 ];
}
export function sse(events:unknown[]){return new Response(events.map(e=>'data: '+JSON.stringify(e)+'\n\n').join(''),{headers:{'content-type':'text/event-stream'}});}
