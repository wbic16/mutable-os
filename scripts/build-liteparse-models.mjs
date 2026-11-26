// LiteParse OCR model provisioning. Deliberately NOT part of the default
// build chain: the ocria-nano weights are a ~60 MB download under a modified
// OpenRAIL-M licence (commercial-use ceilings; see PDF_OCR_BACKEND in
// server/application-services/pdf-extraction.ts). Run explicitly:
//   npm run setup:liteparse-models
// models.pull prints the weights' licence notice and verifies the package.
import {models} from '@llamaindex/liteparse';
const dir=await models.pull('ocria-nano');
console.log(`ocria-nano provisioned at ${dir}`);
