const controls = {
  nl: ['Vorige projectfoto', 'Volgende projectfoto'],
  en: ['Previous project photo', 'Next project photo'],
  fr: ['Photo précédente', 'Photo suivante']
};

export function applySiteDesign($, lang) {
  applyBrand($);
  $('head').append('<link rel="stylesheet" href="/assets/site-design.css?v=3">');
  const media = $('.hero-stage .hero-media');
  if (media.length) {
    compactHome($);
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

function applyBrand($) {
  const brand = $('header .brand');
  const logo = brand.find('.brand-wordmark img').remove().addClass('brand-original');
  brand.children().attr('hidden', '');
  brand.append(logo);
  const footer = $('footer .footer-brand');
  footer.children().attr('hidden', '');
  footer.append($('<img class="brand-original" alt="AB Firestop">').attr('src', logo.attr('src')));
}

function compactHome($) {
  $('main > .intro, main > .photo-story, main > .systems-section, main > .why, main > .process-band, main > .document-callout, main > .faq, .hero-points').attr('hidden', '');
  $('.expertise .section-heading > p, .expertise .section-heading h2 br, .expertise .section-heading h2 br ~ cms-text').attr('hidden', '');
  $('.hero-content > .eyebrow').prepend('<img class="brand-flame" src="/assets/beeldmerk.png" alt="" width="17" height="25">');
  $('.work-strip .project-card').slice(1).attr('hidden', '');
}
