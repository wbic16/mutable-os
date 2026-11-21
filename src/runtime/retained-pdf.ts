import type {ReactiveEditor} from '../reactive-editor/editor';
import {HttpApplicationServices} from './application-services';
import {checkedPdfCapture,samePdfCapture} from '../pdf/capture';
import {PDF_LIMITS} from '../pdf/model';

/** Native existing-capture preparation. No DCP input, import, viewer activation,
 * publication, or original-byte download. Recheck the returned fence at commit. */
export async function verifyRetainedPdf(editor:ReactiveEditor,value:unknown,signal:AbortSignal){
 const expected=structuredClone(checkedPdfCapture(value)),scope={...editor.readAssetContext()};
 const check=()=>{signal.throwIfAborted();const now=editor.readAssetContext();if(!editor.features.crossResourceLoaders||!scope.cavernId||!scope.session||expected.asset.cavernId!==scope.cavernId||now.session!==scope.session||now.cavernId!==scope.cavernId)throw Error('Retained PDF is outside the active Cavern/session');};
 check();const api=new HttpApplicationServices(()=>{check();return {cavernId:scope.cavernId!,session:scope.session!};});
 const result=await api.call('pdf.verify',{snapshotId:expected.snapshotId},signal);check();samePdfCapture(expected,result.snapshot);
 if(!Number.isSafeInteger(result.byteLength)||result.byteLength<1||result.byteLength>PDF_LIMITS.bytes)throw Error('Retained PDF original size mismatch');
 return {snapshot:structuredClone(result.snapshot),check};
}
