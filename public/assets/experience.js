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
