const copy = {
  nl: {
    eyebrow: 'Materialen & systemen',
    heading: ['Sterke systemen.', 'Zorgvuldig verwerkt.'],
    description: 'De toepassing bepaalt de systeemkeuze. Met aandacht voor voorbereiding, uitvoering en de juiste afwerking.',
    pause: 'Animatie pauzeren',
    play: 'Animatie hervatten'
  },
  en: {
    eyebrow: 'Materials & systems',
    heading: ['Strong systems.', 'Carefully installed.'],
    description: 'The application guides the choice of system. Preparation, installation and finishing all deserve attention.',
    pause: 'Pause animation',
    play: 'Resume animation'
  },
  fr: {
    eyebrow: 'Matériaux & systèmes',
    heading: ['Des systèmes solides.', 'Une mise en œuvre soignée.'],
    description: 'Le choix du système dépend de l’application. La préparation, la mise en œuvre et la finition méritent la même attention.',
    pause: 'Mettre l’animation en pause',
    play: 'Reprendre l’animation'
  }
};

// Run only after CMS annotation: presentation-only additions must never renumber
// the existing text/image fields or replace saved customer content.
export function enhancePresentation($, {path, lang = 'nl'}) {
  const page = String(path || '').replace(/^\/+/, '');
  if (!page || page === 'admin' || page.startsWith('admin/')) return;

  const body = $('body').addClass('ab-experience');
  if (!$('link[data-ab-experience]').length) {
    $('head').append('<link rel="stylesheet" href="/assets/experience.css?v=20261123" data-ab-experience>');
  }
  if (!$('script[data-ab-experience]').length) {
    body.append('<script src="/assets/experience.js?v=20261123" data-ab-experience defer></script>');
  }

  if (!['index.html', 'en/index.html', 'fr/index.html'].includes(page)) return;
  body.addClass('ab-home');
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
  if (hero.length && !hero.find('.motion-toggle').length) {
    const toggle = $('<button type="button" class="motion-toggle" aria-pressed="false" hidden></button>')
      .attr('data-pause-label', text.pause)
      .attr('data-play-label', text.play)
      .text(text.pause);
    hero.append(toggle);
  }
}
