import templates from '../../server/templates.json' with {type:'json'};
import { store,body,errorResponse } from '../../server/http.mjs';
import { cleanPage,atomicUpdate,fail } from '../../server/model.mjs';
import { sameOrigin } from '../../server/security.mjs';
export default async req=>{
  try{
    if(req.method!=='POST')fail(405,'POST vereist.');sameOrigin(req);
    const data=await body(req,300),page=cleanPage(data.page,templates);
    if(/bot|crawler|spider|headless/i.test(req.headers.get('user-agent')??''))return new Response(null,{status:204});
    const day=new Date().toISOString().slice(0,10);
    await atomicUpdate(store(),'stats/'+day,old=>({total:(old?.total??0)+1,pages:{...old?.pages,[page]:(old?.pages?.[page]??0)+1}}));
    return new Response(null,{status:204,headers:{'cache-control':'no-store'}});
  }catch(e){return errorResponse(e);}
};
