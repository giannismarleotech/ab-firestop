import { randomBytes, scryptSync, timingSafeEqual, createHmac } from 'node:crypto';
import { fail, digest, atomicUpdate } from './model.mjs';
const COOKIE='__Host-ab-admin';
export function verifyPassword(password,encoded){
  const [salt,hash]=String(encoded??'').split(':');
  if(!/^[a-f0-9]{32}$/.test(salt??'')||!/^[a-f0-9]{128}$/.test(hash??'')||typeof password!=='string'||password.length>200)return false;
  return timingSafeEqual(scryptSync(password,salt,64),Buffer.from(hash,'hex'));
}
export function settings(){
  const env=process.env;
  if(!env.AB_ADMIN_PASSWORD_HASH||!env.AB_SESSION_SECRET||env.AB_SESSION_SECRET.length<32)fail(503,'Het beheer moet nog veilig worden geactiveerd in Netlify.');
  return {email:env.AB_ADMIN_EMAIL||'info@abfirestop.be',hash:env.AB_ADMIN_PASSWORD_HASH,secret:env.AB_SESSION_SECRET};
}
export function sameOrigin(req){if(req.headers.get('origin')!==new URL(req.url).origin)fail(403,'Deze aanvraag is niet toegestaan.');}
export async function limit(store,req,context,secret,scope,max=10){
  const bucket=Math.floor(Date.now()/900000);
  const key='limit/'+scope+'/'+createHmac('sha256',secret).update(context.ip??'unknown').digest('hex');
  await atomicUpdate(store,key,old=>{
    const count=old?.bucket===bucket?old.count:0;
    if(count>=max)fail(429,'Te veel aanvragen. Probeer over 15 minuten opnieuw.');
    return {bucket,count:count+1};
  });
}
export async function startSession(store,config){
  const token=randomBytes(32).toString('hex');
  const session={email:config.email,csrf:randomBytes(32).toString('hex'),expires:Date.now()+8*3600000,fingerprint:digest(config.hash+config.secret)};
  await store.setJSON('session/'+digest(token),session);
  return {session,cookie:`${COOKIE}=${token}; Secure; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800`};
}
export function tokenFrom(req){return (req.headers.get('cookie')??'').split(';').map(x=>x.trim()).find(x=>x.startsWith(COOKIE+'='))?.slice(COOKIE.length+1)??'';}
export async function sessionFor(store,req,config,write=false){
  const token=tokenFrom(req);if(!/^[a-f0-9]{64}$/.test(token))fail(401,'Meld je aan om verder te gaan.');
  const session=await store.get('session/'+digest(token),{type:'json'});
  if(!session||session.expires<Date.now()||session.fingerprint!==digest(config.hash+config.secret))fail(401,'Je sessie is verlopen. Meld opnieuw aan.');
  if(write){sameOrigin(req);if(req.headers.get('x-csrf-token')!==session.csrf)fail(403,'Vernieuw de pagina en probeer opnieuw.');}
  return session;
}
export const clearCookie=`${COOKIE}=; Secure; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`;
