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

window.addEventListener('DOMContentLoaded', () => {
  const brand = document.querySelector('header .brand');
  if (!brand) return;
  const original = brand.querySelector('.brand-original');
  if (!original) return;
  document.body.classList.add('folio');
  function fragment(className, file) {
    const image = new Image();
    image.className = className;
    image.alt = '';
    image.src = new URL(file,original.src).href;
    return image;
  }
  const signature = document.createElement('span');
  signature.className = 'signature';
  const slogan = document.createElement('small');
  slogan.textContent = 'Fire Protection Sealing Services';
  signature.append(fragment('original-name','ab-wordmark.svg'),slogan);
  brand.append(fragment('original-flame','ab-flame.svg'),signature);
  const home = document.querySelector('.hero-stage');
  if (!home) return;
  const cards = [...document.querySelectorAll('.home-projects .project-card')];
  const projectSection = document.querySelector('.work-strip');
  const expertise = document.querySelector('.expertise');
  if (!cards.length || !projectSection || !expertise) return;
  expertise.before(projectSection);
  const projects = new Map(cards.map(card => [card.href.split('/').pop(),card]));
  const language = document.documentElement.lang.slice(0,2);
  const titles = {
    nl:['Brandveiligheid.','Tot in het detail.','Bekijk de werf'],
    en:['Fire protection.','Down to the detail.','Explore the project'],
    fr:['Protection incendie.','Dans chaque détail.','Voir le chantier']
  }[language];
  const rail = document.createElement('div');
  rail.className = 'photo-rail';
  const frame = document.createElement('section');
  frame.className = 'project-cover';
  const background = document.createElement('img');
  background.className = 'cover-image';
  background.fetchPriority = 'high';
  const text = document.createElement('div');
  text.className = 'cover-content';
  const heading = document.createElement('h1');
  heading.append(titles[0],document.createElement('br'),titles[1]);
  const eyebrow = home.querySelector('.eyebrow').cloneNode(true);
  const projectLink = document.createElement('a');
  projectLink.className = 'cover-link';
  projectLink.textContent = titles[2]+' ↗';
  text.append(eyebrow,heading,projectLink);
  frame.append(background,text,rail);
  home.replaceWith(frame);
  const selections = [
    ['aquafin-gent','Aquafin Gent',6],['kortemark','Kortemark',6],
    ['interbad-brugge','Interbad Brugge',11],['abattoir-molenbeek','Abattoir Molenbeek',8]
  ];
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const choices = [];
  function select(i) {
    const {picture,card} = choices[i];
    background.src = picture.dataset.full;
    background.alt = picture.alt;
    projectLink.href = card.href;
    choices.forEach(({button},idx)=>button.setAttribute('aria-pressed',String(i===idx)));
    if (!reduced.matches) {
      background.getAnimations().forEach(animation => animation.cancel());
      background.animate([{filter:'brightness(.65)', transform:'scale(1.055)'},{filter:'brightness(1)', transform:'scale(1)'}],{duration:430,easing:'cubic-bezier(.2,.75,.2,1)'});
    }
  }
  for (const [key,name,n] of selections) {
    const card = [...projects.values()].find(c=>c.href.includes(key));
    if (!card) continue;
    const picture = new Image();
    picture.dataset.full = new URL(key+'-'+n+'.webp',card.querySelector('img').src).href;
    picture.src = picture.dataset.full.replace('.webp','-thumb.webp');
    picture.alt = card.querySelector('img').alt;
    const button = document.createElement('button');
    button.type='button';
    const label=document.createElement('span');
    label.textContent=name;
    button.append(picture,label);
    const i=choices.length;
    button.onclick=()=>select(i);
    choices.push({card,picture,button});
    rail.append(button);
  }
  if (!choices.length) return;
  select(0);
  let touch;
  frame.addEventListener('touchstart', event => {
    touch = event.touches.length === 1 ? event.touches[0] : null;
  }, {passive:true});
  frame.addEventListener('touchcancel', () => { touch = null; });
  function advance(offset) {
    const index = choices.findIndex(({button}) => button.getAttribute('aria-pressed') === 'true');
    select((index + offset + choices.length) % choices.length);
  }
  frame.addEventListener('touchend', event => {
    if (!touch) return;
    const end = event.changedTouches[0];
    const dx = end.clientX - touch.clientX;
    const dy = end.clientY - touch.clientY;
    touch = null;
    if (Math.abs(dx) > 48 && Math.abs(dx) > 1.5 * Math.abs(dy)) advance(dx < 0 ? 1 : -1);
  }, {passive:true});
  rail.addEventListener('keydown', event => {
    if (!['ArrowRight','ArrowLeft'].includes(event.key)) return;
    event.preventDefault();
    advance(event.key === 'ArrowRight' ? 1 : -1);
    rail.querySelector('[aria-pressed="true"]').focus();
  });
});

