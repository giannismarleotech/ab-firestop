const copy = {
  nl: {eyebrow:'Materialen & systemen',heading:['Sterke systemen.','Zorgvuldig verwerkt.'],description:'De toepassing bepaalt de systeemkeuze. Met aandacht voor voorbereiding, uitvoering en de juiste afwerking.',note:'Precisie op elke werf.',photo:'Brandwerende afwerking · AB Firestop'},
  en: {eyebrow:'Materials & systems',heading:['Strong systems.','Carefully installed.'],description:'The application guides the choice of system. Preparation, installation and finishing all deserve attention.',note:'Precision on every site.',photo:'Passive fire protection · AB Firestop'},
  fr: {eyebrow:'Matériaux & systèmes',heading:['Des systèmes solides.','Une mise en œuvre soignée.'],description:'Le choix du système dépend de l’application. La préparation, la mise en œuvre et la finition méritent la même attention.',note:'La précision sur chaque chantier.',photo:'Protection passive incendie · AB Firestop'}
};

// Presentation follows CMS annotation: move existing fields, never renumber them.
export function enhancePresentation($, {path, lang = 'nl'}) {
  const page=String(path||'').replace(/^\/+/, '');
  if(!page||page==='admin'||page.startsWith('admin/'))return;
  const body=$('body').addClass('ab-experience');
  $('head link[rel="icon"],head link[rel="shortcut icon"],head link[rel="apple-touch-icon"]').remove();
  $('head').append('<link rel="icon" href="/favicon.ico?v=editorial10" sizes="any"><link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png?v=editorial10"><link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png?v=editorial10">');
  for(const [file,attribute] of [['experience.css','data-ab-experience'],['pages-v10.css','data-ab-pages'],['navigation-v10.css','data-ab-navigation']]){
    if(!$(`link[${attribute}]`).length)$('head').append(`<link rel="stylesheet" href="/assets/${file}?v=editorial10" ${attribute}>`);
  }
  if(!$('script[data-ab-experience]').length)body.append('<script src="/assets/experience.js?v=editorial10" data-ab-experience defer></script>');
  $('.fire-stage,.heat-stage,.hero-light,#brand-intro,script[data-ab-fire],script[data-ab-heat],script[src*="fire-scene.js"],script[src*="heat-scene.js"],script[src*="brand-intro.js"]').remove();
  if(!['index.html','en/index.html','fr/index.html'].includes(page))return;
  body.addClass('ab-home');
  const text=copy[lang]||copy.nl;
  const hero=$('.new-hero').first();
  if(hero.length&&!hero.find('.hero-media').length){
    const media=$('<div class="hero-media"></div>');
    const photo=hero.find('.hero-background').first();
    if(photo.length)media.append(photo);
    media.append($('<div class="hero-image-note" aria-hidden="true" data-presentation-only></div>').append($('<span></span>').text(text.photo)).append($('<strong></strong>').text(text.note)));
    hero.find('.hero-content').after(media);
    const summary=$('<div class="hero-summary"></div>');
    summary.append(hero.find('.hero-content .lead').first(),hero.find('.hero-content .actions').first());
    hero.find('.hero-content').append(summary);
    hero.find('.hero-shade,.motion-toggle').remove();
  }
  // Start with built work, then explain the specialist execution behind it.
  const projects=$('.work-strip').first();
  if(hero.length&&projects.length)hero.after(projects);
  $('.project-card').removeAttr('data-depth');

  if(!$('.systems-section').length&&$('.expertise').length){
    const section=$('<section class="systems-section wrap" aria-labelledby="systems-heading" data-presentation-only></section>');
    const content=$('<div class="systems-copy"></div>').append($('<p class="eyebrow"></p>').text(text.eyebrow));
    content.append($('<h2 id="systems-heading"></h2>').text(text.heading[0]).append('<br>').append($('<span></span>').text(text.heading[1]))).append($('<p></p>').text(text.description));
    const logos=$('<div class="systems-logos"></div>');
    logos.append('<figure class="system-logo system-logo--mulcol"><img src="/assets/brands/mulcol.jpeg" alt="Mulcol Fire Protection" width="366" height="138" loading="lazy" decoding="async"></figure>');
    logos.append('<figure class="system-logo system-logo--promat"><img src="/assets/brands/promat.jpeg" alt="Promat by Etex" width="2000" height="909" loading="lazy" decoding="async"></figure>');
    section.append(content,logos);$('.expertise').first().after(section);
  }
  const photos=['interbad-brugge-11','aquafin-gent-4','kortemark-6','q8-gent-1','abattoir-molenbeek-3','aquafin-gent-10'];
  $('.service-row').each((index,el)=>{
    if(!$(el).find('.service-visual').length)$(el).prepend(`<div class="service-visual" aria-hidden="true" data-presentation-only><img src="/assets/projects/${photos[index%photos.length]}-thumb.webp" alt="" width="640" height="420" loading="lazy" decoding="async"></div>`);
  });
}
