import { readdir,readFile,writeFile } from 'node:fs/promises';
import { load } from 'cheerio';
const templates={},redirects=[];
for(const prefix of ['', 'fr/', 'en/']){
  for(const name of (await readdir('public/'+prefix)).filter(n=>n.endsWith('.html'))){
    const path=prefix+name,$=load(await readFile('public/'+path,'utf8')),fields={};let number=0;
    $('h1,h2,h3,h4,p,li,a,span,strong,small,button,label,figcaption,em,b,dt,dd').each((_,el)=>{
      if($(el).closest('svg,script,style,head').length)return;
      for(const node of [...el.children])if(node.type==='text'&&node.data.trim()){
        const id='text-'+number++;const value=node.data;
        fields[id]={type:'text',label:el.tagName.toUpperCase(),value,area:$(el).closest('header').length?'Menu en bovenbalk':$(el).closest('footer').length?'Voettekst':'Pagina-inhoud'};
        const span=$('<cms-text></cms-text>').attr('data-cms',id).text(value);$(node).replaceWith(span);
      }
    });
    $('img').each((_,el)=>{if($(el).closest('.brand-intro').length)return;const id='image-'+number++;fields[id]={type:'image',label:'Foto',value:$(el).attr('src')??'',alt:$(el).attr('alt')??'',area:'Foto’s'};$(el).attr('data-cms',id);});
    $('head').append('<link rel="stylesheet" href="/assets/cms-gallery.css">');
    $('body').attr('data-cms-page',path).append('<script src="/assets/analytics.js" defer></script>');
    templates[path]={path,title:$('title').text().split('|')[0].trim(),lang:prefix.slice(0,2)||'nl',html:$.html(),fields};
    const target='/.netlify/functions/page?page='+path;
    redirects.push('/'+path+' '+target+' 200!');
    const clean='/'+path.replace(/index\.html$/,'').replace(/\.html$/,'');
    redirects.push(clean+' '+target+' 200!');
    if(clean.endsWith('/')&&clean!=='/')redirects.push(clean.slice(0,-1)+' '+target+' 200!');
    else if(!clean.endsWith('/'))redirects.push(clean+'/'+' '+target+' 200!');
  }
}
await writeFile('server/templates.json',JSON.stringify(templates));
await writeFile('public/_redirects',redirects.join('\n')+'\n');
console.log(`${Object.keys(templates).length} pagina’s voorbereid voor beheer.`);
