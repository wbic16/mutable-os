/** Command grammar only. Document titles remain values, never command syntax. */
export function flintCommand(query:string) {
  const text=query.trimStart().replace(/^\//,'');
  if(!/^flint(?:\s|$)/i.test(text))return;
  const document=/^flint\s+open\s+--doc(?:\s+(.*))?$/iu.exec(text);
  if(document){
    let query=(document[1]??'').trim();
    if(query.startsWith('"'))query=query.slice(1).replace(/"$/u,'');
    return {kind:'document' as const,query};
  }
  if('flint open'.startsWith(text.trim().toLowerCase().replace(/\s+/g,' ')))return {kind:'open' as const};
  return {kind:'incomplete' as const};
}
