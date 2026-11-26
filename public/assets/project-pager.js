(() => {
  const stage = document.querySelector('.hero-stage');
  const pager = stage?.querySelector('.project-pager');
  const image = stage?.querySelector('.hero-background');
  const projects = document.querySelector('.home-projects');
  if (!pager || !image || !projects) return;
  const cards = [...projects.querySelectorAll('.project-card')];
  const slides = [image, ...cards.map(card => card.querySelector('img')).filter(Boolean)]
    .map(photo => ({src: photo.getAttribute('src'), alt: photo.alt}));
  const motion = matchMedia('(prefers-reduced-motion: no-preference)');

  function animate(element) {
    if (motion.matches && element.animate) {
      element.animate([{opacity: .7}, {opacity: 1}], {duration: 320, easing: 'ease-out'});
    }
  }

  function bindSlider(region, controls, count, show) {
    let index = 0;
    const output = controls.querySelector('output');
    output.textContent = '1 / ' + count;
    controls.hidden = false;
    function step(offset) {
      index = (index + offset + count) % count;
      show(index);
      output.textContent = (index + 1) + ' / ' + count;
    }
    controls.addEventListener('click', event => {
      const button = event.target.closest('button[data-offset]');
      if (button) step(Number(button.dataset.offset));
    });
    region.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      event.preventDefault();
      const activeLink = projects.contains(document.activeElement);
      step(event.key === 'ArrowRight' ? 1 : -1);
      if (activeLink) projects.querySelector('.project-card:not([hidden])')?.focus();
    });
    let start;
    let suppressClick = false;
    region.addEventListener('touchstart', event => {
      start = event.touches.length === 1 ? event.touches[0] : null;
      suppressClick = false;
    }, {passive:true});
    region.addEventListener('touchcancel', () => { start = null; });
    region.addEventListener('touchend', event => {
      if (!start) return;
      const dx = event.changedTouches[0].clientX - start.clientX;
      const dy = event.changedTouches[0].clientY - start.clientY;
      start = null;
      if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
      suppressClick = true;
      step(dx < 0 ? 1 : -1);
    }, {passive:true});
    region.addEventListener('click', event => {
      if (suppressClick) { suppressClick = false; event.preventDefault(); event.stopPropagation(); }
    }, true);
  }

  if (slides.length > 1) bindSlider(stage, pager, slides.length, index => {
    image.src = slides[index].src;
    image.alt = slides[index].alt;
    animate(image);
  });
  if (cards.length < 2) return;
  const controls = pager.cloneNode(true);
  controls.className = 'gallery-controls';
  const labels = {
    nl: ['Vorige realisatie', 'Volgende realisatie'],
    en: ['Previous project', 'Next project'],
    fr: ['Réalisation précédente', 'Réalisation suivante']
  };
  const names = labels[document.documentElement.lang.slice(0,2)] || labels.nl;
  controls.querySelectorAll('button').forEach((button,i) => button.setAttribute('aria-label',names[i]));
  projects.after(controls);
  bindSlider(projects.parentElement, controls, cards.length, index => {
    cards.forEach(card => { card.hidden = true; });
    const card = cards[index];
    projects.prepend(card);
    card.hidden = false;
    animate(card);
  });
})();
