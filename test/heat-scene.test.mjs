import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source=readFileSync(new URL('../public/assets/heat-scene.js',import.meta.url),'utf8');
function harness({backend='webgl',reduced=false,small=false,width=430,height=560,badShader=false}={}) {
  const frames=new Map(),events=new Map(),mediaEvents=new Map(),images=[],classes=new Set(),heroClasses=new Set();
  const progress=[],textures=[],deleted=[],draws=[];
  let observer,resizeObserver,now=100,next=0,maxQueued=0,lastPixels=null,putCount=0;
  const noop=()=>{};
  const classList=set=>({add:(...names)=>names.forEach(name=>set.add(name)),remove:(...names)=>names.forEach(name=>set.delete(name)),toggle:(name,on)=>on?set.add(name):set.delete(name)});
  const gl=new Proxy({
    getShaderPrecisionFormat:()=>({precision:23}),createShader:()=>({}),getShaderParameter:()=>!badShader,
    createProgram:()=>({}),getProgramParameter:()=>true,createBuffer:()=>({}),createTexture:()=>({}),
    getAttribLocation:()=>0,getUniformLocation:(_program,name)=>name,
    uniform1f:(name,value)=>{if(name==='uProgress')progress.push(value);},
    texImage2D:(...args)=>textures.push({width:args[3],height:args[4],data:args[8]}),
    drawArrays:()=>draws.push(progress.at(-1)),deleteTexture:()=>deleted.push('texture'),deleteBuffer:()=>deleted.push('buffer'),deleteProgram:()=>deleted.push('program')
  },{get:(object,key)=>key in object?object[key]:key.toUpperCase()===key?1:noop});
  const context2D={
    createImageData:(w,h)=>({width:w,height:h,data:new Uint8ClampedArray(w*h*4)}),
    putImageData:image=>{lastPixels=image.data.slice();putCount++;}
  };
  let canvas;
  function makeCanvas(){
    const handlers=new Map();let claimed=null;
    return {width:1,height:1,setAttribute:noop,
      getBoundingClientRect:()=>({width,height,top:0,bottom:height}),
      getContext(type){
        if(type==='webgl'&&backend==='webgl'&&!claimed){claimed='webgl';return gl;}
        if(type==='2d'&&backend!=='none'&&claimed!=='webgl'){claimed='2d';return context2D;}
        return null;
      },
      addEventListener:(event,fn)=>handlers.set(event,fn),removeEventListener:(event,fn)=>{if(handlers.get(event)===fn)handlers.delete(event);},
      cloneNode:()=>makeCanvas(),replaceWith:replacement=>{canvas=replacement;},
      lose(){handlers.get('webglcontextlost')?.({preventDefault:noop});}
    };
  }
  canvas=makeCanvas();
  const stage={classList:classList(classes),querySelector:()=>canvas,closest:()=>({classList:classList(heroClasses)}),getBoundingClientRect:()=>({width,height,top:0,bottom:height})};
  const motion={matches:reduced,addEventListener:(_,fn)=>mediaEvents.set('change',fn),removeEventListener:noop};
  const document={hidden:false,querySelectorAll:()=>[stage],addEventListener:(event,fn)=>events.set(event,fn),removeEventListener:noop,
    createElement(tag){
      assert.equal(tag,'canvas');
      const mask={width:1,height:1,getContext:()=>({drawImage:noop,getImageData:(_x,_y,w,h)=>{
        const data=new Uint8ClampedArray(w*h*4);
        for(let y=0;y<h;y++)for(let x=0;x<w;x++){
          const inBody=x>w*.2&&x<w*.8&&y>h*.1&&y<h*.9;
          const inHole=Math.hypot((x-w*.5)/w,(y-h*.5)/h)<.09;
          data[(y*w+x)*4]=200;
          data[(y*w+x)*4+3]=inBody&&!inHole?255:0;
        }
        return {data};
      }})};return mask;
    }};
  const window={IntersectionObserver:true,ResizeObserver:true,addEventListener:(event,fn)=>events.set(event,fn),removeEventListener:noop};
  runInNewContext(source,{
    document,window,Math,devicePixelRatio:2,innerHeight:800,
    matchMedia:query=>query.includes('reduce')?motion:{matches:small},
    Image:class{constructor(){this.naturalWidth=490;this.naturalHeight=730;images.push(this);}removeAttribute(name){if(name==='src')this.src='';}},
    requestAnimationFrame(fn){const id=++next;frames.set(id,fn);maxQueued=Math.max(maxQueued,frames.size);return id;},cancelAnimationFrame:id=>frames.delete(id),
    IntersectionObserver:class{constructor(fn){observer=fn;}observe(){}disconnect(){}},
    ResizeObserver:class{constructor(fn){resizeObserver=fn;}observe(){}disconnect(){}}
  });
  return {
    classes,heroClasses,images,progress,textures,deleted,draws,
    get canvas(){return canvas;},get pixels(){return lastPixels;},get putCount(){return putCount;},
    load(){images.at(-1).onload?.();},error(){images.at(-1).onerror?.();},
    enter(ratio=1){observer([{isIntersecting:true,intersectionRatio:ratio}]);},exit(){observer([{isIntersecting:false,intersectionRatio:0}]);},
    hidden(value){document.hidden=value;events.get('visibilitychange')();},
    preference(value){motion.matches=value;mediaEvents.get('change')();},
    pagehide(persisted=false){events.get('pagehide')({persisted});},pageshow(){events.get('pageshow')();},
    resize(){resizeObserver();},
    advance(ms,step=100){const end=now+ms;while(now<end){now=Math.min(end,now+step);for(const[id,fn]of[...frames]){frames.delete(id);fn(now);}}},
    get queued(){return frames.size;},get maxQueued(){return maxQueued;}
  };
}

