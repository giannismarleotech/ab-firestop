const menu=document.querySelector('.menu'),nav=document.querySelector('#navigation');
const mobile=matchMedia('(max-width:1100px)');
const setMenu=(open,restore=false)=>{
 menu?.setAttribute('aria-expanded',String(open));nav?.classList.toggle('open',open);
 document.body.classList.toggle('menu-open',open&&mobile.matches);
 if(menu)menu.querySelector('.menu-label').textContent=open?menu.dataset.close:'Menu';
 document.querySelectorAll('main,footer').forEach(el=>{el.inert=open&&mobile.matches});
 if(restore)menu?.focus();
};
menu?.addEventListener('click',()=>setMenu(menu.getAttribute('aria-expanded')!=='true'));
nav?.addEventListener('click',e=>{if(e.target.closest('a'))setMenu(false)});
mobile.addEventListener('change',()=>setMenu(false));
document.addEventListener('keydown',e=>{
 if(menu?.getAttribute('aria-expanded')!=='true')return;
 if(e.key==='Escape'){setMenu(false,true);return}
 if(e.key==='Tab'&&mobile.matches){
 const focusable=[...document.querySelector('header').querySelectorAll('a,button')].filter(el=>el.getClientRects().length);
 const first=focusable[0],last=focusable.at(-1);
 if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}
 else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}
 }
});
const current=location.pathname.split('/').pop()||'index.html';document.querySelectorAll('nav a').forEach(a=>{if(a.getAttribute('href')===current)a.setAttribute('aria-current','page')});const viewer=document.querySelector('#viewer');document.querySelectorAll('[data-image]').forEach(b=>b.addEventListener('click',()=>{viewer.querySelector('img').src=b.dataset.image;viewer.showModal()}));viewer?.querySelector('.close').addEventListener('click',()=>viewer.close());viewer?.addEventListener('click',e=>{if(e.target===viewer)viewer.close()});const lang=document.documentElement.lang;
const formCopy={nl:['Projectaanvraag','Naam','Bedrijf','E-mail','Onderwerp','Uw e-mailprogramma wordt geopend. Opent er niets? Mail dan rechtstreeks naar info@abfirestop.be.'],en:['Project enquiry','Name','Company','Email','Subject','Your email application is opening. If nothing happens, email info@abfirestop.be directly.'],fr:['Demande de projet','Nom','Entreprise','E-mail','Objet','Votre logiciel de messagerie va s’ouvrir. Si rien ne se passe, écrivez directement à info@abfirestop.be.']}[lang]||[];
document.querySelector('#aanvraag')?.addEventListener('submit',e=>{e.preventDefault();const f=new FormData(e.target);const subject=formCopy[0]+' — '+f.get('dienst');const body=[formCopy[1]+': '+f.get('naam'),formCopy[2]+': '+f.get('bedrijf'),formCopy[3]+': '+f.get('email'),formCopy[4]+': '+f.get('dienst'),' ',f.get('bericht')].join('\n');location.href='mailto:info@abfirestop.be?subject='+encodeURIComponent(subject)+'&body='+encodeURIComponent(body);document.querySelector('#form-status').textContent=formCopy[5]});
