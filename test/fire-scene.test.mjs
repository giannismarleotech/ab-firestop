import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source=readFileSync(new URL('../public/assets/fire-scene.js',import.meta.url),'utf8');
function harness({reduced=false,unsupported=-1,playback='playing'}={}) {
  const frames=new Map(),observers=new Map(),events=new Map(),mediaEvents=new Map(),videos=[];
  let now=100,next=0,maxQueued=0;
  const noop=()=>{};
  function makeVideo(){
    const listeners=new Map();
    const video={
      mode:playback,currentTime:0,duration:4.8,videoWidth:540,videoHeight:540,
      readyState:0,paused:true,src:'',playCalls:0,pauseCalls:0,loadCalls:0,
      setAttribute:noop,
      addEventListener(event,fn){listeners.set(event,fn);},
      removeEventListener(event,fn){if(listeners.get(event)===fn)listeners.delete(event);},
      emit(event){listeners.get(event)?.();},
      play(){
        this.playCalls++;
        if(this.mode==='reject')return Promise.reject(new Error('Autoplay blocked'));
        this.paused=false;
        if(this.mode==='loading')return new Promise(()=>{});
        this.readyState=4;this.emit('playing');return Promise.resolve();
      },
      pause(){this.pauseCalls++;this.paused=true;this.emit('pause');},
      removeAttribute(name){if(name==='src')this.src='';},
      load(){this.loadCalls++;this.readyState=0;},
      get listenerCount(){return listeners.size;}
    };
    videos.push(video);return video;
  }
  const stages=Array.from({length:3},(_,index)=>{
    const classes=new Set(),contextRequests=[],drawCalls=[];
    let pixels=null,draws=0,drawnVideo=null;
    const rect={width:index?160:600,height:index?190:420,top:index*1000,bottom:index*1000+420};
    const ctx={
      clearRect:()=>{pixels=null;},
      drawImage:(video,...args)=>{draws++;drawnVideo=video;drawCalls.push(args);},
      getImageData:(_x,_y,width,height)=>{
        const data=new Uint8ClampedArray(width*height*4),variation=Math.floor(drawnVideo.currentTime*10)%20;
        for(let i=0;i<data.length;i+=4){
          const cell=(i/4)%3;
          if(cell===1){data[i]=180+variation;data[i+1]=40;data[i+2]=6;}
          if(cell===2){data[i]=240;data[i+1]=170+variation;data[i+2]=65;}
          data[i+3]=255;
        }
        return {data,width,height};
      },
      putImageData:image=>{pixels=image.data;}
    };
    const canvas={width:1,height:1,setAttribute:noop,getBoundingClientRect:()=>rect,
      getContext(type){contextRequests.push(type);return index===unsupported?null:ctx;}};
    return {dataset:index?{fireVariant:'accent'}:{},querySelector:()=>canvas,getBoundingClientRect:()=>rect,
      classList:{add:(...values)=>values.forEach(v=>classes.add(v)),remove:(...values)=>values.forEach(v=>classes.delete(v)),toggle:(value,state)=>state?classes.add(value):classes.delete(value)},
      classes,canvas,contextRequests,drawCalls,get draws(){return draws;},get pixels(){return pixels;}};
  });
  const motion={matches:reduced,addEventListener:(_,fn)=>mediaEvents.set('change',fn),removeEventListener:noop};
  const document={querySelectorAll:()=>stages,createElement:tag=>{assert.equal(tag,'video');return makeVideo();},
    hidden:false,addEventListener:(event,fn)=>events.set(event,fn),removeEventListener:noop};
  const window={IntersectionObserver:true,ResizeObserver:true,addEventListener:(event,fn)=>events.set(event,fn),removeEventListener:noop};
  runInNewContext(source,{
    document,window,Math,Promise,innerHeight:800,
    matchMedia:query=>query.includes('reduce')?motion:{matches:false},
    requestAnimationFrame(fn){const id=++next;frames.set(id,fn);maxQueued=Math.max(maxQueued,frames.size);return id;},
    cancelAnimationFrame:id=>frames.delete(id),
    IntersectionObserver:class{constructor(fn){this.fn=fn;}observe(stage){observers.set(stage,this.fn);}disconnect(){}},
    ResizeObserver:class{observe(){}disconnect(){}}
  });
  return {
    stages,videos,
    enter(index,ratio=1){observers.get(stages[index])?.([{isIntersecting:true,intersectionRatio:ratio}]);},
    exit(index){observers.get(stages[index])?.([{isIntersecting:false,intersectionRatio:0}]);},
    hidden(value){document.hidden=value;events.get('visibilitychange')();},
    preference(value){motion.matches=value;mediaEvents.get('change')();},
    start(video){video.mode='playing';video.readyState=4;video.paused=false;video.emit('playing');},
    wait(video){video.mode='loading';video.emit('waiting');},
    pagehide(persisted=false){events.get('pagehide')({persisted});},
    pageshow(){events.get('pageshow')();},
    advance(ms,step=1000/24){
      const end=now+ms;
      while(now+0.001<end){
        const delta=Math.min(step,end-now);now+=delta;
        for(const video of videos){
          if(video.paused||!video.src||video.mode!=='playing')continue;
          video.currentTime=Math.min(video.duration,video.currentTime+delta/1000);
          if(video.currentTime>=video.duration-0.00001)video.emit('ended');
        }
        for(const[id,fn]of[...frames]){frames.delete(id);fn(now);}
      }
    },
    get queued(){return frames.size;},get maxQueued(){return maxQueued;}
  };
}
const flush=()=>Promise.resolve();
const alphaTotal=stage=>stage.pixels?.reduce((sum,value,index)=>sum+(index%4===3?value:0),0)||0;

