const translations = {
  nl: {
    eyebrow: 'Van dichtbij', heading: 'Ons werk. In beeld.',
    description: 'Van leidingdoorvoering tot technische ruimte. Een blik op onze uitvoering op de werf.',
    allProjects: 'Bekijk alle realisaties', projectLink: 'Bekijk dit project',
    panorama: [
      ['Interbad · Brugge', 'Afwerking rond leidingen', 'Brandwerende afwerking rondom leidingen op de werf van Interbad in Brugge'],
      ['Abattoir · Molenbeek', 'Bescherming rond de installatie', 'Witte brandwerende bekleding rond een ventilatiedoorvoering in Abattoir Molenbeek'],
      ['Kortemark', 'Zorg voor elk aansluitdetail', 'Afgedichte ventilatiekanalen en kabelgoten op de werf in Kortemark']
    ],
    serviceAlts: ['Afgewerkte ventilatiedoorvoering bij Interbad Brugge', 'Technische installaties op de werf van Aquafin Gent', 'Afwerking rond leidingen en een ventilatiekanaal in Kortemark', 'Aansluitdetails bij Q8 Gent', 'Bekleding rond een technische installatie in Abattoir Molenbeek', 'Gemarkeerde leidingdoorvoering bij Aquafin Gent']
  },
  fr: {
    eyebrow: 'Sur le terrain', heading: 'Notre travail. En images.',
    description: 'Des traversées de conduites aux locaux techniques. Découvrez notre travail sur chantier.',
    allProjects: 'Voir toutes les réalisations', projectLink: 'Voir ce projet',
    panorama: [
      ['Interbad · Bruges', 'Finitions autour des conduites', 'Finition coupe-feu autour des conduites sur le chantier Interbad à Bruges'],
      ['Abattoir · Molenbeek', 'Protection des installations', 'Habillage coupe-feu blanc autour d’une traversée de ventilation à l’Abattoir de Molenbeek'],
      ['Kortemark', 'Le soin de chaque raccord', 'Conduits de ventilation et chemins de câbles calfeutrés sur le chantier de Kortemark']
    ],
    serviceAlts: ['Traversée de ventilation achevée chez Interbad à Bruges', 'Installations techniques sur le chantier Aquafin à Gand', 'Finitions autour de conduites et d’un conduit de ventilation à Kortemark', 'Détails de raccordement chez Q8 à Gand', 'Habillage autour d’une installation technique à l’Abattoir de Molenbeek', 'Traversée de conduite identifiée chez Aquafin à Gand']
  },
  en: {
    eyebrow: 'A closer look', heading: 'Our work. In focus.',
    description: 'From pipe penetrations to technical rooms. A closer look at our work on site.',
    allProjects: 'Explore all projects', projectLink: 'View this project',
    panorama: [
      ['Interbad · Bruges', 'Finishing around pipework', 'Fire-resistant finishing around pipes at the Interbad site in Bruges'],
      ['Abattoir · Molenbeek', 'Protection around the installation', 'White fire-resistant casing around a ventilation penetration at Abattoir Molenbeek'],
      ['Kortemark', 'Care in every connection', 'Sealed ventilation ducts and cable trays on the Kortemark site']
    ],
    serviceAlts: ['Completed ventilation penetration at Interbad Bruges', 'Technical installations at the Aquafin Ghent site', 'Finishing around pipes and a ventilation duct in Kortemark', 'Connection details at Q8 Ghent', 'Casing around a technical installation at Abattoir Molenbeek', 'Labelled pipe penetration at Aquafin Ghent']
  }
};
const panorama = [
  {image: 'interbad-brugge-9', project: 'interbad-brugge', width:1125, height:1500},
  {image: 'abattoir-molenbeek-5', project: 'abattoir-molenbeek', width:1500, height:1125},
  {image: 'kortemark-10', project: 'kortemark', width:1500, height:1125}
];
const servicePhotos = [
  {image:'interbad-brugge-11',width:1125,height:1500},
  {image:'aquafin-gent-4',width:1500,height:1125},
  {image:'kortemark-6',width:1500,height:1125},
  {image:'q8-gent-1',width:1080,height:600},
  {image:'abattoir-molenbeek-3',width:1125,height:1500},
  {image:'aquafin-gent-10',width:1500,height:1125}
];

// Runs after CMS annotation and enhancePresentation; original content nodes stay intact.
export function enhancePhotoStory($, {path, lang='nl'} = {}) {
  const page = String(path || '').replace(/^\/+/, '');
  const home = /^(?:(?:en|fr)\/)?index\.html$/.test(page);
  const services = /^(?:(?:en|fr)\/)?diensten\.html$/.test(page);
  if (!home && !services) return;
  const text = translations[lang] || translations.nl;
  const prefix = lang === 'fr' || lang === 'en' ? `/${lang}/` : '/';
  if (!$('head link[data-ab-photo-story]').length) {
    $('head').append('<link rel="stylesheet" href="/assets/photo-story.css?v=photos11" data-ab-photo-story>');
  }
  const image = (photo, alt) => $('<img>').attr({
    src: `/assets/projects/${photo.image}.webp`,
    alt, width: photo.width, height: photo.height,
    loading:'lazy', decoding:'async'
  });
  if (home) {
    if (!$('.photo-story').length && $('.intro').length) {
      const section = $('<section class="photo-story wrap" aria-labelledby="photo-story-title" data-presentation-only></section>');
      const head = $('<div class="photo-story-heading"></div>');
      const title = $('<div></div>')
        .append($('<p class="eyebrow"></p>').text(text.eyebrow))
        .append($('<h2 id="photo-story-title"></h2>').text(text.heading));
      const description = $('<div class="photo-story-intro"></div>')
        .append($('<p></p>').text(text.description))
        .append($('<a class="text-link"></a>').attr('href',`${prefix}realisaties.html`).text(text.allProjects));
      head.append(title,description);
      const gallery = $('<div class="photo-story-grid"></div>');
      panorama.forEach((photo,index) => {
        const [project,caption,alt] = text.panorama[index];
        const figure = $('<figure></figure>');
        const link = $('<a class="photo-story-image"></a>').attr({href:`${prefix}realisatie-${photo.project}.html`,'aria-label':`${text.projectLink}: ${project}`}).append(image(photo,alt));
        const legend = $('<figcaption></figcaption>')
          .append($('<span></span>').text(project))
          .append($('<strong></strong>').text(caption));
        figure.append(link,legend);gallery.append(figure);
      });
      section.append(head,gallery);$('.intro').first().after(section);
    }
    $('.expertise .service-row').each((index,el) => {
      const row = $(el), photo=servicePhotos[index % servicePhotos.length];
      let visual = row.children('.service-visual').first();
      if (!visual.length) {visual=$('<div class="service-visual" data-presentation-only></div>');row.prepend(visual);}
      visual.removeAttr('aria-hidden');
      if (!visual.find('img').length) visual.append(image(photo,text.serviceAlts[index % servicePhotos.length]));
      else visual.find('img').first().attr({src:`/assets/projects/${photo.image}.webp`,alt:text.serviceAlts[index % servicePhotos.length],width:photo.width,height:photo.height,loading:'lazy',decoding:'async'});
    });
  }
  if (services) {
    $('.service-list').addClass('service-catalog');
    $('.service-list .service-row').each((index,el) => {
      const row=$(el), photo=servicePhotos[index % servicePhotos.length];
      if (!row.children('.service-catalog-photo').length) {
        row.prepend($('<div class="service-catalog-photo" data-presentation-only></div>').append(image(photo,text.serviceAlts[index % servicePhotos.length])));
      }
    });
  }
}
