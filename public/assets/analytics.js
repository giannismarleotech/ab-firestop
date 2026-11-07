(()=>{
  const page=document.body.dataset.cmsPage;
  if(!page||window.top!==window.self||document.visibilityState==='prerender')return;
  fetch('/.netlify/functions/track',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({page}),keepalive:true}).catch(()=>{});
})();
