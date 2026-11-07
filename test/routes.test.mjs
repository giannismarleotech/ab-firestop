import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolvePage} from '../netlify/functions/page.mjs';
const templates=JSON.parse(readFileSync(new URL('../server/templates.json',import.meta.url),'utf8'));
test('all public page routes resolve from the original Netlify request URL',()=>{
  for(const path of Object.keys(templates)){
    const clean=path.replace(/index\.html$/,'').replace(/\.html$/,'');
    const routes=[path,clean];
    if(clean)routes.push(clean.endsWith('/')?clean.slice(0,-1):clean+'/');
    for(const route of routes)assert.equal(resolvePage('https://abfirestop.be/'+route),path,route);
    assert.equal(resolvePage('https://abfirestop.be/.netlify/functions/page?page='+path),path);
  }
});
test('unknown routes are rejected and public query parameters cannot change the page',()=>{
  assert.throws(()=>resolvePage('https://abfirestop.be/bestaat-niet'));
  assert.equal(resolvePage('https://abfirestop.be/?page=nonexistent'),'index.html');
});
