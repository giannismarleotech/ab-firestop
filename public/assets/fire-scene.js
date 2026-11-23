/* AB Firestop: a short, dependency-free volumetric flame introduction.
   Decorative only; settles after 4.8 seconds of visible animation. */
(() => {
  'use strict';
  const stage = document.querySelector('.fire-stage');
  let canvas = stage?.querySelector('.fire-canvas');
  if (!stage || !canvas) return;

  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const small = matchMedia('(max-width: 800px)');
  const duration = 4.8;
  let gl, context2d, program, buffer, uniforms, frame = 0, last = 0, time = 9, elapsed = 0;
  let settled = reduced.matches;
  let visible = true, disposed = false, lost = false, pointerX = 0, pointerY = 0;
  let mouseX = 0, mouseY = 0, resizeObserver, visibilityObserver;

  const vertex = `
    attribute vec2 position;
    varying vec2 uv;
    void main(){uv=position*.5+.5;gl_Position=vec4(position,0.,1.);}
  `;
  const fragment = `
    precision mediump float;
    varying vec2 uv;
    uniform vec2 resolution;
    uniform vec2 pointer;
    uniform float time;

    float hash(vec3 p){p=fract(p*.3183099+vec3(.13,.27,.41));p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
    float noise(vec3 p){
      vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
      return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
        mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);
    }
    float flow(vec3 p){
      float v=noise(p)*.56;
      p=p*2.03+vec3(4.3,2.1,8.7);v+=noise(p)*.28;
      p=p*2.01+vec3(3.1,5.7,2.4);v+=noise(p)*.14;
      return v;
    }
    float density(vec3 p){
      float height=(p.y+1.18)/2.65;
      if(height<0. || height>1. || abs(p.x)>1.65 || abs(p.z)>.95)return 0.;
      vec3 q=p;
      // Smaller tongues stream upwards through a deeper central body.
      float curl=sin(p.y*2.7-time*1.25)*.12+sin(p.y*5.3+time*.7)*.055;
      q.x+=curl*height;
      float width=mix(.92,.045,pow(height,.8));
      float radial=length(vec2(q.x*.88,q.z*1.45));
      float shape=1.-radial/max(width,.05);
      float n=flow(vec3(q.x*3.1,q.y*2.45-time*2.2,q.z*3.6+time*.18));
      float ribbon=sin(q.x*10.+q.y*4.8-time*3.2+n*6.)*.08;
      float tongue=shape-(n*.96+height*.34)+ribbon;
      float d=max(0.,tongue)*smoothstep(0.,.07,height)*(1.-smoothstep(.82,1.,height));
      // Two separated side tongues keep depth visible around the emblem.
      float side=abs(q.x)-(.87+.12*sin(q.y*3.-time*1.2));
      float flank=1.-length(vec2(side*1.7,q.z*2.5))/max(.46-height*.31,.08);
      d+=max(0.,flank-n*.8-height*.48)*.78*smoothstep(0.,.06,height)*(1.-smoothstep(.65,.95,height));
      return d;
    }
    vec3 flameColour(float heat){
      vec3 red=vec3(.9,.055,.012),orange=vec3(1.75,.38,.035),gold=vec3(2.4,1.2,.35);
      return mix(mix(red,orange,smoothstep(.02,.35,heat)),gold,smoothstep(.35,.75,heat));
    }
    void main(){
      vec2 p=(uv-.5)*vec2(resolution.x/resolution.y,1.);
      vec3 origin=vec3(pointer.x*.24,.14+pointer.y*.08,4.2);
      vec3 ray=normalize(vec3(p*3.3, -3.5));
      vec3 colour=vec3(0.);
      float transmittance=1.;
      // Front-to-back integration gives overlapping flame folds real volume.
      for(int i=0;i<22;i++){
        float distance=2.65+float(i)*.135;
        vec3 point=origin+ray*distance;
        float d=density(point);
        float opacity=1.-exp(-d*.44);
        colour+=transmittance*flameColour(d)*opacity*1.3;
        transmittance*=1.-opacity;
      }
      float baseGlow=exp(-length(vec2(p.x*1.55,(p.y+.27)*3.7))*4.5);
      colour+=vec3(.36,.048,.009)*baseGlow;
      // Sparse rising sparks, with stable positions and individually varied speeds.
      for(int i=0;i<12;i++){
        float seed=float(i)+1.;
        float phase=fract(time*(.08+hash(vec3(seed))* .065)+hash(vec3(seed,4.,7.)));
        float sx=(hash(vec3(seed,2.,9.))-.5)*.63;
        sx+=sin(phase*7.+seed+time*.3)*.026;
        vec2 spark=vec2(sx,-.34+phase*.83);
        float radius=.0018+hash(vec3(seed,9.,3.))*.0015;
        float bright=exp(-length((p-spark)/vec2(1.,1.7))/radius)*sin(phase*3.14159);
        colour+=vec3(1.4,.34,.045)*bright*.8;
      }
      // Fade the volume into the surrounding hero, with no rectangular edges.
      float edge=smoothstep(0.,.14,uv.x)*smoothstep(0.,.14,1.-uv.x)*smoothstep(0.,.12,uv.y)*smoothstep(0.,.18,1.-uv.y);
      colour=1.-exp(-colour*1.35);
      colour*=edge;
      gl_FragColor=vec4(colour,clamp(max(colour.r,max(colour.g,colour.b))*1.25,0.,1.));
    }
  `;

  function fallback() {
    cancelAnimationFrame(frame); frame = 0; last = 0;
    stage.classList.remove('fire-ready');
    stage.classList.add('fire-fallback');
    try {
      // A canvas cannot switch between WebGL and 2D once claimed. Replace only
      // this decorative element; its dimensions, class and accessibility stay.
      canvas.removeEventListener('webglcontextlost', contextLost);
      canvas.removeEventListener('webglcontextrestored', contextRestored);
      const replacement = canvas.cloneNode(false);
      canvas.replaceWith(replacement); canvas = replacement;
      if (gl && !lost) { if (buffer) gl.deleteBuffer(buffer); if (program) gl.deleteProgram(program); }
      gl = null; program = null; lost = false;
      context2d = canvas.getContext('2d', {alpha: true, desynchronized: true});
      if (!context2d) return;
      stage.classList.remove('fire-fallback');
      stage.classList.add('fire-ready', 'fire-2d');
      resize(); sync();
    } catch (_) { context2d = null; }
  }

  const seeded = value => { const n = Math.sin(value * 127.1 + 311.7) * 43758.5453; return n - Math.floor(n); };
  function smoothPath(points) {
    const ctx = context2d;
    ctx.moveTo(points[0][0], points[0][1]);
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[Math.max(0, i - 1)], p1 = points[i];
      const p2 = points[i + 1], p3 = points[Math.min(points.length - 1, i + 2)];
      ctx.bezierCurveTo(p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6,
        p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6, p2[0], p2[1]);
    }
  }
  function flameRibbon(seed, centre, height, width, opacity, core = false) {
    const ctx = context2d, w = canvas.width, h = canvas.height;
    const base = h * (.88 + seeded(seed + 42) * .055);
    const reach = height * h * (.94 + Math.sin(time * 2.3 + seed) * .06);
    const left = [], right = [];
    for (let j = 0; j <= 11; j++) {
      const u = j / 11;
      const bend = (Math.sin(u * 7.2 - time * 3.1 + seed) * .018 + Math.sin(u * 13. + time * 2.7 + seed * .31) * .009) * w * u;
      const sway = Math.sin(time * 1.3 + seed) * w * .009 * u;
      const x = centre * w + bend + sway + mouseX * w * .018;
      const y = base - u * reach;
      const radius = width * w * Math.pow(1 - u, 1.15) * (.48 + Math.sin(u * 2.7) * .52)
        * (.85 + Math.sin(u * 16. - time * 4.8 + seed) * .15);
      left.push([x - radius, y]); right.push([x + radius, y]);
    }
    const gradient = ctx.createLinearGradient(0, base, 0, base - reach);
    if (core) {
      gradient.addColorStop(0, `rgba(255,226,157,${opacity * .55})`);
      gradient.addColorStop(.25, `rgba(255,172,50,${opacity})`);
      gradient.addColorStop(.6, `rgba(255,94,12,${opacity * .55})`);
      gradient.addColorStop(1, 'rgba(255,60,5,0)');
    } else {
      gradient.addColorStop(0, `rgba(210,32,6,${opacity * .25})`);
      gradient.addColorStop(.2, `rgba(255,83,9,${opacity * .8})`);
      gradient.addColorStop(.55, `rgba(255,64,5,${opacity})`);
      gradient.addColorStop(.85, `rgba(235,37,4,${opacity * .4})`);
      gradient.addColorStop(1, 'rgba(175,15,2,0)');
    }
    ctx.beginPath(); smoothPath(left.concat(right.reverse())); ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.shadowColor = core ? 'rgba(255,121,28,.26)' : 'rgba(242,47,8,.22)';
    ctx.shadowBlur = core ? w * .009 : w * .024;
    ctx.fill();
  }
  function paint2d() {
    const ctx = context2d, w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'source-over';
    const glow = ctx.createRadialGradient(w * .5, h * .76, 0, w * .5, h * .76, w * .48);
    glow.addColorStop(0, 'rgba(240,58,12,.10)'); glow.addColorStop(.55, 'rgba(190,24,7,.055)'); glow.addColorStop(1, 'rgba(90,4,0,0)');
    ctx.fillStyle = glow; ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'lighter';
    // Varying opacity, width and turbulence form folded ribbons, rather than
    // opaque cartoon flame silhouettes. Flanks stay visible beside the logo.
    for (let i = 0; i < 16; i++) {
      const seed = i + 1;
      const side = i % 2 === 0 ? .22 : .78;
      const centre = side + (seeded(seed) - .5) * .18;
      const height = .42 + seeded(seed + 11) * .34;
      const width = .028 + seeded(seed + 22) * .028;
      flameRibbon(seed, centre, height, width, .22 + seeded(seed + 7) * .15);
      flameRibbon(seed + .13, centre, height * .82, width * .45, .35 + seeded(seed + 2) * .2, true);
    }
    // Thin high tongues add movement above the plate without obscuring it.
    for (let i = 0; i < 4; i++) {
      const centre = .38 + i * .08;
      flameRibbon(37 + i, centre, .78 + seeded(i + 62) * .08, .028, .14);
    }
    ctx.shadowBlur = 0;
    for (let i = 0; i < 22; i++) {
      const seed = i + 17;
      const phase = (time * (.10 + seeded(seed + 2) * .11) + seeded(seed)) % 1;
      const x = w * (.12 + seeded(seed + 5) * .76 + Math.sin(phase * 7 + seed) * .018);
      const y = h * (.91 - phase * .83);
      const alpha = Math.sin(phase * Math.PI) * (.25 + seeded(seed + 8) * .5);
      ctx.strokeStyle = `rgba(255,${Math.round(114 + seeded(seed + 6) * 72)},42,${alpha})`;
      ctx.lineWidth = Math.max(.6, w * .0016);
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w * .001, y + h * (.004 + seeded(seed + 12) * .005)); ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
  }
  function compile(type, source) {
    const shader = gl.createShader(type);
    if (!shader) return null;
    gl.shaderSource(shader, source); gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.warn('[AB Firestop] Flame shader could not compile:', gl.getShaderInfoLog(shader));
      gl.deleteShader(shader); return null;
    }
    return shader;
  }
  function resize() {
    if ((!gl && !context2d) || lost || disposed) return;
    const rect = stage.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const ratio = Math.min(devicePixelRatio || 1, 1.35);
    const budget = small.matches ? 130000 : 275000;
    const scale = Math.min(ratio, Math.sqrt(budget / (rect.width * rect.height)));
    const width = Math.max(1, Math.round(rect.width * scale));
    const height = Math.max(1, Math.round(rect.height * scale));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width; canvas.height = height;
      if (gl) gl.viewport(0, 0, width, height);
    }
    if (!frame) paint();
  }
  function paint() {
    if (lost || disposed) return;
    if (context2d) { paint2d(); return; }
    if (!gl || !program) return;
    gl.useProgram(program);
    gl.uniform2f(uniforms.resolution, canvas.width, canvas.height);
    gl.uniform2f(uniforms.pointer, mouseX, mouseY);
    gl.uniform1f(uniforms.time, time);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }
  function running() {
    return !disposed && !lost && !settled && (!!program || !!context2d) && visible && !document.hidden && !reduced.matches;
  }
  function tick(now) {
    frame = 0;
    if (!running()) { last = 0; return; }
    const interval = small.matches ? 1000 / 24 : 1000 / 30;
    if (!last || now - last >= interval) {
      const dt = last ? Math.min((now - last) / 1000, duration - elapsed) : 0;
      elapsed += dt; time += dt; last = now;
      mouseX += (pointerX - mouseX) * .07;
      mouseY += (pointerY - mouseY) * .07;
      paint();
      if (elapsed >= duration) {
        settled = true; stage.classList.add('fire-settled'); last = 0; return;
      }
    }
    frame = requestAnimationFrame(tick);
  }
  function sync() {
    stage.classList.toggle('fire-reduced', reduced.matches);
    // Once finished (or reduced motion is requested), never restart on hover,
    // resizing, visibility changes, or a return from the back-forward cache.
    if (reduced.matches) settled = true;
    stage.classList.toggle('fire-settled', settled);
    if (!running()) { cancelAnimationFrame(frame); frame = 0; last = 0; }
    else if (!frame) frame = requestAnimationFrame(tick);
  }
  function initialise() {
    try {
      gl = canvas.getContext('webgl', {alpha: true, antialias: false, depth: false, stencil: false, premultipliedAlpha: false, preserveDrawingBuffer: false, powerPreference: 'low-power'});
      if (!gl) { console.warn('[AB Firestop] WebGL unavailable; using the lightweight flame renderer.'); fallback(); return; }
      const vs = compile(gl.VERTEX_SHADER, vertex), fs = compile(gl.FRAGMENT_SHADER, fragment);
      if (!vs || !fs) { if (vs) gl.deleteShader(vs); if (fs) gl.deleteShader(fs); fallback(); return; }
      program = gl.createProgram();
      if (!program) { gl.deleteShader(vs); gl.deleteShader(fs); fallback(); return; }
      gl.attachShader(program, vs); gl.attachShader(program, fs); gl.linkProgram(program);
      gl.deleteShader(vs); gl.deleteShader(fs);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        console.warn('[AB Firestop] Flame shader could not link:', gl.getProgramInfoLog(program));
        gl.deleteProgram(program); program = null; fallback(); return;
      }
      gl.useProgram(program);
      buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]), gl.STATIC_DRAW);
      const position = gl.getAttribLocation(program, 'position');
      gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
      uniforms = {resolution: gl.getUniformLocation(program, 'resolution'), pointer: gl.getUniformLocation(program, 'pointer'), time: gl.getUniformLocation(program, 'time')};
      stage.classList.remove('fire-fallback'); stage.classList.add('fire-ready');
      resize(); sync();
    } catch (error) {
      console.warn('[AB Firestop] Flame rendering unavailable:', error?.message || 'Graphics initialisation failed');
      program = null; fallback();
    }
  }
  function pointer(event) {
    if (event.pointerType === 'touch' || reduced.matches || settled) return;
    const r = stage.getBoundingClientRect();
    pointerX = (event.clientX - r.left) / r.width - .5;
    pointerY = (event.clientY - r.top) / r.height - .5;
  }
  function resetPointer() { pointerX = 0; pointerY = 0; }
  function contextLost(event) { event.preventDefault(); lost = true; fallback(); }
  function contextRestored() { lost = false; program = null; initialise(); }
  function destroy(event) {
    // Keep a back-forward cached page resumable.
    if (event.persisted) { cancelAnimationFrame(frame); frame = 0; return; }
    disposed = true; cancelAnimationFrame(frame);
    resizeObserver?.disconnect(); visibilityObserver?.disconnect();
    reduced.removeEventListener('change', sync); document.removeEventListener('visibilitychange', sync);
    window.removeEventListener('resize', resize); window.removeEventListener('pageshow', sync);
    stage.removeEventListener('pointermove', pointer); stage.removeEventListener('pointerleave', resetPointer);
    canvas.removeEventListener('webglcontextlost', contextLost); canvas.removeEventListener('webglcontextrestored', contextRestored);
    if (gl && !lost) { if (buffer) gl.deleteBuffer(buffer); if (program) gl.deleteProgram(program); }
  }

  canvas.setAttribute('aria-hidden', 'true');
  reduced.addEventListener('change', sync);
  document.addEventListener('visibilitychange', sync);
  window.addEventListener('pageshow', sync);
  window.addEventListener('pagehide', destroy);
  window.addEventListener('resize', resize, {passive: true});
  stage.addEventListener('pointermove', pointer, {passive: true});
  stage.addEventListener('pointerleave', resetPointer, {passive: true});
  canvas.addEventListener('webglcontextlost', contextLost);
  canvas.addEventListener('webglcontextrestored', contextRestored);
  if ('ResizeObserver' in window) { resizeObserver = new ResizeObserver(resize); resizeObserver.observe(stage); }
  if ('IntersectionObserver' in window) {
    visibilityObserver = new IntersectionObserver(entries => { visible = entries[0].isIntersecting; sync(); }, {threshold: .01});
    visibilityObserver.observe(stage);
  }
  initialise();
})();