// Decorative motion follows the visitor's viewport and motion preferences.
window.addEventListener('DOMContentLoaded', () => {
  if (!document.body.classList.contains('folio')) return;
  const preference = matchMedia('(prefers-reduced-motion: reduce)');
  const copyObserver = new IntersectionObserver(entries => {
    for (const {target,isIntersecting} of entries) {
      if (!isIntersecting) continue;
      copyObserver.unobserve(target);
      if (!preference.matches) target.animate([
        {opacity:.55, translate:'0 12px',clipPath:'inset(0 0 10% 0)'},
        {opacity:1, translate:'0 0',clipPath:'inset(0)'}
      ], {duration:390,easing:'cubic-bezier(.2,.75,.22,1)'});
    }
  },{threshold:.1});
  document.querySelectorAll('main h2, main h3, main .lead, main .eyebrow').forEach(el=>copyObserver.observe(el));
});

window.addEventListener('DOMContentLoaded', () => {
  const hero = document.querySelector('.project-cover');
  const flame = document.querySelector('header .original-flame');
  if (!hero || !flame || matchMedia('(prefers-reduced-motion:reduce)').matches) return;
  try {
    if (sessionStorage.getItem('ab-drawing-seen')) return;
    sessionStorage.setItem('ab-drawing-seen','1');
  } catch {}
  const intro = document.createElement('div');
  intro.className = 'drawing-intro';
  intro.setAttribute('aria-hidden','true');
  const mark = new Image();
  mark.src = flame.src;
  mark.alt = '';
  intro.append(mark);
  for (const offset of [-1,0,1]) {
    const spark = document.createElement('i');
    spark.style.setProperty('--side',offset);
    intro.append(spark);
  }
  hero.append(intro);
  intro.addEventListener('animationend',event=>{
    if (event.animationName === 'drawing-sheet') intro.remove();
  });
});

window.addEventListener('DOMContentLoaded', () => {
  for (const image of document.querySelectorAll('.project-gallery .photo-button[data-image] img')) {
    image.srcset = image.closest('.photo-button').dataset.image;
  }
});

window.addEventListener('DOMContentLoaded', () => {
  const footer = document.querySelector('footer');
  const mail = footer?.querySelector('a[href^="mailto:"]');
  const phone = document.querySelector('header a[href^="tel:"]');
  if (!mail || !phone) return;
  const call = document.createElement('a');
  call.href = phone.href;
  call.textContent = phone.textContent.trim();
  mail.after(call);
  const paths = [
    'M3 5h18v14H3z M3 6l9 7 9-7',
    'M6 3l4 4-2 3c1 3 3 5 6 6l3-2 4 4-2 3C11 22 2 13 3 5z'
  ];
  [mail,call].forEach((link,index)=>{
    const ns = 'http://www.w3.org/2000/svg';
    const icon = document.createElementNS(ns,'svg');
    const path = document.createElementNS(ns,'path');
    icon.setAttribute('viewBox','0 0 24 24');
    icon.setAttribute('aria-hidden','true');
    path.setAttribute('d',paths[index]);
    icon.append(path);
    link.classList.add('footer-action');
    link.prepend(icon);
  });
  for (const link of footer.querySelectorAll('a[target="_blank"]')) {
    const source = [...document.querySelectorAll('header .social-mini a')].find(a=>a.href===link.href);
    const icon = source?.querySelector('svg')?.cloneNode(true);
    if (icon) { link.prepend(icon);link.classList.add('social-action'); }
  }
});

// Animate on arrival so links, history and opening a new tab retain native behaviour.
window.addEventListener('pageshow', event => {
  if (!document.body.classList.contains('folio') ||
      matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const returning = performance.getEntriesByType('navigation')[0]?.type === 'back_forward';
  const internal = document.referrer && new URL(document.referrer).origin === location.origin;
  if (!event.persisted && !returning && !internal) return;
  const mark = document.querySelector('header .original-flame');
  if (!mark) return;
  document.querySelector('.page-flame')?.remove();
  const flash = document.createElement('span');
  flash.className = 'page-flame';
  flash.setAttribute('aria-hidden','true');
  const icon = new Image();
  icon.src = mark.src;
  icon.alt = '';
  flash.append(icon);
  document.body.append(flash);
  flash.addEventListener('animationend', e=>{
    if (e.target === flash) flash.remove();
  });
});
