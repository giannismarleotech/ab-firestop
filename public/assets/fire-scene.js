/* AB Firestop: transparent flame accents for a light background.
   One shared scheduler; each entrance plays for 4.8 seconds, then rests. */
(() => {
  'use strict';
  const elements = [...document.querySelectorAll('.fire-stage')];
  if (!elements.length) return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const small = matchMedia('(max-width: 800px)');
  const duration = 4.8;
  const scenes = [];
  let frame = 0, disposed = false, suspended = false;
  const seeded = value => { const n = Math.sin(value * 127.1 + 311.7) * 43758.5453; return n - Math.floor(n); };

  function smoothPath(ctx, points) {
    ctx.moveTo(points[0][0], points[0][1]);
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[Math.max(0, i - 1)], p1 = points[i];
      const p2 = points[i + 1], p3 = points[Math.min(points.length - 1, i + 2)];
      ctx.bezierCurveTo(p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6,
        p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6, p2[0], p2[1]);
    }
  }
  function ribbon(scene, seed, centre, height, width, opacity, core = false) {
    const {ctx, canvas, time} = scene, w = canvas.width, h = canvas.height;
    const base = h * (.89 + seeded(seed + 42) * .035);
    const reach = height * h * (.94 + Math.sin(time * 2.3 + seed) * .06);
    const left = [], right = [];
    for (let j = 0; j <= 10; j++) {
      const u = j / 10;
      const curl = (Math.sin(u * 7.2 - time * 3.1 + seed) * .02 + Math.sin(u * 13. + time * 2.7 + seed * .31) * .01) * w * u;
      const sway = Math.sin(time * 1.3 + seed) * w * .009 * u;
      const x = centre * w + curl + sway;
      const y = base - u * reach;
      const radius = width * w * Math.pow(1 - u, 1.15) * (.48 + Math.sin(u * 2.7) * .52)
        * (.84 + Math.sin(u * 16. - time * 4.8 + seed) * .16);
      left.push([x - radius, y]); right.push([x + radius, y]);
    }
    const gradient = ctx.createLinearGradient(0, base, 0, base - reach);
    if (core) {
      gradient.addColorStop(0, `rgba(255,203,77,${opacity * .6})`);
      gradient.addColorStop(.28, `rgba(255,151,29,${opacity})`);
      gradient.addColorStop(.64, `rgba(255,83,12,${opacity * .6})`);
      gradient.addColorStop(1, 'rgba(255,62,11,0)');
    } else {
      gradient.addColorStop(0, `rgba(232,43,19,${opacity * .3})`);
      gradient.addColorStop(.25, `rgba(246,72,14,${opacity * .9})`);
      gradient.addColorStop(.57, `rgba(240,47,15,${opacity})`);
      gradient.addColorStop(.85, `rgba(224,30,22,${opacity * .48})`);
      gradient.addColorStop(1, 'rgba(215,26,22,0)');
    }
    ctx.beginPath(); smoothPath(ctx, left.concat(right.reverse())); ctx.closePath();
    ctx.fillStyle = gradient; ctx.fill();
  }
  function paint(scene) {
    if (!scene.ctx || disposed) return;
    const {ctx, canvas, time, accent} = scene, w = canvas.width, h = canvas.height;
    try {
      ctx.clearRect(0, 0, w, h);
      // Source-over keeps reds and oranges rich against white. There is no
      // opaque background, additive blend, blur filter, or expensive shadow.
      ctx.globalCompositeOperation = 'source-over';
      const glow = ctx.createRadialGradient(w * .5, h * .77, 0, w * .5, h * .77, w * .45);
      glow.addColorStop(0, 'rgba(255,116,48,.12)');
      glow.addColorStop(.55, 'rgba(247,87,41,.045)');
      glow.addColorStop(1, 'rgba(246,77,35,0)');
      ctx.fillStyle = glow; ctx.fillRect(0, 0, w, h);
      const count = accent ? 7 : 12;
      for (let i = 0; i < count; i++) {
        const seed = i + 1;
        const centre = accent ? .5 + (seeded(seed) - .5) * .34
          : (i % 2 === 0 ? .25 : .75) + (seeded(seed) - .5) * .18;
        const height = (accent ? .55 : .43) + seeded(seed + 11) * .31;
        const width = (accent ? .047 : .032) + seeded(seed + 22) * .027;
        ribbon(scene, seed, centre, height, width, .44 + seeded(seed + 7) * .2);
        ribbon(scene, seed + .13, centre, height * .81, width * .44, .6 + seeded(seed + 2) * .2, true);
      }
      if (!accent) {
        for (let i = 0; i < 4; i++) ribbon(scene, 37 + i, .38 + i * .08, .77 + seeded(i + 62) * .07, .025, .28);
      }
      const sparks = accent ? 8 : 16;
      for (let i = 0; i < sparks; i++) {
        const seed = i + 17;
        const phase = (time * (.1 + seeded(seed + 2) * .11) + seeded(seed)) % 1;
        const spread = accent ? .5 : .76;
        const x = w * (.5 - spread / 2 + seeded(seed + 5) * spread + Math.sin(phase * 7 + seed) * .018);
        const y = h * (.91 - phase * .83);
        const alpha = Math.sin(phase * Math.PI) * (.35 + seeded(seed + 8) * .45);
        ctx.strokeStyle = `rgba(238,${Math.round(67 + seeded(seed + 6) * 55)},20,${alpha})`;
        ctx.lineWidth = Math.max(.7, w * .0017);
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w * .001, y + h * (.004 + seeded(seed + 12) * .005)); ctx.stroke();
      }
    } catch (_) {
      scene.ctx = null;
      scene.stage.classList.remove('fire-ready'); scene.stage.classList.add('fire-fallback');
    }
  }
  function resize(scene) {
    if (!scene.ctx || disposed) return;
    const rect = scene.stage.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const budget = scene.accent ? 55000 : small.matches ? 130000 : 230000;
    const scale = Math.min(devicePixelRatio || 1, 1.3, Math.sqrt(budget / (rect.width * rect.height)));
    const w = Math.max(1, Math.round(rect.width * scale)), h = Math.max(1, Math.round(rect.height * scale));
    if (scene.canvas.width !== w || scene.canvas.height !== h) {
      scene.canvas.width = w; scene.canvas.height = h; paint(scene);
    }
  }
  function active(scene) {
    return !disposed && !suspended && !document.hidden && !reduced.matches && scene.visible && !scene.settled && !!scene.ctx;
  }
  function schedule() {
    if (scenes.some(active)) { if (!frame) frame = requestAnimationFrame(tick); }
    else { cancelAnimationFrame(frame); frame = 0; }
  }
  function tick(now) {
    frame = 0;
    const interval = small.matches ? 1000 / 24 : 1000 / 30;
    for (const scene of scenes) {
      if (!active(scene)) { scene.last = null; continue; }
      if (scene.last !== null && now - scene.last < interval) continue;
      const dt = scene.last === null ? 0 : Math.min((now - scene.last) / 1000, duration - scene.elapsed);
      scene.elapsed += dt; scene.time += dt; scene.last = now;
      paint(scene);
      if (scene.elapsed >= duration) {
        scene.settled = true; scene.last = null; scene.stage.classList.add('fire-settled');
      }
    }
    schedule();
  }
  function enter(scene) {
    if (scene.visible) return;
    scene.visible = true; scene.elapsed = 0; scene.last = null;
    scene.settled = reduced.matches;
    scene.stage.classList.toggle('fire-settled', scene.settled);
    resize(scene); paint(scene); schedule();
  }
  function exit(scene) { scene.visible = false; scene.last = null; schedule(); }

  for (const stage of elements) {
    const canvas = stage.querySelector('.fire-canvas');
    if (!canvas) continue;
    canvas.setAttribute('aria-hidden', 'true');
    let ctx;
    try { ctx = canvas.getContext('2d', {alpha: true, desynchronized: true}); } catch (_) {}
    if (!ctx) { stage.classList.add('fire-fallback'); continue; }
    const scene = {stage, canvas, ctx, accent: stage.dataset.fireVariant === 'accent', visible: false,
      settled: reduced.matches, elapsed: 0, last: null, time: 9, resizeObserver: null, visibilityObserver: null};
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
        // Exit only after the whole visual leaves; a threshold wobble near the
        // viewport edge must not repeatedly restart the decorative sequence.
        if (!entry.isIntersecting || entry.intersectionRatio === 0) exit(scene);
        else if (entry.intersectionRatio >= .12) enter(scene);
      }, {threshold: [0, .12]});
      scene.visibilityObserver.observe(stage);
    } else {
      const rect = stage.getBoundingClientRect();
      if (rect.top < innerHeight && rect.bottom > 0) enter(scene);
    }
  }
  function onVisibility() { scenes.forEach(scene => { scene.last = null; }); schedule(); }
  function onMotionPreference() {
    for (const scene of scenes) {
      scene.stage.classList.toggle('fire-reduced', reduced.matches);
      scene.last = null;
      if (reduced.matches) { scene.settled = true; scene.stage.classList.add('fire-settled'); paint(scene); }
    }
    schedule();
  }
  function onResize() { scenes.forEach(resize); }
  function onPageShow() { suspended = false; onVisibility(); }
  function onPageHide(event) {
    if (event.persisted) { suspended = true; onVisibility(); return; }
    disposed = true; cancelAnimationFrame(frame); frame = 0;
    scenes.forEach(scene => { scene.resizeObserver?.disconnect(); scene.visibilityObserver?.disconnect(); });
    reduced.removeEventListener('change', onMotionPreference);
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('resize', onResize); window.removeEventListener('pageshow', onPageShow); window.removeEventListener('pagehide', onPageHide);
  }
  reduced.addEventListener('change', onMotionPreference);
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('resize', onResize, {passive: true});
  window.addEventListener('pageshow', onPageShow); window.addEventListener('pagehide', onPageHide);
})();
