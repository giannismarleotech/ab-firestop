const controls = {
  nl: ['Vorige projectfoto', 'Volgende projectfoto'],
  en: ['Previous project photo', 'Next project photo'],
  fr: ['Photo précédente', 'Photo suivante']
};

export function applySiteDesign($, lang) {
  $('head').append('<link rel="stylesheet" href="/assets/site-design.css?v=1">');
  const media = $('.hero-stage .hero-media');
  if (media.length) {
    media.find('.hero-image-note').remove();
    $('script[src*="fire-motion.js"]').remove();
    const pager = $('<div class="project-pager" hidden></div>');
    for (const [index, label] of controls[lang].entries()) {
      pager.append($('<button type="button"></button>').attr('aria-label', label)
        .attr('data-offset', index ? '1' : '-1').text(index ? '›' : '‹'));
    }
    pager.children().first().after('<output aria-live="polite"></output>');
    media.append(pager);
    $('.new-hero').after($('.expertise'));
    $('main').append($('.cta'));
    $('body').append('<script src="/assets/project-pager.js" defer></script>');
    return;
  }

  const heading = $('main > .page-head, main > .detail-head').first();
  const image = $('main img[src*="/projects/"], main img[src*="/werk-"]').first();
  const photo = image.attr('src') || '/assets/projects/interbad-brugge-11.webp';
  heading.prepend($('<img class="page-cover" alt="" decoding="async">').attr('src', photo));
}
