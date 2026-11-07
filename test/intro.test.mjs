import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../public/assets/brand-intro.js',import.meta.url),'utf8');
function run({seen=false,reduced=false,blocked=false}={}){
  const classes=new Set(),timers=[];let saved=seen,removed=false;
  vm.runInNewContext(source,{
    window:{matchMedia:()=>({matches:reduced}),setTimeout:(f,ms)=>timers.push({f,ms}),addEventListener:()=>{}},
    sessionStorage:{getItem:()=>{if(blocked)throw Error();return saved;},setItem:()=>saved=true},
    document:{documentElement:{classList:{add:c=>classes.add(c),remove:c=>classes.delete(c)}},getElementById:()=>({remove:()=>removed=true})}
  });return {classes,timers,get saved(){return saved;},get removed(){return removed;}};
}
test('flame intro runs once and releases within one second',()=>{const s=run();assert.ok(s.classes.has('ab-intro'));assert.ok(s.saved);assert.equal(s.timers.length,1);assert.ok(s.timers[0].ms<1000);s.timers[0].f();assert.equal(s.classes.size,0);assert.ok(s.removed);});
test('intro does not repeat or ignore reduced-motion preference',()=>{for(const options of [{seen:true},{reduced:true},{blocked:true}]){const s=run(options);assert.equal(s.classes.size,0);assert.equal(s.timers.length,0);}});
