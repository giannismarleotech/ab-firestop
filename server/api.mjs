import { randomUUID } from 'node:crypto';
import { json,errorResponse,body } from './responses.mjs';
import { cleanPage,getPage,savePage,validateContent,fail,digest } from './model.mjs';
import { sameOrigin,limit,verifyPassword,startSession,sessionFor,tokenFrom,clearCookie } from './security.mjs';
import { render } from './render.mjs';
export const createApi = ({templates, store, configFor, processImage, mediaPath = '/.netlify/functions/media'}) => async(req,context)=>{
  try{
    const url=new URL(req.url),action=url.searchParams.get('action')??'session';
    const config=configFor(),db=store(),write=req.method==='POST';
    if(!['GET','POST'].includes(req.method))fail(405,'Deze methode is niet toegestaan.');
    if(action==='login'){
      if(!write)fail(405,'Aanmelden vereist een POST-aanvraag.');sameOrigin(req);
      if(db.cleanupExpired)await db.cleanupExpired();
      await limit(db,req,context,config.secret,'login',10);
      const data=await body(req,2000);
      if(typeof data.email!=='string'||data.email.toLowerCase()!==config.email.toLowerCase()||!verifyPassword(data.password,config.hash))fail(401,'E-mailadres of wachtwoord klopt niet.');
      const {session,cookie}=await startSession(db,config);
      return json({email:session.email,csrf:session.csrf},200,{'set-cookie':cookie});
    }
    const session=await sessionFor(db,req,config,write);
    if(action==='session')return json({email:session.email,csrf:session.csrf});
    if(action==='logout'&&write){await db.delete('session/'+digest(tokenFrom(req)));return json({ok:true},200,{'set-cookie':clearCookie});}
    if(action==='pages'){
      const batch=db.getMany?await db.getMany(Object.keys(templates).map(path=>'pages/'+path),{type:'json'}):null;
      const pages=await Promise.all(Object.entries(templates).map(async([path,t])=>{
        const record=batch?batch.get('pages/'+path)?.data:await db.get('pages/'+path,{type:'json'});
        return {path,title:t.title,lang:t.lang,updatedAt:record?.updatedAt??null};
      }));return json(pages);
    }
    if(action==='stats'){
      const dates=Array.from({length:30},(_,i)=>new Date(Date.now()-(29-i)*86400000).toISOString().slice(0,10));
      const batch=db.getMany?await db.getMany(dates.map(date=>'stats/'+date),{type:'json'}):null;
      const days=await Promise.all(dates.map(async date=>{
        const record=batch?batch.get('stats/'+date)?.data:await db.get('stats/'+date,{type:'json'});
        return {date,...(record??{total:0,pages:{}})};
      }));return json({days});
    }
    if(action==='media'){
      const {blobs}=await db.list({prefix:'photo/'});
      const items=await Promise.all(blobs.map(async b=>{const metadata=Object.hasOwn(b,'metadata')?b.metadata:(await db.getMetadata(b.key))?.metadata;return {...metadata,id:b.key.slice(6),src:mediaPath+'?id='+b.key.slice(6)};}));
      return json(items.sort((a,b)=>(b.at??'').localeCompare(a.at??'')));
    }
    if(action==='upload'&&write){
      const form=await req.formData(),file=form.get('image');
      if(!file||typeof file.arrayBuffer!=='function'||file.size>4*1024*1024)fail(400,'Kies een JPG, PNG of WebP van maximaal 4 MB.');
      const input=Buffer.from(await file.arrayBuffer());
      const output=await processImage(input);
      const id=randomUUID(),at=new Date().toISOString();
      await db.set('photo/'+id,output,{metadata:{name:String(file.name).slice(0,150),at,type:'image/webp'}});
      return json({id,src:mediaPath+'?id='+id,name:file.name,at});
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
