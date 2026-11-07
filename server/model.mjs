import { randomUUID, createHash } from 'node:crypto';
export class HttpError extends Error { constructor(status,message){super(message);this.status=status;} }
export const fail=(status,message)=>{throw new HttpError(status,message);};
export const digest=value=>createHash('sha256').update(value).digest('hex');
export function cleanPage(value,templates){if(typeof value!=='string'||!Object.hasOwn(templates,value))fail(404,'Pagina niet gevonden.');return value;}
export function validateContent(input,template){
  if(!input||typeof input!=='object'||Array.isArray(input))fail(400,'Ongeldige inhoud.');
  const values={};
  for(const [key,field] of Object.entries(template.fields)){
    const value=input.values?.[key]??field.value;
    if(typeof value!=='string'||value.length>12000)fail(400,'Een tekst is te lang.');
    if(field.type==='image'&&value!==field.value&&!/^\/\.netlify\/functions\/media\?id=[a-f0-9-]{36}$/.test(value))fail(400,'Kies een foto uit de fotobibliotheek.');
    values[key]=value;
    if(field.type==='image'){
      const alt=input.values?.[key+'-alt']??field.alt;
      if(typeof alt!=='string'||alt.length>400)fail(400,'De fotobeschrijving is te lang.');
      values[key+'-alt']=alt;
    }
  }
  const extras=input.extras??[];
  if(!Array.isArray(extras)||extras.length>40)fail(400,'Maximaal 40 extra foto’s per pagina.');
  return {values,extras:extras.map(x=>{
    if(!x||!/^\/\.netlify\/functions\/media\?id=[a-f0-9-]{36}$/.test(x.src)||typeof x.alt!=='string'||x.alt.length>400)fail(400,'Ongeldige foto.');
    return {src:x.src,alt:x.alt};
  })};
}
export async function getPage(store,page,template){
  const record=await store.getWithMetadata('pages/'+page,{type:'json'});
  return {record, content:record?.data?.content??validateContent({},template)};
}
export async function savePage(store,page,template,input,user){
  const {record,content}=await getPage(store,page,template);
  if((input.etag??null)!==(record?.etag??null))fail(409,'Deze pagina is intussen gewijzigd. Herlaad de pagina voordat je opnieuw opslaat.');
  const next=validateContent(input.content,template);
  const at=new Date().toISOString();
  const revision={id:randomUUID(),at:record?.data?.updatedAt??null,user:record?.data?.user??'Originele website',content};
  const data={content:next,updatedAt:at,user,history:[revision,...(record?.data?.history??[])].slice(0,20)};
  const result=await store.setJSON('pages/'+page,data,record?{onlyIfMatch:record.etag}:{onlyIfNew:true});
  if(!result.modified)fail(409,'Iemand anders heeft deze pagina opgeslagen. Herlaad de pagina.');
  return {etag:result.etag,updatedAt:at,content:next};
}
export async function atomicUpdate(store,key,update){
  for(let i=0;i<8;i++){
    const entry=await store.getWithMetadata(key,{type:'json'});
    const data=update(entry?.data??null);
    const result=await store.setJSON(key,data,entry?{onlyIfMatch:entry.etag}:{onlyIfNew:true});
    if(result.modified)return data;
  }
  fail(503,'Het is even druk. Probeer opnieuw.');
}
