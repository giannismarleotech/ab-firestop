(() => {
  const pager = document.querySelector('.project-pager');
  const image = document.querySelector('.hero-background');
  if (!pager || !image) return;
  const slides = [{src: image.getAttribute('src'), alt: image.alt}];
  for (const card of document.querySelectorAll('.home-projects .project-card')) {
    const photo = card.querySelector('img');
    if (photo) slides.push({src: photo.getAttribute('src'), alt: photo.alt || card.querySelector('h3').textContent});
  }
  if (slides.length < 2) return;
  let index = 0;
  const output = pager.querySelector('output');
  output.textContent = '1 / ' + slides.length;
  pager.hidden = false;
  pager.addEventListener('click', event => {
    const button = event.target.closest('button[data-offset]');
    if (!button) return;
    index = (index + Number(button.dataset.offset) + slides.length) % slides.length;
    image.src = slides[index].src;
    image.alt = slides[index].alt;
    output.textContent = (index + 1) + ' / ' + slides.length;
  });
})();
