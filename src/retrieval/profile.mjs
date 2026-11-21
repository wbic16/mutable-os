/** Internal strategy selection is independent of the embedding provider and query strategy. */
export const defaultProfile=Object.freeze({version:2,provider:'openai',model:'text-embedding-3-small',dimensions:1536,metric:'cosine',chunking:'structure',chunkVersion:1,tokenizer:'cl100k_base',chunkSize:128,extension:'0.1.9'});
