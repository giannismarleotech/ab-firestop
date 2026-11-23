import { getStore } from '@netlify/blobs';
export const store=()=>getStore({name:'ab-firestop-cms-v1',consistency:'strong'});
export {json, errorResponse, body} from './responses.mjs';
