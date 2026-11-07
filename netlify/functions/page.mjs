import templates from '../../server/templates.json' with {type:'json'};
import { store } from '../../server/http.mjs';
import { cleanPage,getPage } from '../../server/model.mjs';
import { render } from '../../server/render.mjs';
export function resolvePage(requestUrl){
  const url=new URL(requestUrl);
  // Netlify Functions v2 retains the original request URL after a rewrite.
  if(url.pathname==='/.netlify/functions/page')return cleanPage(url.searchParams.get('page'),templates);
  let path;
  try{path=decodeURIComponent(url.pathname).replace(/^\//,'');}catch{ return cleanPage(null,templates); }
  if(!path||path.endsWith('/'))path+='index.html';
  if(Object.hasOwn(templates,path))return path;
  if(Object.hasOwn(templates,path+'.html'))return path+'.html';
  if(Object.hasOwn(templates,path+'/index.html'))return path+'/index.html';
  // Clean page URLs may also end in a slash.
  if(path.endsWith('/index.html'))return cleanPage(path.slice(0,-11)+'.html',templates);
  return cleanPage(path,templates);
}
export default async req=>{
  let page;
  try{page=resolvePage(req.url);}catch{return new Response('Pagina niet gevonden.',{status:404});}
  try{
    let content;
    try{content=(await getPage(store(),page,templates[page])).content;}catch{return new Response('De website is tijdelijk niet beschikbaar. Probeer over enkele ogenblikken opnieuw.',{status:503,headers:{'retry-after':'30'}});}
    return new Response(render(templates[page],content),{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
  }catch{return new Response('De website is tijdelijk niet beschikbaar. Probeer over enkele ogenblikken opnieuw.',{status:503,headers:{'retry-after':'30'}});}
};
