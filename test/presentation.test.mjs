import {test} from 'node:test';
import assert from 'node:assert/strict';
import {load} from 'cheerio';
import {mkdtemp, mkdir, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {enhancePresentation} from '../scripts/presentation.mjs';
import {render} from '../server/render.mjs';

const fixture = '<!doctype html><html lang="nl"><head><title>Example | AB Firestop</title></head><body><header><a href="index.html">Home</a></header><main><section class="new-hero"><img src="/assets/hero.webp" alt="Work"><h1>Protection</h1><p>Careful work</p></section><section class="intro"><h2>Introduction</h2></section><section class="expertise"><span>Services</span></section></main><footer><p>Contact</p></footer></body></html>';
const annotatedFixture = '<html><head><title>CMS</title></head><body><main><section class="new-hero"><h1><cms-text data-cms="text-0">Saved heading</cms-text></h1><img data-cms="image-2" src="/photo.webp" alt="Saved photo"></section><section class="intro"><p><cms-text data-cms="text-1">Saved introduction</cms-text></p></section><section class="expertise"></section><section class="process-band"><div class="wrap"></div></section><section class="cta"></section></main></body></html>';
const cmsSnapshot = $ => $('[data-cms]').map((_, node) => ({id:$(node).attr('data-cms'),html:$.html(node)})).get().sort((a,b)=>a.id.localeCompare(b.id));
const legacyEffects = '.fire-stage,.fire-canvas,.heat-stage,.heat-canvas,#brand-intro,script[data-ab-fire],script[data-ab-heat],script[src*="fire-scene.js"],script[src*="heat-scene.js"],script[src*="brand-intro.js"]';
const legacyMarkup = '<div class="fire-stage"><canvas class="fire-canvas"></canvas></div><div class="heat-stage"><canvas class="heat-canvas"></canvas></div><div id="brand-intro" class="brand-intro"><img src="/assets/beeldmerk.png" alt=""></div><script data-ab-fire src="/assets/fire-scene.js"></script><script data-ab-heat src="/assets/heat-scene.js"></script><script src="/assets/fire-scene.js?v=old"></script><script src="/assets/heat-scene.js?v=old"></script><script src="/assets/brand-intro.js"></script>';
const richHomeFixture = `<!doctype html><html><head><title>Saved website</title></head><body><main>
<section class="new-hero"><img class="hero-background" data-cms="image-5" src="/customer-hero.webp" alt="Customer project"><div class="hero-shade"></div><div class="hero-content"><p class="eyebrow"><cms-text data-cms="text-0">Our original expertise</cms-text></p><h1><cms-text data-cms="text-1">Original heading</cms-text></h1><p class="lead"><cms-text data-cms="text-2">Original project introduction</cms-text></p><div class="actions"><a class="button" href="contact.html"><cms-text data-cms="text-3">Contact</cms-text></a><a href="realisaties.html"><cms-text data-cms="text-4">Projects</cms-text></a></div></div></section>
<section class="intro wrap"><h2><cms-text data-cms="text-6">Introduction</cms-text></h2></section>
<section class="expertise"><a class="service-row" href="brandwerende-dichtingen.html"><div class="service-visual"><img src="/existing-service-photo.webp" alt="Existing service image"></div><h3><cms-text data-cms="text-7">Firestopping</cms-text></h3></a><a class="service-row" href="brandcompartimentering.html"><h3><cms-text data-cms="text-8">Compartmentation</cms-text></h3></a></section>
<section class="why wrap"><p><cms-text data-cms="text-11">Our team</cms-text></p></section>
<section class="process-band"><p><cms-text data-cms="text-12">Our process</cms-text></p></section>
<section class="work-strip wrap"><div class="home-projects"><a class="project-card" data-depth href="realisatie-interbad-brugge.html"><img data-cms="image-10" src="/customer-project.webp" alt="A real project"><h3><cms-text data-cms="text-9">Interbad Brugge</cms-text></h3></a></div></section>
<section class="document-callout wrap"><p><cms-text data-cms="text-13">Documentation</cms-text></p></section><section class="faq wrap"><p><cms-text data-cms="text-14">Questions</cms-text></p></section><section class="cta wrap"><p><cms-text data-cms="text-15">Discuss a project</cms-text></p></section>
</main></body></html>`;

test('presentation preserves CMS fields and inserts each translated home section exactly once', () => {
  for (const [lang,path,label] of [
    ['nl','index.html','Materialen & systemen'],
    ['en','en/index.html','Materials & systems'],
    ['fr','fr/index.html','Matériaux & systèmes']
  ]) {
    const $ = load(annotatedFixture), original = cmsSnapshot($);
    $('body').append(legacyMarkup);
    enhancePresentation($,{path,lang});
    enhancePresentation($,{path,lang});
    assert.deepEqual(cmsSnapshot($),original,path);
    assert.ok($('body').hasClass('ab-experience'));
    assert.ok($('body').hasClass('ab-home'));
    assert.equal($('.systems-section').length,1);
    assert.equal($('.expertise').next('.systems-section').length,1);
    assert.equal($('.systems-copy .eyebrow').text(),label);
    assert.deepEqual($('.system-logo img').map((_,el)=>$(el).attr('src')).get(),['/assets/brands/mulcol.jpeg','/assets/brands/promat.jpeg']);
    assert.equal($('.systems-section [data-cms]').length,0);
    assert.equal($(legacyEffects).length,0,path);
    assert.equal($('.motion-toggle').length,0);
    assert.equal($('link[rel="icon"]').length,2);
    assert.ok($('link[rel="icon"]').first().attr('href').startsWith('/favicon.ico'));
    for(const attribute of ['data-ab-experience','data-ab-pages','data-ab-navigation'])assert.equal($(`link[${attribute}]`).length,1,path);
    assert.equal($('script[data-ab-experience]').length,1);
    assert.ok($('script[data-ab-experience]').is('[defer]'));
  }
});

test('the new home layout moves original CMS nodes, real photos and links without cloning them',()=>{
  for(const [lang,path] of [['nl','index.html'],['fr','fr/index.html'],['en','en/index.html']]){
    const $=load(richHomeFixture),before=cmsSnapshot($);
    const originalNodes=new Map($('[data-cms]').map((_,el)=>({id:$(el).attr('data-cms'),node:el})).get().map(({id,node})=>[id,node]));
    const originalPhoto=$('.hero-background').get(0),lead=$('.lead').get(0),actions=$('.actions').get(0),servicePhoto=$('.service-visual img').get(0);
    const originalLinks=$('a').map((_,el)=>$(el).attr('href')).get().sort();
    enhancePresentation($,{path,lang});enhancePresentation($,{path,lang});
    assert.deepEqual(cmsSnapshot($),before,path);
    for(const [id,node] of originalNodes){assert.equal($(`[data-cms="${id}"]`).length,1,id);assert.equal($(`[data-cms="${id}"]`).get(0),node,`${id} is moved, not cloned`);}
    assert.equal($('.hero-media').length,1);assert.equal($('.hero-summary').length,1);
    assert.equal($('.hero-media > .hero-background').get(0),originalPhoto);
    assert.equal($('.hero-summary > .lead').get(0),lead);assert.equal($('.hero-summary > .actions').get(0),actions);
    assert.equal($('.hero-content > h1').length,1);assert.equal($('.hero-content > .eyebrow').length,1);
    assert.equal($('.hero-image-note').attr('aria-hidden'),'true');assert($('.hero-image-note').is('[data-presentation-only]'));
    assert.equal($('.hero-image-note [data-cms]').length,0);
    assert.equal($('.service-visual img').first().get(0),servicePhoto);
    assert.equal($('.service-row').length,2);assert.equal($('.service-visual').length,2);
    assert.deepEqual($('a').map((_,el)=>$(el).attr('href')).get().sort(),originalLinks,path);
    assert.equal($('.project-card').attr('data-depth'),undefined);
    assert.deepEqual($('main > section').map((_,el)=>$(el).attr('class').split(' ')[0]).get(),['new-hero','work-strip','intro','expertise','systems-section','why','process-band','document-callout','faq','cta']);
    assert.equal($(legacyEffects).length,0);
  }
});

test('all public pages remove legacy animations and share styling while administration stays untouched', () => {
  for (const [lang,path] of [['nl','diensten.html'],['fr','fr/services.html'],['en','en/services.html']]) {
    const detail=load(annotatedFixture), original=cmsSnapshot(detail);
    detail('body').append(legacyMarkup);
    enhancePresentation(detail,{path,lang});enhancePresentation(detail,{path,lang});
    assert.deepEqual(cmsSnapshot(detail),original,path);
    assert.equal(detail('.systems-section,.hero-media,.hero-summary,.motion-toggle').length,0,path);
    assert.equal(detail(legacyEffects).length,0,path);
    assert.equal(detail('body.ab-home').length,0,path);
    for(const attribute of ['data-ab-experience','data-ab-pages','data-ab-navigation'])assert.equal(detail(`link[${attribute}]`).length,1,path);
  }
  const admin=load(fixture), before=admin.html();
  enhancePresentation(admin,{path:'admin/index.html',lang:'nl'});
  assert.equal(admin.html(),before);
});

test('build keeps pre-existing CMS keys and Netlify routes when adding presentation', async () => {
  const directory=await mkdtemp(join(tmpdir(),'ab-presentation-'));
  try {
    for(const folder of ['public','public/en','public/fr','server']) await mkdir(join(directory,folder),{recursive:true});
    for(const path of ['index.html','en/index.html','fr/index.html','diensten.html']) await writeFile(join(directory,'public',path),fixture);
    execFileSync(process.execPath,[fileURLToPath(new URL('../scripts/build.mjs',import.meta.url))],{cwd:directory,stdio:'pipe'});
    const templates=JSON.parse(await readFile(join(directory,'server/templates.json'),'utf8'));
    for(const [path,template] of Object.entries(templates)) {
      assert.deepEqual(Object.keys(template.fields),['text-0','text-1','text-2','text-3','text-4','text-5','image-6'],path);
      assert.deepEqual(Object.values(template.fields).map(field=>field.value),['Home','Protection','Careful work','Introduction','Services','Contact','/assets/hero.webp'],path);
      const $=load(template.html);
      assert.equal($('[data-cms]').length,7,path);
      assert.equal($('.systems-section').length,path!=='diensten.html'?1:0,path);
      assert.equal($(legacyEffects).length,0,path);
    }
    const redirects=await readFile(join(directory,'public/_redirects'),'utf8');
    assert.ok(redirects.includes('/ /.netlify/functions/page?page=index.html 200!'));
    assert.ok(redirects.includes('/fr/ /.netlify/functions/page?page=fr/index.html 200!'));
    assert.ok(redirects.includes('/en/ /.netlify/functions/page?page=en/index.html 200!'));
    assert.ok(redirects.includes('/diensten.html /.netlify/functions/page?page=diensten.html 200!'));
  } finally {await rm(directory,{recursive:true,force:true});}
});

test('new project-photo defaults upgrade old defaults while preserving saved customer photos and alt text',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'ab-images-'));
  try{
    for(const folder of ['public','public/en','public/fr','server'])await mkdir(join(directory,folder),{recursive:true});
    const source='<html><head><title>Photos</title></head><body><main><section class="new-hero"><img class="hero-background" src="assets/projects/aquafin-gent-4.webp" alt="Original hero"><div class="hero-content"><h1>Work</h1></div></section><section class="work-strip"><div class="home-projects"><a class="project-card" href="project.html"><img src="assets/projects/interbad-brugge-6-thumb.webp" alt="Original project"></a></div></section></main></body></html>';
    for(const path of ['index.html','en/index.html','fr/index.html','diensten.html'])await writeFile(join(directory,'public',path),source);
    execFileSync(process.execPath,[fileURLToPath(new URL('../scripts/build.mjs',import.meta.url))],{cwd:directory,stdio:'pipe'});
    const templates=JSON.parse(await readFile(join(directory,'server/templates.json'),'utf8'));
    for(const path of ['index.html','en/index.html','fr/index.html']){
      const template=templates[path],hero=template.fields['image-1'],project=template.fields['image-2'];
      assert.equal(hero.legacyValue,'assets/projects/aquafin-gent-4.webp');assert.equal(hero.value,'assets/projects/aquafin-gent-6.webp');
      assert.equal(project.legacyValue,'assets/projects/interbad-brugge-6-thumb.webp');assert.equal(project.value,'assets/projects/interbad-brugge-11.webp');
      for(const field of ['image-1','image-2']){
        const metadata=template.fields[field];
        const defaults=load(render(template,{values:{[field]:metadata.legacyValue},extras:[]}));
        assert.equal(defaults(`[data-cms="${field}"]`).attr('src'),metadata.value,`${path} upgrades only its former default`);
        const saved={values:{[field]:'/uploads/customer-selected.webp',[field+'-alt']:'Customer description'},extras:[]},before=structuredClone(saved);
        const custom=load(render(template,saved));
        assert.equal(custom(`[data-cms="${field}"]`).attr('src'),'/uploads/customer-selected.webp');
        assert.equal(custom(`[data-cms="${field}"]`).attr('alt'),'Customer description');assert.deepEqual(saved,before);
      }
    }
    assert.equal(templates['diensten.html'].fields['image-1'].value,'assets/projects/aquafin-gent-4.webp','detail-page photos are unchanged');
    assert.equal(templates['diensten.html'].fields['image-1'].legacyValue,undefined);
  }finally{await rm(directory,{recursive:true,force:true});}
});

