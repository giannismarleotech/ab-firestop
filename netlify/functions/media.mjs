import { store } from '../../server/http.mjs';
export default async req=>{
  const id=new URL(req.url).searchParams.get('id');if(!/^[a-f0-9-]{36}$/.test(id??''))return new Response('Niet gevonden',{status:404});
  const data=await store().get('photo/'+id,{type:'arrayBuffer'});if(!data)return new Response('Niet gevonden',{status:404});
  return new Response(data,{headers:{'content-type':'image/webp','cache-control':'public, max-age=31536000, immutable','x-content-type-options':'nosniff'}});
};
