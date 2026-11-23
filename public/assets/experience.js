/* Enhancements only: content and navigation work without this file. */
(()=>{
  const body=document.body;
  if(!body.classList.contains('ab-experience'))return;
  const preference=matchMedia('(prefers-reduced-motion: reduce)');
  const toggle=document.querySelector('.motion-toggle');
  const hero=document.querySelector('.new-hero');
  let paused=false,observer,heroObserver;
  try{paused=sessionStorage.getItem('ab-motion-paused')==='true';}catch{}
  function updateButton(){
    body.classList.toggle('motion-paused',paused);
    if(!toggle)return;
    toggle.hidden=preference.matches;
    toggle.setAttribute('aria-pressed',String(paused));
    toggle.textContent=paused?toggle.dataset.playLabel:toggle.dataset.pauseLabel;
  }
  function start(){
    observer?.disconnect();heroObserver?.disconnect();
    document.querySelectorAll('.ab-enter').forEach(el=>el.classList.remove('ab-enter'));
    body.classList.toggle('motion-ready',!preference.matches);
    updateButton();
    if(preference.matches)return;
    if(hero){
      hero.classList.add('hero-visible');
      if('IntersectionObserver' in window){
        heroObserver=new IntersectionObserver(entries=>entries.forEach(entry=>hero.classList.toggle('hero-visible',entry.isIntersecting)),{threshold:0});
        heroObserver.observe(hero);
      }
    }
    if(!('IntersectionObserver' in window))return;
    const items=document.querySelectorAll('.intro-grid>div,.systems-copy,.system-logo,.service-row,.why>div,.process-track,.project-card,.document-callout>div,.faq>div,.cta>*,.detail-grid>div,.team-grid article,.project-gallery figure');
    observer=new IntersectionObserver(entries=>{
      let order=0;
      for(const entry of entries){
        if(!entry.isIntersecting)continue;
        observer.unobserve(entry.target);
        // Never hide text before observation; animate only genuinely offscreen content.
        if(!paused && entry.boundingClientRect.top>24){
          entry.target.style.setProperty('--reveal-delay',Math.min(order++,3)*65+'ms');
          entry.target.classList.add('ab-enter');
        }
      }
    },{threshold:.06,rootMargin:'0px 0px -20px 0px'});
    items.forEach(el=>observer.observe(el));
  }
  toggle?.addEventListener('click',()=>{
    paused=!paused;
    try{sessionStorage.setItem('ab-motion-paused',String(paused));}catch{}
    // Pausing must never leave a revealed section half transparent.
    if(paused)document.querySelectorAll('.ab-enter').forEach(el=>el.classList.remove('ab-enter'));
    updateButton();
  });
  preference.addEventListener('change',start);
  document.addEventListener('visibilitychange',()=>{
    if(hero)hero.classList.toggle('hero-visible',!document.hidden && hero.getBoundingClientRect().bottom>0);
  });
  start();
})();