test('render upgrades saved old default copy while preserving customer edits', () => {
  for (const [path,legacyValue,value] of [
    ['index.html','Specialisten in brandwerende dichtingen','Specialisatie in brandwerende dichtingen'],
    ['en/index.html','Specialists in firestopping','Specialising in firestopping'],
    ['fr/index.html','Spécialistes du calfeutrement','Spécialisation dans le calfeutrement']
  ]) {
    const template={path,html:'<html><head></head><body><main><p><cms-text data-cms="text-0"></cms-text></p></main></body></html>',fields:{'text-0':{type:'text',value,legacyValue}}};
    const published=values=>load(render(template,{values,extras:[]}))('[data-cms="text-0"]');
    assert.equal(published({'text-0':legacyValue}).text(),value,`${path}: saved former default is upgraded`);
    assert.equal(published({}).text(),value,`${path}: unsaved page uses the new default`);

    // A customer's edit may still contain the former wording: it is deliberate
    // content and must not be rewritten by a broad string replacement at render time.
    const custom=`${legacyValue} — <strong>ons eigen team & onze aanpak</strong>`;
    const content={values:{'text-0':custom},extras:[]};
    const before=structuredClone(content);
    const output=load(render(template,content))('[data-cms="text-0"]');
    assert.equal(output.text(),custom,`${path}: custom saved copy is retained verbatim`);
    assert.equal(output.find('strong').length,0,`${path}: saved HTML remains escaped`);
    assert.deepEqual(content,before,`${path}: rendering does not mutate persisted content`);
    assert.equal(published({'text-0':''}).text(),'',`${path}: intentionally blank content stays blank`);
  }
});
