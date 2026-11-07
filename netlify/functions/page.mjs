import templates from '../../server/templates.json' with {type:'json'};
import { store } from '../../server/http.mjs';
import { cleanPage,getPage } from '../../server/model.mjs';
import { render } from '../../server/render.mjs';
export default async req=>{
  try{
    const page=cleanPage(new URL(req.url).searchParams.get('page'),templates);
    let content;
    try{content=(await getPage(store(),page,templates[page])).content;}catch{return new Response('De website is tijdelijk niet beschikbaar. Probeer over enkele ogenblikken opnieuw.',{status:503,headers:{'retry-after':'30'}});}
    return new Response(render(templates[page],content),{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
  }catch{return new Response('Pagina niet gevonden.',{status:404});}
};
