import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source=readFileSync(new URL('../public/assets/fire-scene.js',import.meta.url),'utf8');
function harness({reduced=false,unsupported=-1}={}) {
  const frames=new Map(),observers=new Map(),events=new Map(),mediaEvents=new Map();
  let now=100,next=0,maxQueued=0;
  const noop=()=>{};
  const stages=Array.from({length:3},(_,index)=>{
    const classes=new Set(),contextRequests=[],composites=[];
    let draws=0;
    const ctx=new Proxy({
      clearRect:()=>draws++,
      createLinearGradient:()=>({addColorStop:noop}),
      createRadialGradient:()=>({addColorStop:noop})
    },{get:(object,key)=>key in object?object[key]:noop,set:(object,key,value)=>{
      if(key==='globalCompositeOperation')composites.push(value);
      object[key]=value;return true;
    }});
    const canvas={width:1,height:1,setAttribute:noop,getContext(type){contextRequests.push(type);return index===unsupported?null:ctx;}};
    const stage={
      dataset:index?{fireVariant:'accent'}:{},
      querySelector:()=>canvas,
      getBoundingClientRect:()=>({width:index?240:600,height:index?300:620,top:index*1000,bottom:index*1000+620}),
      classList:{add:(...values)=>values.forEach(v=>classes.add(v)),remove:(...values)=>values.forEach(v=>classes.delete(v)),toggle:(value,state)=>state?classes.add(value):classes.delete(value)},
      classes,canvas,contextRequests,composites,get draws(){return draws;}
    };
    return stage;
  });
  const motion={matches:reduced,addEventListener:(_,fn)=>mediaEvents.set('change',fn),removeEventListener:noop};
  const document={querySelectorAll:()=>stages,hidden:false,addEventListener:(event,fn)=>events.set(event,fn),removeEventListener:noop};
  const window={IntersectionObserver:true,ResizeObserver:true,addEventListener:(event,fn)=>events.set(event,fn),removeEventListener:noop};
  runInNewContext(source,{
    document,window,Math,devicePixelRatio:2,innerHeight:800,
    matchMedia:query=>query.includes('reduce')?motion:{matches:false},
    requestAnimationFrame(fn){const id=++next;frames.set(id,fn);maxQueued=Math.max(maxQueued,frames.size);return id;},
    cancelAnimationFrame:id=>frames.delete(id),
    IntersectionObserver:class{constructor(fn){this.fn=fn;}observe(stage){observers.set(stage,this.fn);}disconnect(){}},
    ResizeObserver:class{observe(){}disconnect(){}}
  });
  return {
    stages,
    enter(index,ratio=1){observers.get(stages[index])([{isIntersecting:true,intersectionRatio:ratio}]);},
    exit(index){observers.get(stages[index])([{isIntersecting:false,intersectionRatio:0}]);},
    hidden(value){document.hidden=value;events.get('visibilitychange')();},
    preference(value){motion.matches=value;mediaEvents.get('change')();},
    advance(ms,step=1000/60){const end=now+ms;while(now<end){now+=step;for(const[id,fn]of[...frames]){frames.delete(id);fn(now);}}},
    get queued(){return frames.size;},get maxQueued(){return maxQueued;}
  };
}

test('fire accents animate independently with one scheduler, then replay only after leaving the viewport',()=>{
  const h=harness();
  const initial=h.stages.map(stage=>stage.draws);
  assert.equal(h.queued,0,'offscreen canvases do not schedule animation');
  h.enter(0);h.enter(1);h.advance(5600);
  assert(h.stages[0].draws>initial[0]+10);
  assert(h.stages[1].draws>initial[1]+10);
  assert.equal(h.stages[2].draws,initial[2],'unseen accent remains static');
  assert.equal(h.maxQueued,1,'all visible flames share one requestAnimationFrame');
  assert.equal(h.queued,0,'all finished scenes stop scheduling frames');
  assert(h.stages[0].classes.has('fire-settled'));
  const finished=h.stages[0].draws;
  h.enter(0,.14);h.advance(500);
  assert.equal(h.stages[0].draws,finished,'intersection notifications do not replay an already visible scene');
  h.exit(0);h.enter(0);h.advance(400);
  assert(h.stages[0].draws>finished,'a fresh entrance restarts the scene');
  assert(!h.stages[0].classes.has('fire-settled'));
});

test('hidden time does not exhaust the flame budget and reduced motion stays static',()=>{
  const h=harness();h.enter(0);h.advance(1500);h.hidden(true);
  const before=h.stages[0].draws;h.advance(10000);
  assert.equal(h.stages[0].draws,before);
  assert.equal(h.queued,0);
  assert(!h.stages[0].classes.has('fire-settled'));
  h.hidden(false);h.advance(800);
  assert(h.stages[0].draws>before);
  h.preference(true);
  const reducedFrame=h.stages[0].draws;h.advance(1000);
  assert.equal(h.stages[0].draws,reducedFrame);
  assert.equal(h.queued,0);
  assert(h.stages[0].classes.has('fire-reduced'));
  const reduced=harness({reduced:true});reduced.enter(0);reduced.enter(2);
  const staticFrames=reduced.stages.map(stage=>stage.draws);reduced.advance(6000);
  assert.deepEqual(reduced.stages.map(stage=>stage.draws),staticFrames);
  assert.equal(reduced.queued,0);
});

test('light-background rendering uses capped Canvas2D surfaces and survives an unsupported canvas',()=>{
  const h=harness({unsupported:1});h.enter(0);h.advance(100);
  assert.deepEqual(h.stages[0].contextRequests,['2d']);
  assert(h.stages[0].canvas.width*h.stages[0].canvas.height<=231000);
  assert(h.stages[2].canvas.width*h.stages[2].canvas.height<=56000);
  assert(h.stages[0].composites.every(mode=>mode==='source-over'),'additive blending would wash fire out on white');
  assert(h.stages[1].classes.has('fire-fallback'));
  assert(h.stages[0].classes.has('fire-ready'));
});