test('footage loads only on entry, shares one scheduler, and replays only after leaving',async()=>{
  const h=harness();
  assert.equal(h.videos.length,0);assert.equal(h.queued,0);
  h.enter(0);h.enter(1);await flush();h.advance(5600);
  assert.equal(h.videos.length,2);
  assert(h.stages[0].draws>10);assert(h.stages[1].draws>10);assert.equal(h.stages[2].draws,0);
  assert.equal(h.maxQueued,1);assert.equal(h.queued,0);
  assert(h.stages[0].classes.has('fire-settled'));
  assert(h.videos.every(video=>!video.src&&video.paused&&video.listenerCount===0),'finished decoders are released');
  h.enter(0,.14);assert.equal(h.videos.length,2,'intersection wobble does not replay');
  h.exit(0);h.enter(0);await flush();
  assert.equal(h.videos.length,3);assert.equal(h.videos[2].currentTime,0);
  h.advance(200);assert(!h.stages[0].classes.has('fire-settled'));
  h.exit(0);assert.equal(h.queued,0);assert.equal(h.videos[2].src,'');
});

test('loading and hidden time do not consume playback or spin animation frames',async()=>{
  const h=harness({playback:'loading'});h.enter(0);h.advance(10000);
  const video=h.videos[0];
  assert.equal(h.queued,0,'downloading does not run RAF');assert.equal(video.currentTime,0);
  h.start(video);h.advance(1000);h.hidden(true);
  const time=video.currentTime,draws=h.stages[0].draws;h.advance(10000);
  assert.equal(video.currentTime,time);assert.equal(h.stages[0].draws,draws);assert.equal(h.queued,0);
  h.hidden(false);await flush();h.advance(500);
  assert(video.currentTime>time);assert(h.stages[0].draws>draws);
  h.wait(video);assert.equal(alphaTotal(h.stages[0]),0,'buffering does not leave a frozen flame');
  h.advance(2000);assert.equal(h.queued,0,'buffering stops RAF');
  h.start(video);h.advance(200);assert(h.queued>0);
});

test('reduced motion creates no video and stops existing playback without a still flame',async()=>{
  const h=harness({reduced:true});h.enter(0);h.enter(2);h.advance(6000);
  assert.equal(h.videos.length,0);assert.equal(h.queued,0);assert.equal(h.stages[0].draws,0);
  h.preference(false);await flush();h.advance(200);
  assert.equal(h.videos.length,2,'visible stages resume when motion is re-enabled');assert(h.stages[0].draws>0);
  h.preference(true);
  assert.equal(h.queued,0);assert.equal(h.videos[0].src,'');assert.equal(alphaTotal(h.stages[0]),0);
  assert(h.stages[0].classes.has('fire-reduced'));
});

test('autoplay rejection, decoder failure and missing Canvas2D leave the logo usable',async()=>{
  const rejected=harness({playback:'reject'});rejected.enter(0);await flush();await flush();
  assert.equal(rejected.queued,0);assert.equal(rejected.videos[0].src,'');
  assert(rejected.stages[0].classes.has('fire-unavailable'));assert.equal(alphaTotal(rejected.stages[0]),0);
  const h=harness({unsupported:1});h.enter(0);await flush();h.advance(100);
  h.videos[0].emit('error');
  assert.equal(h.queued,0);assert.equal(h.videos[0].listenerCount,0);assert.equal(alphaTotal(h.stages[0]),0);
  assert(h.stages[1].classes.has('fire-unavailable'));assert.equal(h.stages[1].draws,0);
});

test('real footage keeps its aspect, removes black, feathers crop edges and fully fades',async()=>{
  const h=harness();h.enter(0);await flush();h.advance(200);
  const stage=h.stages[0],early=stage.pixels.slice(),[, ,width,height]=stage.drawCalls.at(-1);
  assert.equal(width,height,'square source stays square in a wide canvas');
  assert(stage.canvas.width*stage.canvas.height<=180000);
  assert(h.stages[2].canvas.width*h.stages[2].canvas.height<=32000);
  assert(early.some((value,index)=>index%4===3&&value>100),'flame detail remains visible');
  assert.equal(early[3],0,'top crop edge is feathered');
  assert.equal(early[early.length-1],0,'bottom crop edge is feathered');
  const middle=(Math.floor(height/2)*width+Math.floor(width/2))*4;
  const black=middle-middle%12;
  assert.equal(early[black+3],0,'black source pixels are transparent');
  h.advance(200);assert.notDeepEqual(stage.pixels,early,'video detail changes between frames');
  h.advance(3500);const beforeFade=alphaTotal(stage);assert(beforeFade>0);
  h.advance(600);assert(alphaTotal(stage)<beforeFade*.55,'the ending fades the extracted footage');
  h.advance(400);assert.equal(alphaTotal(stage),0);assert.equal(h.queued,0);
});

test('page lifecycle pauses cached pages and releases videos on final teardown',async()=>{
  const h=harness();h.enter(0);await flush();h.advance(100);
  const video=h.videos[0],time=video.currentTime;
  h.pagehide(true);h.advance(1000);assert.equal(video.currentTime,time);assert.equal(h.queued,0);
  h.pageshow();await flush();h.advance(100);assert(video.currentTime>time);
  h.pagehide(false);assert.equal(video.src,'');assert.equal(video.listenerCount,0);assert.equal(h.queued,0);
});
