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
const annotatedFixture = '<html><head><title>CMS</title></head><body><main><section class="new-hero"><h1><cms-text data-cms="text-0">Saved heading</cms-text></h1><img data-cms="image-2" src="/photo.webp" alt="Saved photo"></section><section class="intro"><p><cms-text data-cms="text-1">Saved introduction</cms-text></p></section><section class="expertise"></section></main></body></html>';
const cmsSnapshot = $ => $('[data-cms]').map((_, node) => ({id:$(node).attr('data-cms'),html:$.html(node)})).get();

test('presentation preserves CMS fields and inserts each translated home section exactly once', () => {
  for (const [lang,path,label] of [
    ['nl','index.html','Materialen & systemen'],
    ['en','en/index.html','Materials & systems'],
    ['fr','fr/index.html','Matériaux & systèmes']
  ]) {
    const $ = load(annotatedFixture), original = cmsSnapshot($);
    enhancePresentation($,{path,lang});
    enhancePresentation($,{path,lang});
    assert.deepEqual(cmsSnapshot($),original,path);
    assert.ok($('body').hasClass('ab-experience'));
    assert.ok($('body').hasClass('ab-home'));
    assert.equal($('.systems-section').length,1);
    assert.equal($('.intro').next().attr('class'),'systems-section wrap');
    assert.equal($('.systems-section').next().attr('class'),'expertise');
    assert.equal($('.systems-copy .eyebrow').text(),label);
    assert.deepEqual($('.system-logo img').map((_,el)=>$(el).attr('src')).get(),['/assets/brands/mulcol.jpeg','/assets/brands/promat.jpeg']);
    assert.equal($('.systems-section [data-cms]').length,0);
    assert.equal($('.motion-toggle').length,0);
    assert.equal($('.fire-stage .fire-canvas').length,1);
    assert.equal($('.fire-stage').attr('aria-hidden'),'true');
    assert.equal($('script[data-ab-fire]').length,1);
    assert.ok($('script[data-ab-fire]').is('[defer]'));
    assert.equal($('link[rel="icon"]').length,2);
    assert.ok($('link[rel="icon"]').first().attr('href').startsWith('/favicon.ico'));
    assert.equal($('link[data-ab-experience]').length,1);
    assert.equal($('script[data-ab-experience]').length,1);
    assert.ok($('script[data-ab-experience]').is('[defer]'));
  }
});

test('detail pages get shared styling, while administration is untouched', () => {
  const detail=load(annotatedFixture);
  enhancePresentation(detail,{path:'en/services.html',lang:'en'});
  assert.equal(detail('.systems-section,.motion-toggle').length,0);
  assert.equal(detail('body.ab-home').length,0);
  assert.equal(detail('link[data-ab-experience]').length,1);
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
      assert.equal($('.systems-section').length,path==='diensten.html'?0:1,path);
    }
    const redirects=await readFile(join(directory,'public/_redirects'),'utf8');
    assert.ok(redirects.includes('/ /.netlify/functions/page?page=index.html 200!'));
    assert.ok(redirects.includes('/fr/ /.netlify/functions/page?page=fr/index.html 200!'));
    assert.ok(redirects.includes('/en/ /.netlify/functions/page?page=en/index.html 200!'));
    assert.ok(redirects.includes('/diensten.html /.netlify/functions/page?page=diensten.html 200!'));
  } finally {await rm(directory,{recursive:true,force:true});}
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
