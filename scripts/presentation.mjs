const copy = {
  nl: {
    eyebrow: 'Materialen & systemen',
    heading: ['Sterke systemen.', 'Zorgvuldig verwerkt.'],
    description: 'De toepassing bepaalt de systeemkeuze. Met aandacht voor voorbereiding, uitvoering en de juiste afwerking.'
  },
  en: {
    eyebrow: 'Materials & systems',
    heading: ['Strong systems.', 'Carefully installed.'],
    description: 'The application guides the choice of system. Preparation, installation and finishing all deserve attention.'
  },
  fr: {
    eyebrow: 'Matériaux & systèmes',
    heading: ['Des systèmes solides.', 'Une mise en œuvre soignée.'],
    description: 'Le choix du système dépend de l’application. La préparation, la mise en œuvre et la finition méritent la même attention.'
  }
};

// Run only after CMS annotation: presentation-only additions must never renumber
// the existing text/image fields or replace saved customer content.
export function enhancePresentation($, {path, lang = 'nl'}) {
  const page = String(path || '').replace(/^\/+/, '');
  if (!page || page === 'admin' || page.startsWith('admin/')) return;

  const body = $('body').addClass('ab-experience');
  $('head link[rel="icon"],head link[rel="shortcut icon"],head link[rel="apple-touch-icon"]').remove();
  $('head').append('<link rel="icon" href="/favicon.ico?v=relief7-final" sizes="any"><link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png?v=relief7-final"><link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png?v=relief7-final">');
  if (!$('link[data-ab-experience]').length) {
    $('head').append('<link rel="stylesheet" href="/assets/experience.css?v=relief7-final" data-ab-experience>');
  }
  if (!$('script[data-ab-experience]').length) {
    body.append('<script src="/assets/experience.js?v=relief7-final" data-ab-experience defer></script>');
  }

  $('.fire-stage,script[data-ab-fire]').remove();
  if (!['index.html', 'en/index.html', 'fr/index.html'].includes(page)) return;
  body.addClass('ab-home');
  $('#brand-intro,script[src*="brand-intro.js"]').remove();
  if (!$('script[data-ab-heat]').length) body.append('<script src="/assets/heat-scene.js?v=relief7-final" data-ab-heat defer></script>');
  const text = copy[lang] || copy.nl;

  if (!$('.systems-section').length && $('.intro').length) {
    const section = $('<section class="systems-section wrap" aria-labelledby="systems-heading" data-presentation-only></section>');
    const content = $('<div class="systems-copy"></div>');
    content.append($('<p class="eyebrow"></p>').text(text.eyebrow));
    const heading = $('<h2 id="systems-heading"></h2>').text(text.heading[0]);
    heading.append('<br>').append($('<span></span>').text(text.heading[1]));
    content.append(heading).append($('<p></p>').text(text.description));
    const logos = $('<div class="systems-logos"></div>');
    logos.append('<figure class="system-logo system-logo--mulcol"><img src="/assets/brands/mulcol.jpeg" alt="Mulcol Fire Protection" width="366" height="138" loading="lazy" decoding="async"></figure>');
    logos.append('<figure class="system-logo system-logo--promat"><img src="/assets/brands/promat.jpeg" alt="Promat by Etex" width="2000" height="909" loading="lazy" decoding="async"></figure>');
    section.append(content, logos);
    $('.intro').first().after(section);
  }

  const hero = $('.new-hero').first();
  if (hero.length && !hero.find('.heat-stage').length) {
    const stage=$('<div class="heat-stage" aria-hidden="true" data-presentation-only><div class="heat-fallback"></div><canvas class="heat-canvas"></canvas><div class="heat-joint"></div></div>');
    hero.find('.hero-content').after(stage);
    if (!stage.parent().length) hero.append(stage);
    hero.append('<div class="hero-light" aria-hidden="true" data-presentation-only></div>');
  }
  const photos=['interbad-brugge-0','aquafin-gent-4','kortemark-4','q8-gent-1','abattoir-molenbeek-2','aquafin-gent-10'];
  $('.service-row').each((index,el)=>{
    if ($(el).find('.service-visual').length) return;
    $(el).attr('data-depth','').prepend(`<div class="service-visual" aria-hidden="true"><img src="/assets/projects/${photos[index%photos.length]}-thumb.webp" alt="" width="640" height="420" loading="lazy" decoding="async"></div>`);
  });
  $('.project-card').attr('data-depth','');
  hero.find('.motion-toggle').remove();
}
