import {applicationKey} from '../feature-api/application-presentation';
import type {DocumentApplicationPort} from './document-application-ports';
import type {CardexPresentationPort} from './cardex-presentation-ports';
export const flintApplication=applicationKey<DocumentApplicationPort>('flint');
export const cardexApplication=applicationKey<CardexPresentationPort>('cardex');
