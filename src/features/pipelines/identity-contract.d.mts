import type {EntityDate} from '../../feature-api/entity-enrichment';
export interface IdentitySource {resourceId:string;entityId:string;revision:number;name:string;typename:string;description:string;aliases:string[];enrichment:{subtypes?:string[];dates?:EntityDate[];externalIds?:{namespace:string;value:string}[]};thumbnail?:{url:string;source?:string;attribution?:string;license?:string};provenance:unknown}
export interface IdentityChoices {name:'keep'|'import';aliases:'keep'|'merge';description:'keep'|'import'|'both';typename:'keep'|'import';subtypes:'keep'|'merge';dates:'keep'|'merge';externalIds:'keep'|'merge'}
export function identitySource(value:unknown):IdentitySource;
export function identityChoices(value:unknown):IdentityChoices;