test('the original alpha becomes a bounded signed-distance texture, including its holes',()=>{
  const h=harness();assert.equal(h.images[0].src,'/assets/beeldmerk.png');
  h.load();const texture=h.textures[0];
  assert.equal(texture.width,256);assert.equal(texture.height,384);
  const value=(x,y)=>texture.data[(y*texture.width+x)*4];
  assert(value(80,192)>128,'opaque source body has positive distance');
  assert(value(128,192)<128,'transparent internal opening remains outside the relief');
  assert(value(5,5)<128,'surrounding wall remains outside the relief');
  assert(h.classes.has('heat-ready'));assert.equal(h.queued,0,'offscreen readiness starts no animation');
  assert(h.canvas.width*h.canvas.height<=520000);
});

test('entrance waits for geometry, runs once for 3.8 seconds and replays only on re-entry',()=>{
  const h=harness();h.enter();h.advance(10000);
  assert.equal(h.queued,0,'image loading does not consume animation frames');
  h.load();assert(h.heroClasses.has('heat-playing'));h.advance(4500);
  assert.equal(h.progress.at(-1),1);assert.equal(h.queued,0);assert.equal(h.maxQueued,1);
  assert(h.classes.has('heat-settled'));assert(!h.heroClasses.has('heat-playing'));
  const finished=h.draws.length;h.enter(.14);h.advance(500);assert.equal(h.draws.length,finished);
  h.exit();h.enter();h.advance(600);
  assert(h.progress.at(-1)>0&&h.progress.at(-1)<1);assert(h.classes.has('heat-running'));
  h.exit();assert.equal(h.queued,0);
});

test('hidden time pauses the entrance; reduced motion renders only the final state',()=>{
  const h=harness();h.load();h.enter();h.advance(900);h.hidden(true);
  const before=h.progress.at(-1);h.advance(10000);
  assert.equal(h.progress.at(-1),before);assert.equal(h.queued,0);assert(h.classes.has('heat-paused'));
  h.hidden(false);h.advance(300);assert(h.progress.at(-1)>before);
  h.preference(true);assert.equal(h.progress.at(-1),1);assert.equal(h.queued,0);
  const quiet=harness({reduced:true});quiet.enter();quiet.load();quiet.advance(5000);
  assert(quiet.progress.every(value=>value===1));assert.equal(quiet.queued,0);
});

test('software relief has smooth shading, a moving warm light, and a neutral settled frame',()=>{
  const h=harness({backend:'software',width:190,height:250});h.enter();h.load();
  assert(h.classes.has('heat-software'));assert(h.classes.has('heat-ready'));
  const shades=new Set();for(let i=0;i<h.pixels.length;i+=4)shades.add(h.pixels[i]);
  assert(shades.size>25,'bevel and contact shadow have graduated tones');
  assert(Math.min(...shades)<225,'relief depth is visibly shaded');
  h.advance(2400,800);
  let warm=false;for(let i=0;i<h.pixels.length;i+=4)if(h.pixels[i]-h.pixels[i+1]>5){warm=true;break;}
  assert(warm,'grazing light warms the surface during the entrance');
  h.advance(5000,1000);
  for(let i=0;i<h.pixels.length;i+=4)assert.equal(h.pixels[i],h.pixels[i+1],'final porcelain is neutral, never a frozen red sweep');
  assert.equal(h.queued,0);assert(h.classes.has('heat-settled'));
});

test('context loss switches to software without replaying a settled intro',()=>{
  const h=harness({width:120,height:180});h.load();h.enter();h.advance(4500);
  const images=h.images.length;h.canvas.lose();
  assert(h.classes.has('heat-software'));assert(h.classes.has('heat-ready'));
  assert(h.classes.has('heat-settled'));assert.equal(h.queued,0);assert.equal(h.images.length,images,'cached distance data avoids a second logo request');
  assert(!h.heroClasses.has('heat-playing'));
});

test('failed graphics or image loading retain the CSS relief and cleanly settle',()=>{
  const noGraphics=harness({backend:'none'});noGraphics.enter();noGraphics.advance(4500);
  assert(noGraphics.classes.has('heat-unavailable'));assert(noGraphics.classes.has('heat-settled'));assert.equal(noGraphics.queued,0);
  const badImage=harness();badImage.enter();badImage.error();badImage.advance(4500);
  assert(badImage.classes.has('heat-unavailable'));assert(!badImage.classes.has('heat-ready'));assert.equal(badImage.queued,0);
  const badShader=harness({badShader:true,width:100,height:160});badShader.load();assert(badShader.classes.has('heat-software'));
});

test('page lifecycle preserves a cached entrance and deletes GPU resources on teardown',()=>{
  const h=harness();h.load();h.enter();h.advance(300);h.pagehide(true);
  const before=h.progress.at(-1);h.advance(1000);assert.equal(h.progress.at(-1),before);assert.equal(h.queued,0);
  h.pageshow();h.advance(300);assert(h.progress.at(-1)>before);
  h.pagehide();assert.equal(h.queued,0);
  assert(h.deleted.includes('texture'));assert(h.deleted.includes('buffer'));assert(h.deleted.includes('program'));
  assert.equal(h.images[0].src,'');
});
