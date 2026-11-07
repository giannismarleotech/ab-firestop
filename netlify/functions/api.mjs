import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import templates from '../../server/templates.json' with {type:'json'};
import { store,json,errorResponse,body } from '../../server/http.mjs';
import { cleanPage,getPage,savePage,validateContent,fail,digest } from '../../server/model.mjs';
import { settings,sameOrigin,limit,verifyPassword,startSession,sessionFor,tokenFrom,clearCookie } from '../../server/security.mjs';
import { render } from '../../server/render.mjs';
export default async(req,context)=>{
  try{
    const url=new URL(req.url),action=url.searchParams.get('action')??'session';
    const config=settings(),db=store(),write=req.method==='POST';
    if(!['GET','POST'].includes(req.method))fail(405,'Deze methode is niet toegestaan.');
    if(action==='login'){
      if(!write)fail(405,'Aanmelden vereist een POST-aanvraag.');sameOrigin(req);
      await limit(db,req,context,config.secret,'login',10);
      const data=await body(req,2000);
      if(data.email?.toLowerCase()!==config.email.toLowerCase()||!verifyPassword(data.password,config.hash))fail(401,'E-mailadres of wachtwoord klopt niet.');
      const {session,cookie}=await startSession(db,config);
      return json({email:session.email,csrf:session.csrf},200,{'set-cookie':cookie});
    }
    const session=await sessionFor(db,req,config,write);
    if(action==='session')return json({email:session.email,csrf:session.csrf});
    if(action==='logout'&&write){await db.delete('session/'+digest(tokenFrom(req)));return json({ok:true},200,{'set-cookie':clearCookie});}
    if(action==='pages'){
      const pages=await Promise.all(Object.entries(templates).map(async([path,t])=>{
        const record=await db.get('pages/'+path,{type:'json'});
        return {path,title:t.title,lang:t.lang,updatedAt:record?.updatedAt??null};
      }));return json(pages);
    }
    if(action==='stats'){
      const days=await Promise.all(Array.from({length:30},async(_,i)=>{
        const date=new Date(Date.now()-(29-i)*86400000).toISOString().slice(0,10);
        return {date,...(await db.get('stats/'+date,{type:'json'})??{total:0,pages:{}})};
      }));return json({days});
    }
    if(action==='media'){
      const {blobs}=await db.list({prefix:'photo/'});
      const items=await Promise.all(blobs.map(async b=>{const entry=await db.getMetadata(b.key);return {id:b.key.slice(6),src:'/.netlify/functions/media?id='+b.key.slice(6),...entry?.metadata};}));
      return json(items.sort((a,b)=>(b.at??'').localeCompare(a.at??'')));
    }
    if(action==='upload'&&write){
      const form=await req.formData(),file=form.get('image');
      if(!file||typeof file.arrayBuffer!=='function'||file.size>4*1024*1024)fail(400,'Kies een JPG, PNG of WebP van maximaal 4 MB.');
      const input=Buffer.from(await file.arrayBuffer());
      let output;
      try{
        const image=sharp(input,{limitInputPixels:25000000,animated:false});
        const meta=await image.metadata();if(!['jpeg','png','webp'].includes(meta.format))fail(400,'Gebruik een JPG, PNG of WebP.');
        output=await image.rotate().resize({width:2400,height:2400,fit:'inside',withoutEnlargement:true}).webp({quality:85}).toBuffer();
      }catch{fail(400,'Deze foto kan niet worden verwerkt. Gebruik een JPG, PNG of WebP van maximaal 25 megapixels.');}
      const id=randomUUID(),at=new Date().toISOString();
      await db.set('photo/'+id,output,{metadata:{name:String(file.name).slice(0,150),at,type:'image/webp'}});
      return json({id,src:'/.netlify/functions/media?id='+id,name:file.name,at});
    }
    const data=write?await body(req):{};
    const page=cleanPage(data.page??url.searchParams.get('page'),templates),template=templates[page];
    const current=await getPage(db,page,template);
    if(action==='page')return json({page,fields:template.fields,content:current.content,etag:current.record?.etag??null,updatedAt:current.record?.data.updatedAt??null,history:(current.record?.data.history??[]).map(({content,...h})=>h)});
    if(action==='preview'&&write)return json({html:render(template,validateContent(data.content,template),url.origin)});
    if(action==='save'&&write)return json(await savePage(db,page,template,data,session.email));
    if(action==='restore'&&write){
      const revision=current.record?.data.history.find(h=>h.id===data.id);if(!revision)fail(404,'Deze versie bestaat niet meer.');
      return json(await savePage(db,page,template,{etag:data.etag,content:revision.content},session.email));
    }
    fail(404,'Deze actie bestaat niet.');
  }catch(e){return errorResponse(e);}
};
