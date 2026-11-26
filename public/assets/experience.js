/* Short, progressive enhancements. Content stays available without JavaScript. */
(()=>{
  const body=document.body;
  if(!body.classList.contains('ab-experience'))return;
  const preference=matchMedia('(prefers-reduced-motion: reduce)');
  let observer;
  function start(){
    observer?.disconnect();
    document.querySelectorAll('.ab-enter').forEach(el=>el.classList.remove('ab-enter'));
    body.classList.toggle('motion-ready',!preference.matches);
    if(preference.matches||!('IntersectionObserver' in window))return;
    observer=new IntersectionObserver(entries=>{
      let order=0;
      for(const entry of entries){
        if(!entry.isIntersecting)continue;
        observer.unobserve(entry.target);
        if(entry.boundingClientRect.top>24){
          entry.target.style.setProperty('--reveal-delay',Math.min(order++,3)*65+'ms');
          entry.target.classList.add('ab-enter');
        }
      }
    },{threshold:.05,rootMargin:'0px 0px -18px 0px'});
    document.querySelectorAll('.page-head h1,.detail-head h1,.section-heading,.usecase,.steps article,.document-panel,.faq-category,.contact-grid>div,.footer-top>div,.intro-grid>div,.systems-copy,.system-logo,.service-row,.why>div,.process-track,.project-card,.document-callout>div,.faq>div,.cta>*,.detail-grid>div,.team-grid article,.project-gallery figure').forEach(el=>observer.observe(el));
  }
  preference.addEventListener('change',start);
  start();
})();

/* An editorial preview of AB Firestop's work, using the existing translated content. */
(() => {
  const body = document.body;
  if (!body.classList.contains('ab-experience')) return;
  body.classList.add('studio');
  if (!body.classList.contains('ab-home')) return;
  const $ = (s, r = document) => r.querySelector(s);
  const el = (tag, cls, text) => {
    const node = document.createElement(tag);
    node.className = cls;
    if (text) node.textContent = text;
    return node;
  };
  const hero = $('.hero-stage');
  const services = [...document.querySelectorAll('.expertise .service-row')];
  const stages = [...document.querySelectorAll('.process-track article')];
  if (!hero || !services.length || !stages.length) return;
  const lang = document.documentElement.lang.slice(0,2);
  const words = ({
    nl:['Ontdek de diensten','Bekijk de dienst','Vorige dienst','Volgende dienst','Onze werkwijze','Doorvoering','Doorsnede'],
    fr:['Découvrir les services','Voir le service','Service précédent','Service suivant','Notre méthode','Traversée','Coupe'],
    en:['Explore our services','View service','Previous service','Next service','How we work','Penetration','Section']
  })[lang] || [];
  const cut = el('figure','cutaway');
  cut.setAttribute('aria-hidden','true');
  const model = el('div','cut-model');
  for (const layer of ['substrate','gasket','collar','pipe']) model.append(el('i','cut-layer '+layer));
  cut.append(model,el('figcaption','cut-caption',words[6]+'  /  '+words[5]));
  hero.append(cut);
  const scrollLink = el('a','scroll-link',words[0]+' ↓');
  scrollLink.href='#expertise';
  $('.hero-content .actions').prepend(scrollLink);
  const expertise = $('.expertise');
  expertise.id='expertise';
  const panel = el('div','collection');
  const menu = el('div','collection-menu');
  const feature = el('article','feature');
  const visual = el('div','feature-photo');
  const img = el('img','');
  img.loading='lazy'; visual.append(img);
  const details = el('div','feature-details');
  const count=el('small','feature-count'), name=el('h3',''), desc=el('p',''), link=el('a','feature-link',words[1]+' ↗');
  details.append(count,name,desc,link); feature.append(visual,details);
  const controls=el('div','feature-pager');
  const buttons=[]; let index=0;
  function select(i) {
    index=(i+services.length)%services.length;
    const source=services[index], photo=$('img',source);
    img.src=photo.src; img.alt=photo.alt;
    name.textContent=$('h3',source).textContent;
    desc.textContent=$('p',source).textContent;
    link.href=source.href;
    count.textContent=String(index+1).padStart(2,'0')+' / '+String(services.length).padStart(2,'0');
    buttons.forEach((b,n)=>b.setAttribute('aria-pressed',String(n===index)));
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) img.animate([{opacity:.55,transform:'scale(1.035)'},{opacity:1,transform:'none'}],{duration:380});
  }
  services.forEach((service,i)=>{
    const button=el('button','', $('h3',service).textContent);
    button.type='button';button.addEventListener('click',()=>select(i));menu.append(button);buttons.push(button);
  });
  [-1,1].forEach((offset,n)=>{
    const b=el('button','',n?'→':'←');b.type='button';b.setAttribute('aria-label',words[n+2]);b.onclick=()=>select(index+offset);controls.append(b);
  });
  visual.append(controls);panel.append(menu,feature);$('.wrap',expertise).append(panel);
  services.forEach(s=>s.hidden=true);select(0);
  panel.addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();select(index+(e.key==='ArrowRight'?1:-1));if(menu.contains(e.target))buttons[index].focus();}});
  let start; visual.addEventListener('touchstart',e=>{start=e.touches.length===1?e.touches[0]:null;},{passive:true});
  visual.addEventListener('touchend',e=>{if(!start)return;const p=e.changedTouches[0],dx=p.clientX-start.clientX,dy=p.clientY-start.clientY;start=null;if(Math.abs(dx)>45&&Math.abs(dx)>Math.abs(dy)*1.5)select(index+(dx<0?1:-1));},{passive:true});
  visual.addEventListener('touchcancel',()=>{start=null;});
  const story=el('section','field-story'), sticky=el('div','field-photo'), steps=el('div','field-steps');
  const gallery=[...document.querySelectorAll('.photo-story-image img'),$('.hero-background')];
  const storyImg=el('img','');storyImg.alt='';storyImg.loading='lazy';sticky.append(storyImg);
  steps.append(el('h2','',words[4]));
  stages.forEach((s,i)=>{const block=el('article','field-step');block.append(el('small','',String(i+1).padStart(2,'0')+' / 04'),el('h3','',$('h3',s).textContent),el('p','',$('p',s).textContent));steps.append(block);});
  const more=$('.process-band .text-link').cloneNode(true);steps.append(more);story.append(sticky,steps);expertise.after(story);
  let step=-1,queued=false;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  function position(){
    queued=false;
    const bounds=hero.getBoundingClientRect(),progress=Math.min(1,Math.max(0,-bounds.top/bounds.height));
    hero.style.setProperty('--travel',reduced.matches?'0px':(progress*75)+'px');
    const blocks=[...steps.querySelectorAll('article')];let active=0;
    blocks.forEach((b,i)=>{if(b.getBoundingClientRect().top<innerHeight*.62)active=i;});
    if(step!==active){step=active;storyImg.src=gallery[step%gallery.length].src;blocks.forEach((b,i)=>b.classList.toggle('current',i===step));}
  }
  const schedule=()=>{if(!queued){queued=true;requestAnimationFrame(position);}};
  addEventListener('scroll',schedule,{passive:true});addEventListener('resize',schedule);position();
  if(matchMedia('(hover:hover)').matches) {
    hero.addEventListener('pointermove',e=>{if(reduced.matches)return;const r=hero.getBoundingClientRect();model.style.setProperty('--tilt',((e.clientX-r.left)/r.width*12-6)+'deg');});
    hero.addEventListener('pointerleave',()=>model.style.removeProperty('--tilt'));
  }
})();
