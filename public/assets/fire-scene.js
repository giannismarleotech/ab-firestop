/* AB Firestop: real fire footage, extracted onto a transparent canvas.
   Every entrance plays once; one scheduler serves all visible accents. */
(() => {
  'use strict';
  const elements = [...document.querySelectorAll('.fire-stage')];
  if (!elements.length) return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const small = matchMedia('(max-width: 800px)');
  const duration = 4.8, fadeStart = 4;
  const scenes = [];
  let frame = 0, disposed = false, suspended = false;
  const clamp = value => Math.max(0, Math.min(1, value));
  const smooth = value => { const t = clamp(value); return t * t * (3 - 2 * t); };
  const alpha = new Float32Array(256), colour = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    // Lift the source colour out of its black backing before compositing on
    // white. Preserve dim fine flame detail without retaining black fringes.
    alpha[i] = Math.pow(clamp((i - 9) / 246), .72) * smooth((i - 9) / 19);
    colour[i] = i > 9 ? 255 / i : 0;
  }
  function eligible(scene) {
    return !disposed && !suspended && !document.hidden && !reduced.matches
      && scene.visible && !scene.settled && !scene.failed && !!scene.ctx;
  }
  function active(scene) { return eligible(scene) && scene.playing && !!scene.video && !scene.video.paused; }
  function clear(scene) { scene.ctx?.clearRect(0, 0, scene.canvas.width, scene.canvas.height); }
  function schedule() {
    if (scenes.some(active)) { if (!frame) frame = requestAnimationFrame(tick); }
    else { cancelAnimationFrame(frame); frame = 0; }
  }
  function release(scene) {
    scene.playId++; scene.pending = false; scene.playing = false;
    const video = scene.video;
    scene.video = null;
    if (!video) return;
    scene.listeners.forEach(([event, listener]) => video.removeEventListener(event, listener));
    scene.listeners = [];
    video.pause(); video.removeAttribute('src'); video.load();
  }
  function settle(scene, failed = false) {
    scene.settled = true; scene.failed = failed;
    scene.stage.classList.add('fire-settled');
    if (failed) { scene.stage.classList.remove('fire-ready'); scene.stage.classList.add('fire-unavailable'); }
    release(scene); clear(scene); schedule();
  }
  function paint(scene) {
    const {ctx, canvas, video} = scene;
    if (!ctx || !video || video.readyState < 2 || !video.videoWidth || !video.videoHeight) return;
    const time = video.currentTime;
    if (time >= duration) { settle(scene); return; }
    const w = canvas.width, h = canvas.height;
    const scale = Math.min(w / video.videoWidth, h / video.videoHeight);
    const dw = Math.max(1, Math.round(video.videoWidth * scale)), dh = Math.max(1, Math.round(video.videoHeight * scale));
    const dx = Math.floor((w - dw) / 2), dy = Math.floor((h - dh) / 2);
    const fade = 1 - smooth((time - fadeStart) / (duration - fadeStart));
    if (scene.maskWidth !== dw || scene.maskHeight !== dh) {
      scene.maskWidth = dw; scene.maskHeight = dh;
      scene.edgeX = Float32Array.from({length: dw}, (_, x) => smooth(x / (dw * .025)) * smooth((dw - 1 - x) / (dw * .025)));
      scene.edgeY = Float32Array.from({length: dh}, (_, y) => smooth(y / (dh * .075)) * smooth((dh - 1 - y) / (dh * .11)));
    }
    try {
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(video, dx, dy, dw, dh);
      const pixels = ctx.getImageData(dx, dy, dw, dh), data = pixels.data;
      // Feather within the footage bounds, not the letterbox. The recorded
      // plume may cross a crop edge; no rectangular top or base should remain.
      for (let y = 0; y < dh; y++) {
        const edgeY = scene.edgeY[y] * fade;
        for (let x = 0; x < dw; x++) {
          const i = (y * dw + x) * 4;
          const red = data[i], green = data[i + 1], blue = data[i + 2];
          const light = red > green ? (red > blue ? red : blue) : (green > blue ? green : blue);
          if (light <= 9) { data[i + 3] = 0; continue; }
          const opacity = alpha[light] * edgeY * scene.edgeX[x];
          const lift = colour[light];
          data[i] = red * lift; data[i + 1] = green * lift; data[i + 2] = blue * lift;
          data[i + 3] = opacity * 255;
        }
      }
      ctx.putImageData(pixels, dx, dy);
      scene.lastTime = time;
    } catch (_) { settle(scene, true); }
  }
  function tick(now) {
    frame = 0;
    for (const scene of scenes) {
      if (!active(scene)) continue;
      if (now - scene.lastFrame < 1000 / 24 || scene.video.currentTime === scene.lastTime) continue;
      scene.lastFrame = now; paint(scene);
    }
    schedule();
  }
  function createVideo(scene) {
    // Called only for a visible, non-reduced-motion entrance. No hidden video
    // markup or preload requests are needed by visitors who reduce motion.
    const video = document.createElement('video');
    video.muted = true; video.defaultMuted = true; video.playsInline = true;
    video.preload = 'none'; video.loop = false;
    video.setAttribute('playsinline', ''); video.setAttribute('muted', '');
    video.src = '/assets/fire-footage.mp4';
    scene.video = video;
    const listen = (event, listener) => { video.addEventListener(event, listener); scene.listeners.push([event, listener]); };
    listen('playing', () => {
      if (scene.video !== video) return;
      if (!eligible(scene)) { video.pause(); return; }
      scene.playing = true; schedule();
    });
    listen('waiting', () => { scene.playing = false; clear(scene); schedule(); });
    listen('pause', () => { scene.playing = false; schedule(); });
    listen('ended', () => settle(scene));
    listen('error', () => settle(scene, true));
    return video;
  }
  function resume(scene) {
    if (!eligible(scene) || scene.pending || scene.playing) return;
    const video = scene.video || createVideo(scene), id = ++scene.playId;
    scene.pending = true;
    try {
      const result = video.play();
      Promise.resolve(result).then(() => {
        if (scene.video !== video || scene.playId !== id) return;
        scene.pending = false;
        if (!eligible(scene)) { video.pause(); return; }
        // The playing event starts RAF after actual playback, never while the
        // file is downloading or waiting for a decoder.
      }, () => { if (scene.video === video && scene.playId === id) settle(scene, true); });
    } catch (_) { settle(scene, true); }
  }
  function pause(scene) {
    scene.playId++; scene.pending = false; scene.playing = false;
    scene.video?.pause();
  }
  function resize(scene) {
    if (!scene.ctx || disposed) return;
    const rect = scene.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const budget = scene.accent ? 32000 : small.matches ? 100000 : 180000;
    const scale = Math.min(1, Math.sqrt(budget / (rect.width * rect.height)));
    const w = Math.max(1, Math.floor(rect.width * scale)), h = Math.max(1, Math.floor(rect.height * scale));
    if (scene.canvas.width !== w || scene.canvas.height !== h) {
      scene.canvas.width = w; scene.canvas.height = h; scene.lastTime = -1;
      if (active(scene)) paint(scene); else clear(scene);
    }
  }
  function enter(scene) {
    if (scene.visible) return;
    scene.visible = true; scene.settled = reduced.matches || scene.failed;
    scene.lastTime = -1; scene.lastFrame = -Infinity;
    scene.stage.classList.toggle('fire-settled', scene.settled);
    resize(scene); resume(scene);
  }
  function exit(scene) { scene.visible = false; release(scene); clear(scene); schedule(); }
  for (const stage of elements) {
    const canvas = stage.querySelector('.fire-canvas');
    if (!canvas) continue;
    canvas.setAttribute('aria-hidden', 'true');
    let ctx;
    try { ctx = canvas.getContext('2d', {alpha: true, willReadFrequently: true}); } catch (_) {}
    if (!ctx) { stage.classList.add('fire-unavailable', 'fire-settled'); continue; }
    const scene = {stage, canvas, ctx, accent: stage.dataset.fireVariant === 'accent', visible: false,
      settled: reduced.matches, failed: false, playing: false, pending: false, video: null,
      playId: 0, listeners: [], lastTime: -1, lastFrame: -Infinity, resizeObserver: null, visibilityObserver: null};
    scenes.push(scene);
    stage.classList.add('fire-ready', 'fire-2d'); stage.classList.remove('fire-fallback');
    stage.classList.toggle('fire-reduced', reduced.matches); stage.classList.toggle('fire-settled', scene.settled);
    resize(scene);
    if ('ResizeObserver' in window) {
      scene.resizeObserver = new ResizeObserver(() => resize(scene)); scene.resizeObserver.observe(stage);
    }
    if ('IntersectionObserver' in window) {
      scene.visibilityObserver = new IntersectionObserver(entries => {
        const entry = entries[0];
        if (!entry.isIntersecting || entry.intersectionRatio === 0) exit(scene);
        else if (entry.intersectionRatio >= .12) enter(scene);
      }, {threshold: [0, .12]});
      scene.visibilityObserver.observe(stage);
    } else {
      const rect = stage.getBoundingClientRect();
      if (rect.top < innerHeight && rect.bottom > 0) enter(scene);
    }
  }
  function onVisibility() {
    scenes.forEach(scene => { if (document.hidden || suspended) pause(scene); else resume(scene); });
    schedule();
  }
  function onMotionPreference() {
    for (const scene of scenes) {
      scene.stage.classList.toggle('fire-reduced', reduced.matches);
      if (reduced.matches) { scene.settled = true; scene.stage.classList.add('fire-settled'); release(scene); clear(scene); }
      else if (scene.visible && !scene.failed) {
        scene.settled = false; scene.stage.classList.remove('fire-settled'); resume(scene);
      }
    }
    schedule();
  }
  function onResize() { scenes.forEach(resize); }
  function onPageShow() { suspended = false; onVisibility(); }
  function onPageHide(event) {
    if (event.persisted) { suspended = true; onVisibility(); return; }
    disposed = true; cancelAnimationFrame(frame); frame = 0;
    scenes.forEach(scene => { release(scene); clear(scene); scene.resizeObserver?.disconnect(); scene.visibilityObserver?.disconnect(); });
    reduced.removeEventListener('change', onMotionPreference);
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('resize', onResize); window.removeEventListener('pageshow', onPageShow); window.removeEventListener('pagehide', onPageHide);
  }
  reduced.addEventListener('change', onMotionPreference);
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('resize', onResize, {passive: true});
  window.addEventListener('pageshow', onPageShow); window.addEventListener('pagehide', onPageHide);
})();
