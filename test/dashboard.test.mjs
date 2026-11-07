import {test,mock} from 'node:test';
import assert from 'node:assert/strict';
import {scryptSync} from 'node:crypto';
import sharp from 'sharp';
import {load} from 'cheerio';
import {savePage,atomicUpdate} from '../server/model.mjs';
import {verifyPassword} from '../server/security.mjs';
class MemoryStore{
  data=new Map();next=0;
  async getWithMetadata(key){const v=this.data.get(key);return v?{...v,data:typeof v.data==='object'&&!Buffer.isBuffer(v.data)?structuredClone(v.data):v.data}:null;}
  async get(key){return (await this.getWithMetadata(key))?.data??null;}
  async setJSON(key,value,options={}){return this.set(key,structuredClone(value),options);}
  async set(key,value,options={}){const old=this.data.get(key);if(options.onlyIfNew&&old||options.onlyIfMatch&&options.onlyIfMatch!==old?.etag)return {modified:false};const etag=String(++this.next);this.data.set(key,{data:value,etag,metadata:options.metadata??{}});return {modified:true,etag};}
  async delete(key){this.data.delete(key);}
  async list({prefix}){return {blobs:[...this.data.keys()].filter(k=>k.startsWith(prefix)).map(key=>({key}))};}
  async getMetadata(key){const entry=this.data.get(key);return entry?{etag:entry.etag,metadata:entry.metadata}:null;}
}
const db=new MemoryStore();
mock.module('@netlify/blobs',{namedExports:{getStore:()=>db}});
const {default:api}=await import('../netlify/functions/api.mjs');
const {default:pageHandler}=await import('../netlify/functions/page.mjs');
const {default:media}=await import('../netlify/functions/media.mjs');
const {default:track}=await import('../netlify/functions/track.mjs');
const {default:templates}=await import('../server/templates.json',{with:{type:'json'}});
const password='Temporary-test-password-only';const salt='0123456789abcdef0123456789abcdef';
process.env.AB_ADMIN_PASSWORD_HASH=salt+':'+scryptSync(password,salt,64).toString('hex');
process.env.AB_SESSION_SECRET='local-test-secret-with-at-least-32-characters';
const origin='https://example.test';let cookie='',csrf='';
function req(action,data,extra={}){return new Request(origin+'/.netlify/functions/api?action='+action,{method:data===undefined?'GET':'POST',headers:{cookie,origin,'x-csrf-token':csrf,...(data instanceof FormData?{}:{'content-type':'application/json'}),...extra},body:data===undefined?undefined:data instanceof FormData?data:JSON.stringify(data)});}
const call=(action,data,headers)=>api(req(action,data,headers),{ip:'127.0.0.1'});
test('Authentication, editing, images, history, analytics and logout',async t=>{
  await t.test('all 60 pages have valid editable fields',()=>{assert.equal(Object.keys(templates).length,60);for(const template of Object.values(templates)){const $=load(template.html);assert.ok($('main').length);for(const id of Object.keys(template.fields))assert.equal($(`[data-cms="${id}"]`).length,1);}});
  await t.test('anonymous admin access denied',async()=>assert.equal((await call('pages')).status,401));
  await t.test('password hashes and cross-origin protection',async()=>{assert.equal(verifyPassword('wrong',process.env.AB_ADMIN_PASSWORD_HASH),false);assert.equal((await call('login',{email:'info@abfirestop.be',password},{origin:'https://evil.test'})).status,403);});
  await t.test('login creates secure server-side session',async()=>{const response=await call('login',{email:'info@abfirestop.be',password});assert.equal(response.status,200);const c=response.headers.get('set-cookie');assert.match(c,/HttpOnly/);assert.match(c,/Secure/);cookie=c.split(';')[0];csrf=(await response.json()).csrf;assert.ok(csrf);});
  let page,firstVersion,changedId;
  await t.test('load and save page with optimistic locking',async()=>{
    page=await (await call('page&page=index.html')).json();assert.equal(page.etag,null);changedId=Object.keys(page.fields).find(k=>page.fields[k].type==='text'&&page.fields[k].area==='Pagina-inhoud');page.content.values[changedId]='Test <script>alert(1)</script>';
    assert.equal((await call('save',{page:'index.html',etag:null,content:page.content},{'x-csrf-token':'bad'})).status,403);
    const response=await call('save',{page:'index.html',etag:null,content:page.content});assert.equal(response.status,200);firstVersion=(await response.json()).etag;
    assert.equal((await call('save',{page:'index.html',etag:null,content:page.content})).status,409);
  });
  await t.test('published text is escaped and server-rendered',async()=>{const response=await pageHandler(new Request(origin+'/.netlify/functions/page?page=index.html'));assert.equal(response.status,200);const text=await response.text();assert.ok(text.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));assert.ok(!text.includes('<script>alert(1)</script>'));});
  await t.test('preview does not publish changes',async()=>{const content=structuredClone(page.content);content.values[changedId]='Preview only';const response=await call('preview',{page:'index.html',content});assert.equal(response.status,200);assert.match((await response.json()).html,/Preview only/);assert.equal((await db.get('pages/index.html')).content.values[changedId],page.content.values[changedId]);});
  let photo;
  await t.test('unsafe uploads rejected, photos converted to WebP',async()=>{
    const bad=new FormData();bad.append('image',new Blob(['<svg onload="alert(1)"></svg>'],{type:'image/svg+xml'}),'bad.svg');assert.equal((await call('upload',bad)).status,400);
    const bytes=await sharp({create:{width:16,height:16,channels:3,background:'#ff0000'}}).png().toBuffer();const good=new FormData();good.append('image',new Blob([bytes],{type:'image/png'}),'photo.png');const r=await call('upload',good);assert.equal(r.status,200);photo=await r.json();const picture=await media(new Request(origin+photo.src));assert.equal(picture.headers.get('content-type'),'image/webp');assert.equal((await sharp(Buffer.from(await picture.arrayBuffer())).metadata()).format,'webp');
  });
  await t.test('gallery photo is rendered and versions can be restored',async()=>{
    page.content.extras=[{src:photo.src,alt:'Projectfoto'}];let r=await call('save',{page:'index.html',etag:firstVersion,content:page.content});assert.equal(r.status,200);
    let output=await (await pageHandler(new Request(origin+'/.netlify/functions/page?page=index.html'))).text();assert.match(output,/Projectfoto/);
    const fresh=await (await call('page&page=index.html')).json();assert.equal(fresh.history.length,2);
    r=await call('restore',{page:'index.html',etag:fresh.etag,id:fresh.history.at(-1).id});assert.equal(r.status,200);
    output=await (await pageHandler(new Request(origin+'/.netlify/functions/page?page=index.html'))).text();assert.ok(!output.includes('Test &lt;script&gt;'));
  });
  await t.test('analytics increments without storing identifying data',async()=>{for(let i=0;i<2;i++){const r=await track(new Request(origin+'/.netlify/functions/track',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({page:'index.html'})}));assert.equal(r.status,204);}const stats=await (await call('stats')).json();assert.equal(stats.days.at(-1).total,2);assert.deepEqual(Object.keys(stats.days.at(-1)).sort(),['date','pages','total']);});
  await t.test('malicious paths and external image URLs rejected',async()=>{assert.equal((await call('page&page=../../secret')).status,404);const imageId=Object.keys(page.fields).find(k=>page.fields[k].type==='image');const content=structuredClone(page.content);content.values[imageId]='javascript:alert(1)';assert.equal((await call('preview',{page:'index.html',content})).status,400);});
  await t.test('logout revokes session',async()=>{assert.equal((await call('logout',{})).status,200);assert.equal((await call('pages')).status,401);});
});
test('concurrent statistics updates do not lose increments',async()=>{const s=new MemoryStore();await Promise.all(Array.from({length:5},()=>atomicUpdate(s,'counter',old=>({n:(old?.n??0)+1}))));assert.equal((await s.get('counter')).n,5);});
test('simultaneous page publications reject the second write',async()=>{const s=new MemoryStore(),template=templates['index.html'];const results=await Promise.allSettled([savePage(s,'index.html',template,{etag:null,content:{}},'a'),savePage(s,'index.html',template,{etag:null,content:{}},'b')]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.find(r=>r.status==='rejected').reason.status,409);});
