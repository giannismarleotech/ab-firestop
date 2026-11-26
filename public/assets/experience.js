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
  // Both fragments reference the original transparent artwork, including its lettering.
  function fragment(className) {
    const span = document.createElement('span');
    span.className = className;
    span.style.backgroundImage = 'url("' + original.src + '")';
    span.setAttribute('aria-hidden','true');
    return span;
  }
  const signature = document.createElement('span');
  signature.className = 'signature';
  const slogan = document.createElement('small');
  slogan.textContent = 'Fire Protection Sealing Services';
  signature.append(fragment('original-name'),slogan);
  brand.append(fragment('original-flame'),signature);
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
    background.src = picture.src;
    background.alt = picture.alt;
    projectLink.href = card.href;
    choices.forEach(({button},idx)=>button.setAttribute('aria-pressed',String(i===idx)));
    if (!reduced.matches) background.animate([{opacity:.7,scale:1.035},{opacity:1,scale:1}],{duration:680,easing:'ease-out'});
  }
  for (const [key,name,n] of selections) {
    const card = [...projects.values()].find(c=>c.href.includes(key));
    if (!card) continue;
    const picture = new Image();
    picture.src = new URL(key+'-'+n+'.webp',card.querySelector('img').src).href;
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
  if(choices.length)select(0);
});
