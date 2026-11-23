// Decorative motion is added after CMS annotation and never changes stored fields.
export function enhanceFirePresentation($, {path}) {
  if (!['index.html','en/index.html','fr/index.html'].includes(path)) return;
  const note=$('.hero-image-note').first();
  if (!note.length || note.find('.fire-film').length) return;
  note.addClass('hero-fire-signature');
  note.prepend('<div class="fire-film" aria-hidden="true" data-presentation-only><img class="fire-emblem" src="/assets/beeldmerk.png" alt="" width="100" height="150" decoding="async"></div>');
  $('.hero-media').addClass('hero-media--fire');
  $('head').append('<link rel="stylesheet" href="/assets/fire-story.css?v=photos11" data-ab-fire-story>');
  $('body').append('<script src="/assets/fire-motion.js?v=photos11" defer data-ab-fire-motion></script>');
}
