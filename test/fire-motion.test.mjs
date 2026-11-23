import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source=readFileSync(new URL('../public/assets/fire-motion.js',import.meta.url),'utf8');
function harness({reduced=false,saveData=false,playback='playing',duration=4.8,observer=true}={}){
  const frames=new Map(),observers=new Map(),events=new Map(),preferences=new Map(),connections=new Map(),videos=[];
  let next=0,maxQueued=0,now=100;
  const noop=()=>{};
  const hosts=Array.from({length:3},()=>{
    const classes=new Set(),children=[];
    return {classes,children,classList:{add:(...names)=>names.forEach(name=>classes.add(name)),remove:(...names)=>names.forEach(name=>classes.delete(name)),toggle:(name,on)=>on?classes.add(name):classes.delete(name)},
      appendChild(video){children.push(video);video.parent=this;}};
  });
  function makeVideo(){
    const listeners=new Map(),attributes=new Map();
    const video={mode:playback,currentTime:0,duration,paused:true,src:'',style:{},attributes,parent:null,
      pauseCalls:0,loadCalls:0,playCalls:0,
      setAttribute:(name,value)=>attributes.set(name,value),
      addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:(name,fn)=>{if(listeners.get(name)===fn)listeners.delete(name);},
      emit(name){listeners.get(name)?.();},
      play(){this.playCalls++;if(this.mode==='reject')return Promise.reject(new Error('Autoplay blocked'));this.paused=false;if(this.mode==='loading')return new Promise(()=>{});this.emit('playing');return Promise.resolve();},
      pause(){this.pauseCalls++;this.paused=true;this.emit('pause');},
      removeAttribute(name){attributes.delete(name);if(name==='src')this.src='';},
      load(){this.loadCalls++;},
      remove(){if(this.parent){this.parent.children.splice(this.parent.children.indexOf(this),1);this.parent=null;}},
      get listenerCount(){return listeners.size;}
    };videos.push(video);return video;
  }
  const motion={matches:reduced,addEventListener:(_,fn)=>preferences.set('change',fn),removeEventListener:noop};
  const connection={saveData,addEventListener:(_,fn)=>connections.set('change',fn),removeEventListener:noop};
  const document={hidden:false,querySelectorAll:selector=>{assert.equal(selector,'.fire-film');return hosts;},
    createElement:tag=>{assert.equal(tag,'video','the renderer uses native video only');return makeVideo();},
    addEventListener:(name,fn)=>events.set(name,fn),removeEventListener:noop};
  const window={addEventListener:(name,fn)=>events.set(name,fn),removeEventListener:noop};
  if(observer)window.IntersectionObserver=true;
  runInNewContext(source,{document,window,navigator:{connection},Math,Number,Promise,matchMedia:()=>motion,
    requestAnimationFrame(fn){const id=++next;frames.set(id,fn);maxQueued=Math.max(maxQueued,frames.size);return id;},cancelAnimationFrame:id=>frames.delete(id),
    IntersectionObserver:class{constructor(fn,options){this.fn=fn;assert.deepEqual([...options.threshold],[0,.2]);}observe(host){observers.set(host,this.fn);}disconnect(){}}
  });
  return {hosts,videos,
    enter(index,ratio=1){observers.get(hosts[index])?.([{isIntersecting:ratio>0,intersectionRatio:ratio}]);},
    exit(index){this.enter(index,0);},
    hidden(value){document.hidden=value;events.get('visibilitychange')();},
    preference(value){motion.matches=value;preferences.get('change')();},
    saveData(value){connection.saveData=value;connections.get('change')();},
    start(video){video.mode='playing';video.paused=false;video.emit('playing');},
    wait(video){video.mode='loading';video.emit('waiting');},
    pagehide(persisted=false){events.get('pagehide')({persisted});},pageshow(){events.get('pageshow')();},
    advance(ms,step=1000/30){const end=now+ms;while(now+.001<end){const delta=Math.min(step,end-now);now+=delta;for(const video of videos){if(video.paused||!video.src||video.mode!=='playing')continue;video.currentTime=Math.min(video.duration,video.currentTime+delta/1000);if(video.currentTime>=video.duration-.00001)video.emit('ended');}for(const[id,fn]of[...frames]){frames.delete(id);fn(now);}}},
    get queued(){return frames.size;},get maxQueued(){return maxQueued;}
  };
}
const flush=()=>Promise.resolve();

test('native film is lazy, decorative, inline and shares a scheduler across visible hosts',async()=>{
  const h=harness();assert.equal(h.videos.length,0);assert.equal(h.queued,0);
  h.enter(0,.19);assert.equal(h.videos.length,0,'less than 20% visibility never starts a download');
  h.enter(0,.2);h.enter(1);await flush();h.advance(500);
  assert.equal(h.videos.length,2);assert.equal(h.hosts[2].children.length,0);assert.equal(h.maxQueued,1);
  for(let i=0;i<2;i++){
    const video=h.videos[i];assert.equal(h.hosts[i].children[0],video,'video remains native and connected to its host');
    assert.equal(video.className,'fire-film-video');assert(video.muted&&video.defaultMuted&&video.playsInline);
    assert.equal(video.preload,'none');assert.equal(video.loop,false);assert.equal(video.controls,false);
    assert.equal(video.attributes.get('aria-hidden'),'true');assert.equal(video.src,'/assets/fire-footage.mp4');
  }
});

