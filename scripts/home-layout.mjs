// Keep the dashboard's field IDs intact by moving sections after annotation.
export function enhanceHomeLayout($) {
  if (!$('body').hasClass('ab-home')) return;

  $('head').append('<link rel="stylesheet" href="/assets/home-layout.css?v=1">');
  const hero = $('.new-hero');
  const expertise = $('.expertise');
  const projects = $('.work-strip');

  // The photo and heading share a stage. The proof points sit below it.
  const stage = $('<div class="hero-stage"></div>');
  hero.prepend(stage);
  stage.append(hero.children('.hero-media'), hero.children('.hero-content'));

  expertise.after($('.cta'), projects);
  projects.find('.project-card').each((_, element) => {
    const card = $(element);
    const details = $('<div class="project-card-details"></div>');
    card.append(details);
    details.append(card.children('.project-card-meta, h3, p, .project-card-link'));
  });
}
