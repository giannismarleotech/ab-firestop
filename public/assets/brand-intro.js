(()=>{
  if(window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  try{if(sessionStorage.getItem('ab-firestop-intro'))return;sessionStorage.setItem('ab-firestop-intro','1');}catch{return;}
  document.documentElement.classList.add('ab-intro');
  const finish=()=>{document.documentElement.classList.remove('ab-intro');document.getElementById('brand-intro')?.remove();};
  window.setTimeout(finish,850);
  window.addEventListener('pageshow',event=>{if(event.persisted)finish();});
})();
