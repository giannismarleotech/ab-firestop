import { getStore } from '@netlify/blobs';
export const store=()=>getStore({name:'ab-firestop-cms-v1',consistency:'strong'});
export const json=(data,status=200,headers={})=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff',...headers}});
export const errorResponse=e=>json({error:e.status?e.message:'De bewerking is mislukt. Probeer opnieuw of neem contact op met de beheerder.'},e.status??500);
export async function body(req,max=200000){const raw=await req.text();if(raw.length>max)throw Object.assign(new Error('De aanvraag is te groot.'),{status:413});try{return JSON.parse(raw);}catch{throw Object.assign(new Error('Ongeldige aanvraag.'),{status:400});}}