test('a short fade-in and final fade finish within 4.8 seconds and release the decoder',async()=>{
  const h=harness({duration:9});h.enter(0);await flush();
  const video=h.videos[0];assert.equal(Number(video.style.opacity),0);
  h.advance(150);assert(Number(video.style.opacity)>0&&Number(video.style.opacity)<.8);
  h.advance(500);assert.equal(Number(video.style.opacity),1);
  h.advance(3800);assert(h.hosts[0].classes.has('is-fading'));assert(Number(video.style.opacity)>0&&Number(video.style.opacity)<.6);
  h.advance(500);assert.equal(h.queued,0);assert(h.hosts[0].classes.has('has-played'));assert(!h.hosts[0].classes.has('is-playing'));
  assert.equal(h.hosts[0].children.length,0);assert.equal(video.src,'');assert(video.paused);assert.equal(video.listenerCount,0);assert(video.currentTime<4.85);
});

test('completed films replay only after a full viewport exit',async()=>{
  const h=harness();h.enter(0);await flush();h.advance(5000);
  h.enter(0);h.enter(0,.1);h.enter(0,.5);assert.equal(h.videos.length,1,'threshold wobble does not restart a completed film');
  h.exit(0);h.enter(0);await flush();assert.equal(h.videos.length,2);assert.equal(h.videos[1].currentTime,0);
  assert(!h.hosts[0].classes.has('has-played'));assert(h.hosts[0].classes.has('is-playing'));
});

test('loading, buffering, scrolling and hidden time never consume the remaining clip',async()=>{
  const h=harness({playback:'loading'});h.enter(0);h.advance(10000);
  const video=h.videos[0];assert.equal(video.currentTime,0);assert.equal(h.queued,0);
  h.start(video);h.advance(1000);h.enter(0,.1);
  const time=video.currentTime;h.advance(5000);assert.equal(video.currentTime,time);assert.equal(h.queued,0);assert.equal(Number(video.style.opacity),0);
  h.exit(0);h.enter(0);await flush();h.advance(300);assert.equal(h.videos.length,1,'unfinished film resumes instead of replaying');assert(video.currentTime>time);
  h.hidden(true);const hiddenTime=video.currentTime;h.advance(5000);assert.equal(video.currentTime,hiddenTime);assert.equal(h.queued,0);
  h.hidden(false);await flush();h.advance(200);assert(video.currentTime>hiddenTime);
  h.wait(video);h.advance(1000);assert.equal(h.queued,0);assert.equal(Number(video.style.opacity),0,'a buffering frame is never left pasted on screen');
  h.start(video);h.advance(100);assert(h.queued>0);
});

test('reduced motion and save-data make no initial video requests and can stop active playback',async()=>{
  for(const option of [{reduced:true},{saveData:true}]){
    const h=harness(option);h.enter(0);h.enter(1);h.advance(5000);
    assert.equal(h.videos.length,0);assert.equal(h.queued,0);assert(h.hosts[0].classes.has('is-static'));
  }
  const h=harness();h.enter(0);await flush();h.advance(200);h.preference(true);
  assert.equal(h.hosts[0].children.length,0);assert.equal(h.queued,0);assert.equal(h.videos[0].src,'');
  h.preference(false);await flush();assert.equal(h.videos.length,2);
  h.saveData(true);assert.equal(h.hosts[0].children.length,0);assert.equal(h.queued,0);
  assert(h.hosts[0].classes.has('is-static'));
});

test('autoplay and network failures leave the fallback, while unsupported observers stay still',async()=>{
  const blocked=harness({playback:'reject'});blocked.enter(0);await flush();await flush();
  assert(blocked.hosts[0].classes.has('is-unavailable'));assert.equal(blocked.hosts[0].children.length,0);assert.equal(blocked.queued,0);
  blocked.exit(0);blocked.enter(0);assert.equal(blocked.videos.length,1,'blocked playback is not repeatedly retried');
  const failed=harness();failed.enter(0);await flush();failed.videos[0].emit('error');
  assert.equal(failed.hosts[0].children.length,0);assert.equal(failed.videos[0].listenerCount,0);assert.equal(failed.queued,0);
  const oldBrowser=harness({observer:false});oldBrowser.advance(5000);assert.equal(oldBrowser.videos.length,0);assert.equal(oldBrowser.queued,0);
});

test('page cache pauses playback and final teardown removes media and callbacks',async()=>{
  const h=harness();h.enter(0);await flush();h.advance(200);const video=h.videos[0];
  h.pagehide(true);const time=video.currentTime;h.advance(1000);assert.equal(video.currentTime,time);assert.equal(h.queued,0);
  h.pageshow();await flush();h.advance(100);assert(video.currentTime>time);
  h.pagehide();assert.equal(h.hosts[0].children.length,0);assert.equal(video.listenerCount,0);assert.equal(video.src,'');assert.equal(h.queued,0);
});
