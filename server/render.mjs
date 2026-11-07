import { load } from 'cheerio';
export function render(template,content,previewOrigin){
  const $=load(template.html);
  for(const [id,field] of Object.entries(template.fields)){
    const node=$(`[data-cms="${id}"]`);const value=content.values[id]??field.value;
    if(field.type==='image'){
      node.attr('src',value).attr('alt',content.values[id+'-alt']??field.alt);
      if(value!==field.value){node.removeAttr('srcset');node.closest('picture').find('source').remove();}
    }else node.text(value);
  }
  if(content.extras.length){
    const section=$('<section class="cms-gallery wrap" aria-label="Projectfoto’s"></section>');
    for(const photo of content.extras){const figure=$('<figure></figure>');figure.append($('<img loading="lazy">').attr('src',photo.src).attr('alt',photo.alt));if(photo.alt)figure.append($('<figcaption></figcaption>').text(photo.alt));section.append(figure);}
    $('main').append(section);
  }
  $('base').remove();
  $('head').prepend($('<base>').attr('href',previewOrigin?new URL(template.path,previewOrigin+'/').href:'/'+template.path));
  if(previewOrigin)$('script').remove();
  return $.html();
}
