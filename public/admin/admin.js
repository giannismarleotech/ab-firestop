const $=s=>document.querySelector(s);
const state={csrf:'',pages:[],photos:[],editor:null,dirty:false,view:'overview'};
const date=value=>value?new Intl.DateTimeFormat('nl-BE',{dateStyle:'medium',timeStyle:'short',timeZone:'Europe/Brussels'}).format(new Date(value)):'Originele website';
const node=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;};
const button=(label,fn,cls)=>{const b=node('button',label,cls);b.type='button';b.addEventListener('click',()=>Promise.resolve(fn()).catch(showError));return b;};
function notice(message,error=false){$('#notice').textContent=message;$('#notice').className=error?'error':'';}
function showError(e){notice(e.message||'Er is iets misgelopen.',true);}
async function api(action,data,query={}){
  const options={credentials:'same-origin',headers:{}};
  if(data!==undefined){options.method='POST';options.headers['x-csrf-token']=state.csrf;if(data instanceof FormData)options.body=data;else{options.headers['content-type']='application/json';options.body=JSON.stringify(data);}}
  const response=await fetch('/.netlify/functions/api?'+new URLSearchParams({action,...query}),options);
  let result;try{result=await response.json();}catch{throw Error('De beheerbackend is nog niet bereikbaar. Controleer of de Netlify Functions mee zijn gepubliceerd.');}
  if(!response.ok){if(response.status===401&&action!=='login'){showLogin();}throw Error(result.error||'De aanvraag is mislukt.');}
  return result;
}
function showLogin(){state.dirty=false;$('#app').hidden=true;$('#login').hidden=false;$('#loading').hidden=true;}
function showApp(session){state.csrf=session.csrf;$('#account').textContent=session.email;$('#login').hidden=true;$('#loading').hidden=true;$('#app').hidden=false;}
function heading(title,description){const h=node('div',undefined,'heading'),text=node('div');text.append(node('p','AB FIRESTOP','eyebrow'),node('h1',title),node('p',description));h.append(text);$('#content').append(h);return h;}
async function navigate(view){
  if(state.dirty&&!confirm('Je hebt wijzigingen die nog niet zijn opgeslagen. Wil je deze pagina verlaten?'))return;
  state.dirty=false;state.editor=null;state.view=view;notice('');$('#content').replaceChildren();
  document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===view));
  if(view==='overview')await overview();if(view==='pages')await pages();if(view==='photos')await photos();if(view==='history')await history();
}
async function loadPages(){state.pages=await api('pages');return state.pages;}
async function overview(){
  heading('Alles op één plek.','Welkom terug. Houd je website actueel en volg het bezoek.');
  const [pages,stats]=await Promise.all([loadPages(),api('stats')]);
  const total=stats.days.reduce((n,d)=>n+d.total,0),today=stats.days.at(-1).total;
  const cards=node('div',undefined,'cards');
  for(const [label,value,caption] of [['PAGINAWEERGAVEN',total,'Laatste 30 dagen'],['VANDAAG',today,'Paginaweergaven · UTC'],['PAGINA’S',pages.length,'Nederlands, Frans en Engels']]){const card=node('div',undefined,'card');card.append(node('span',label,'eyebrow'),node('div',String(value),'number'),node('p',caption));cards.append(card);}
  $('#content').append(cards);
  const grid=node('div',undefined,'grid-two'),panel=node('section',undefined,'panel');panel.append(node('h3','Bezoek aan de website'));
  if(!total)panel.append(node('p','Nog geen paginaweergaven geregistreerd. De telling start zodra deze versie online staat.','empty'));
  else{
    const chart=node('div',undefined,'chart'),max=Math.max(...stats.days.map(d=>d.total),1);
    for(const day of stats.days){const col=node('div'),meter=document.createElement('meter');meter.min=0;meter.max=max;meter.value=day.total;meter.setAttribute('aria-label',day.date+': '+day.total+' paginaweergaven');meter.title=day.date+': '+day.total;col.append(meter);chart.append(col);}panel.append(chart);
    const labels=node('div',undefined,'chart-labels');labels.append(node('span',stats.days[0].date),node('span',stats.days.at(-1).date));panel.append(labels);
  }
  panel.append(node('p','Dit zijn paginaweergaven, geen unieke bezoekers. Zonder trackingcookies; geen IP-adressen in de bezoekcijfers. Adblockers kunnen de telling beperken.','help'));
  const recent=node('section',undefined,'panel');recent.append(node('h3','Laatst gewijzigd'));
  const changes=pages.filter(p=>p.updatedAt).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)).slice(0,5);
  if(!changes.length)recent.append(node('p','Je eerste opgeslagen wijziging verschijnt hier.','empty'));
  for(const p of changes){const row=node('div',undefined,'row'),info=node('div');info.append(node('strong',p.title),node('p',p.lang.toUpperCase()+' · '+date(p.updatedAt)));row.append(info,button('Bewerken',()=>editPage(p.path)));recent.append(row);}
  grid.append(panel,recent);$('#content').append(grid);
  const popular=node('section',undefined,'panel');popular.append(node('h3','Meest bekeken pagina’s'));
  const counts={};for(const day of stats.days)for(const [p,n]of Object.entries(day.pages))counts[p]=(counts[p]??0)+n;
  for(const [path,count]of Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,8)){const row=node('div',undefined,'row');row.append(node('span',pages.find(p=>p.path===path)?.title??path),node('strong',String(count)));popular.append(row);}
  if(!Object.keys(counts).length)popular.append(node('p','Nog geen gegevens.','muted'));$('#content').append(popular);
}
async function pages(){
  heading('Pagina’s & teksten','Kies een taal en open de pagina die je wilt aanpassen. Elke taal wordt apart beheerd.');
  const filters=node('div',undefined,'filters'),search=node('input'),select=node('select');search.type='search';search.placeholder='Zoek een pagina…';search.setAttribute('aria-label','Pagina zoeken');
  for(const [v,t]of [['nl','Nederlands'],['fr','Français'],['en','English']]){const o=node('option',t);o.value=v;select.append(o);}select.setAttribute('aria-label','Taal');filters.append(search,select);
  const list=node('div',undefined,'page-list');$('#content').append(filters,list);await loadPages();
  const draw=()=>{list.replaceChildren();for(const p of state.pages.filter(p=>p.lang===select.value&&p.title.toLowerCase().includes(search.value.toLowerCase()))){const row=node('div',undefined,'page-row'),info=node('div');info.append(node('strong',p.title),node('p','Laatst opgeslagen: '+date(p.updatedAt)));row.append(info,button('Bewerken',()=>editPage(p.path)));list.append(row);}if(!list.children.length)list.append(node('p','Geen pagina’s gevonden.','empty'));};
  search.oninput=draw;select.onchange=draw;draw();
}
function dirty(){state.dirty=true;$('.save-state').textContent='Niet-opgeslagen wijzigingen';}
async function editPage(path){
  if(state.dirty&&!confirm('Je wijzigingen zijn nog niet opgeslagen. Toch een andere pagina openen?'))return;
  const page=await api('page',undefined,{page:path});state.editor=page;state.dirty=false;
  $('#content').replaceChildren();notice('');
  const title=state.pages.find(p=>p.path===path)?.title??path;
  const h=heading(title,'Pas de velden hieronder aan. Opslaan publiceert de wijzigingen direct op deze pagina.');h.append(button('Alle pagina’s',()=>navigate('pages')));
  const toolbar=node('div',undefined,'editor-toolbar');toolbar.append(node('span','Laatst opgeslagen: '+date(page.updatedAt),'save-state'),button('Voorbeeld',preview),button('Opslaan & publiceren',save,'primary'));$('#content').append(toolbar);
  for(const area of ['Pagina-inhoud','Foto’s','Menu en bovenbalk','Voettekst']){
    const group=node('details',undefined,'editor-section');group.open=area==='Pagina-inhoud';group.append(node('summary',area));let count=0;
    for(const [id,field]of Object.entries(page.fields).filter(([,f])=>f.area===area)){
      count++;const box=node('div',undefined,'field');
      if(field.type==='text'){
        const label=node('label');label.append(node('span',field.label,'label'));const input=node('textarea');input.rows=field.value.length>100?3:2;input.value=page.content.values[id]??field.value;input.addEventListener('input',()=>{page.content.values[id]=input.value;dirty();});label.append(input);box.append(label);
      }else{
        const img=node('img');img.src=new URL(page.content.values[id]??field.value,new URL(path,location.origin+'/')).href;img.alt=page.content.values[id+'-alt']??field.alt;
        const label=node('label','Fotobeschrijving'),alt=node('input');alt.value=img.alt;alt.maxLength=400;alt.oninput=()=>{page.content.values[id+'-alt']=alt.value;img.alt=alt.value;dirty();};label.append(alt);
        box.append(img,button('Foto vervangen',()=>pickPhoto(photo=>{page.content.values[id]=photo.src;img.src=photo.src;dirty();})),label);
      }group.append(box);
    }if(count)$('#content').append(group);
  }
  const extras=node('section',undefined,'editor-section');extras.append(node('h3','Extra projectfoto’s'),node('p','Deze foto’s verschijnen onderaan de pagina.','help'));
  const list=node('div',undefined,'photo-grid');extras.append(list);
  const drawExtras=()=>{
    list.replaceChildren();page.content.extras.forEach((photo,i)=>{const card=node('div',undefined,'photo-card'),img=node('img');img.src=photo.src;img.alt=photo.alt;const inner=node('div'),input=node('input');input.value=photo.alt;input.maxLength=400;input.setAttribute('aria-label','Fotobeschrijving');input.placeholder='Beschrijving van de foto';input.oninput=()=>{photo.alt=input.value;dirty();};inner.append(input,button('Verwijderen',()=>{page.content.extras.splice(i,1);dirty();drawExtras();}));card.append(img,inner);list.append(card);});
  };drawExtras();extras.append(button('Foto toevoegen',()=>pickPhoto(photo=>{if(page.content.extras.length>=40)throw Error('Maximaal 40 extra foto’s per pagina.');page.content.extras.push({src:photo.src,alt:''});dirty();drawExtras();})));$('#content').append(extras);
  if(page.history.length){const history=node('section',undefined,'panel');history.append(node('h3','Eerdere versies van deze pagina'));for(const revision of page.history){const row=node('div',undefined,'row'),info=node('div');info.append(node('strong',date(revision.at)),node('p',revision.user));row.append(info,button('Terugzetten',async()=>{if(!confirm('Deze eerdere versie publiceren? De huidige versie blijft in de geschiedenis bewaard.'))return;await api('restore',{page:path,id:revision.id,etag:page.etag});state.dirty=false;await editPage(path);notice('De eerdere versie is teruggezet.');}));history.append(row);}$('#content').append(history);}
  window.scrollTo({top:0,behavior:'instant'});
}
async function save(){
  const page=state.editor;if(!page)return;
  const controls=[...document.querySelectorAll('.editor-toolbar button')];controls.forEach(b=>b.disabled=true);
  try{const result=await api('save',{page:page.page,etag:page.etag,content:page.content});state.dirty=false;await editPage(page.page);notice('Opgeslagen en gepubliceerd op '+date(result.updatedAt)+'.');}
  finally{controls.forEach(b=>b.disabled=false);}
}
async function preview(){const page=state.editor;const result=await api('preview',{page:page.page,content:page.content});$('#preview iframe').srcdoc=result.html;$('#preview').showModal();}
async function upload(file){
  if(!file)throw Error('Kies eerst een foto.');
  if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw Error('Kies een JPG, PNG of WebP.');
  if(file.size>20*1024*1024)throw Error('Kies een foto van maximaal 20 MB.');
  const bitmap=await createImageBitmap(file);const scale=Math.min(1,2400/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',.87));if(!blob)throw Error('Deze foto kon niet worden verwerkt.');
  const form=new FormData();form.append('image',blob,file.name.replace(/\.[^.]+$/,'.webp'));
  return api('upload',form);
}
function uploadZone(onDone){
  const zone=node('div',undefined,'upload-zone'),label=node('label','Nieuwe foto uploaden'),input=node('input');input.type='file';input.accept='image/jpeg,image/png,image/webp';label.append(input);
  const b=button('Uploaden',async()=>{b.disabled=true;try{const result=await upload(input.files[0]);input.value='';await onDone(result);notice('Foto toegevoegd aan de bibliotheek. Kies een pagina om ze te gebruiken.');}finally{b.disabled=false;}});zone.append(label,node('p','JPG, PNG of WebP. Foto’s worden automatisch verkleind voor een snelle website.'),b);return zone;
}
async function photos(){
  heading('Fotobibliotheek','Upload nieuwe foto’s en gebruik ze op een of meerdere pagina’s. De oorspronkelijke websitefoto’s kun je vervangen via de pagina-editor.');
  const grid=node('div',undefined,'photo-grid');$('#content').append(uploadZone(async()=>{await draw();}),grid);
  async function draw(){state.photos=await api('media');grid.replaceChildren();if(!state.photos.length)grid.append(node('p','Er zijn nog geen nieuwe foto’s geüpload.','empty'));for(const photo of state.photos){const card=node('div',undefined,'photo-card'),img=node('img');img.src=photo.src;img.alt=photo.name??'Geüploade foto';img.loading='lazy';const details=node('div');details.append(node('p',photo.name??'Foto'),node('span',date(photo.at),'help'));card.append(img,details);grid.append(card);}}await draw();
}
async function pickPhoto(onPick){
  const grid=$('#picker-grid');grid.replaceChildren();const dialog=$('#photo-picker');
  const draw=async()=>{state.photos=await api('media');grid.replaceChildren();grid.append(uploadZone(async photo=>{onPick(photo);dialog.close();}));for(const photo of state.photos){const b=button('',()=>{onPick(photo);dialog.close();});const img=node('img');img.src=photo.src;img.alt=photo.name??'Kies deze foto';b.append(img);grid.append(b);}if(!state.photos.length)grid.append(node('p','Upload eerst een foto om ze toe te voegen.','empty'));};await draw();dialog.showModal();
}
async function history(){
  heading('Wijzigingsgeschiedenis','Bekijk wanneer een pagina is aangepast. Open een pagina om eerdere versies terug te zetten.');
  await loadPages();const pages=state.pages.filter(p=>p.updatedAt).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));const panel=node('div',undefined,'panel');
  if(!pages.length)panel.append(node('p','Er zijn nog geen wijzigingen opgeslagen.','empty'));
  for(const page of pages){const row=node('div',undefined,'row'),info=node('div');info.append(node('strong',page.title+' · '+page.lang.toUpperCase()),node('p',date(page.updatedAt)));row.append(info,button('Versies bekijken',()=>editPage(page.path)));panel.append(row);}$('#content').append(panel);
}
$('#login-form').addEventListener('submit',async e=>{e.preventDefault();const b=e.submitter;b.disabled=true;$('#login-error').textContent='';try{const session=await api('login',{email:$('#email').value,password:$('#password').value});$('#password').value='';showApp(session);await navigate('overview');}catch(error){$('#login-error').textContent=error.message;}finally{b.disabled=false;}});
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>navigate(b.dataset.view).catch(showError));
$('#logout').onclick=async()=>{if(state.dirty&&!confirm('Afmelden zonder je wijzigingen op te slaan?'))return;try{await api('logout',{});showLogin();}catch(e){showError(e);}};
$('#close-preview').onclick=()=>$('#preview').close();$('#close-picker').onclick=()=>$('#photo-picker').close();
window.addEventListener('beforeunload',e=>{if(state.dirty){e.preventDefault();e.returnValue='';}});
(async()=>{try{const session=await api('session');showApp(session);await navigate('overview');}catch(e){showLogin();if(!e.message.includes('Meld je aan')&&!e.message.includes('sessie'))$('#login-error').textContent=e.message;}})();
