import { readdir,readFile,writeFile } from 'node:fs/promises';
import { load } from 'cheerio';
import { enhancePresentation } from './presentation.mjs';
import { enhancePhotoStory } from './photo-story.mjs';
import { enhanceFirePresentation } from './fire-presentation.mjs';
import { enhanceHomeLayout } from './home-layout.mjs';
import { applySiteDesign } from './site-design.mjs';
import { buildIcons } from './build-icons.mjs';
const rewriteCopy=value=>value
  .replace(/specialisten/gi,word=>word===word.toUpperCase()?'SPECIALISATIE':word[0]==='S'?'Specialisatie':'specialisatie')
  .replace(/PASSIVE FIRE PROTECTION SPECIALISTS/g,'SPECIALISATION IN PASSIVE FIRE PROTECTION')
  .replace(/Specialists in/g,'Specialising in')
  .replace(/SPÉCIALISTES EN/g,'SPÉCIALISATION EN')
  .replace(/Spécialistes en/g,'Spécialisation en')
  .replace(/Spécialistes du/g,'Spécialisation dans le');
const templates={},redirects=[];
for(const prefix of ['', 'fr/', 'en/']){
  for(const name of (await readdir('public/'+prefix)).filter(n=>n.endsWith('.html'))){
    const path=prefix+name,$=load(await readFile('public/'+path,'utf8')),fields={};let number=0;
    $('h1,h2,h3,h4,p,li,a,span,strong,small,button,label,figcaption,em,b,dt,dd').each((_,el)=>{
      if($(el).closest('svg,script,style,head').length)return;
      for(const node of [...el.children])if(node.type==='text'&&node.data.trim()){
        const id='text-'+number++;const value=rewriteCopy(node.data);
        fields[id]={type:'text',label:el.tagName.toUpperCase(),value,...(value!==node.data?{legacyValue:node.data}:{}),area:$(el).closest('header').length?'Menu en bovenbalk':$(el).closest('footer').length?'Voettekst':'Pagina-inhoud'};
        const span=$('<cms-text></cms-text>').attr('data-cms',id).text(value);$(node).replaceWith(span);
      }
    });
    $('img').each((_,el)=>{if($(el).closest('.brand-intro').length)return;const id='image-'+number++;const oldSource=$(el).attr('src')??'';
      const home=path==='index.html'||path==='en/index.html'||path==='fr/index.html';
      const replacements={'interbad-brugge-6-thumb.webp':'interbad-brugge-11.webp','kortemark-2-thumb.webp':'kortemark-6.webp','abattoir-molenbeek-3-thumb.webp':'abattoir-molenbeek-3.webp','aquafin-gent-6-thumb.webp':'aquafin-gent-2.webp'};
      let value=oldSource;
      if(home&&$(el).hasClass('hero-background'))value=oldSource.replace('aquafin-gent-4.webp','aquafin-gent-6.webp');
      else if(home&&$(el).closest('.home-projects').length){for(const [from,to] of Object.entries(replacements))value=value.replace(from,to);}
      fields[id]={type:'image',label:'Foto',value,...(value!==oldSource?{legacyValue:oldSource}:{}),alt:$(el).attr('alt')??'',area:'Foto’s'};$(el).attr('data-cms',id);});
    $('head').append('<link rel="stylesheet" href="/assets/cms-gallery.css">');
    $('meta[name="description"]').each((_,el)=>$(el).attr('content',rewriteCopy($(el).attr('content')||'')));
    $('body').attr('data-cms-page',path).append('<script src="/assets/analytics.js" defer></script>');
    enhancePresentation($,{path,lang:prefix.slice(0,2)||'nl'});
    enhancePhotoStory($,{path,lang:prefix.slice(0,2)||'nl'});
    enhanceFirePresentation($,{path,lang:prefix.slice(0,2)||'nl'});
    enhanceHomeLayout($);
    applySiteDesign($, prefix.slice(0, 2) || 'nl');
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
await buildIcons();
console.log(`${Object.keys(templates).length} pagina’s voorbereid voor beheer.`);
