/* Short native fire-film entrances. No canvas, infinite loop or hidden preload. */
(() => {
  'use strict';
  const hosts = [...document.querySelectorAll('.fire-film')];
  if (!hosts.length) return;
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const connection = typeof navigator === 'undefined' ? null : navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  const scenes = [], maximumDuration = 4.8, fadeDuration = .7;
  let frame = 0, disposed = false, suspended = false;
  const staticMode = () => motion.matches || !!connection?.saveData;
  function eligible(scene) {
    return !disposed && !suspended && !document.hidden && !staticMode()
      && scene.inView && !scene.failed && !scene.completed;
  }
  function active(scene) { return eligible(scene) && scene.playing && !!scene.video && !scene.video.paused; }
  function opacity(scene, value) {
    if (scene.video && scene.opacity !== value) {
      scene.opacity = value; scene.video.style.opacity = String(value);
    }
  }
  function schedule() {
    if (scenes.some(active)) { if (!frame) frame = requestAnimationFrame(tick); }
    else { cancelAnimationFrame(frame); frame = 0; }
  }
  function release(scene) {
    scene.playId++; scene.pending = false; scene.playing = false;
    const video = scene.video; scene.video = null;
    if (video) {
      scene.listeners.forEach(([event, listener]) => video.removeEventListener(event, listener));
      scene.listeners = [];
      video.pause(); video.removeAttribute('src'); video.load(); video.remove();
    }
    scene.host.classList.remove('is-playing', 'is-fading');
  }
  function finish(scene, failed = false) {
    opacity(scene, 0); scene.completed = true; scene.failed = failed; scene.departed = false;
    scene.host.classList.add('has-played');
    if (failed) scene.host.classList.add('is-unavailable');
    release(scene); schedule();
  }
  function update(scene) {
    const video = scene.video;
    if (!video) return;
    const end = Number.isFinite(video.duration) && video.duration > 0 ? Math.min(maximumDuration, video.duration) : maximumDuration;
    const remaining = end - video.currentTime;
    if (remaining <= .005) { finish(scene); return; }
    const fade = Math.min(fadeDuration, end);
    const t = Math.max(0, Math.min(1, remaining / fade));
    const entrance = Math.max(0, Math.min(1, video.currentTime / .35));
    const value = Math.round(t * t * (3 - 2 * t) * entrance * entrance * (3 - 2 * entrance) * 1000) / 1000;
    scene.host.classList.toggle('is-fading', remaining <= fade);
    opacity(scene, value);
  }
  function tick() {
    frame = 0;
    for (const scene of scenes) if (active(scene)) update(scene);
    schedule();
  }
  function createVideo(scene) {
    const video = document.createElement('video');
    video.className = 'fire-film-video'; video.muted = true; video.defaultMuted = true;
    video.playsInline = true; video.loop = false; video.controls = false; video.preload = 'none'; video.tabIndex = -1;
    video.disablePictureInPicture = true; video.disableRemotePlayback = true;
    video.setAttribute('playsinline', ''); video.setAttribute('muted', ''); video.setAttribute('aria-hidden', 'true');
    video.style.opacity = '0'; scene.opacity = 0; scene.video = video;
    const listen = (event, listener) => { video.addEventListener(event, listener); scene.listeners.push([event, listener]); };
    listen('playing', () => {
      if (scene.video !== video) return;
      if (!eligible(scene)) { video.pause(); return; }
      scene.playing = true; scene.host.classList.add('is-playing'); scene.host.classList.remove('has-played');
      update(scene); schedule();
    });
    const wait = () => {
      scene.playing = false; opacity(scene, 0); scene.host.classList.remove('is-playing', 'is-fading'); schedule();
    };
    listen('waiting', wait); listen('pause', wait);
    listen('ended', () => finish(scene)); listen('error', () => finish(scene, true));
    scene.host.appendChild(video);
    video.src = '/assets/fire-footage.mp4';
    return video;
  }
  function resume(scene) {
    if (!eligible(scene) || scene.pending || scene.playing) return;
    const video = scene.video || createVideo(scene), id = ++scene.playId;
    scene.pending = true;
    try {
      Promise.resolve(video.play()).then(() => {
        if (scene.video !== video || scene.playId !== id) return;
        scene.pending = false;
        if (!eligible(scene)) video.pause();
      }, () => { if (scene.video === video && scene.playId === id) finish(scene, true); });
    } catch (_) { finish(scene, true); }
  }
  function pause(scene) {
    scene.playId++; scene.pending = false; scene.playing = false;
    opacity(scene, 0); scene.host.classList.remove('is-playing', 'is-fading'); scene.video?.pause();
  }
  function visibility(scene, ratio) {
    scene.inView = ratio >= .2;
    if (ratio === 0) scene.departed = true;
    if (!scene.inView) { pause(scene); schedule(); return; }
    if (scene.completed && scene.departed && !scene.failed) {
      scene.completed = false; scene.departed = false;
      scene.host.classList.remove('has-played');
    }
    resume(scene);
  }
  for (const host of hosts) {
    const scene = {host, video: null, listeners: [], inView: false, departed: false, playing: false,
      pending: false, completed: false, failed: false, opacity: 0, playId: 0, observer: null};
    scenes.push(scene); host.classList.toggle('is-static', staticMode());
    if ('IntersectionObserver' in window) {
      scene.observer = new IntersectionObserver(entries => {
        const entry = entries[0]; visibility(scene, entry.isIntersecting ? entry.intersectionRatio : 0);
      }, {threshold: [0, .2]});
      scene.observer.observe(host);
    }
    // Old browsers keep the designed still. There is no eager autoplay fallback
    // that might download every decorative film outside the viewport.
  }
  function onVisibility() {
    scenes.forEach(scene => { if (document.hidden || suspended) pause(scene); else resume(scene); });
    schedule();
  }
  function onPreference() {
    for (const scene of scenes) {
      scene.host.classList.toggle('is-static', staticMode());
      if (staticMode()) { release(scene); scene.completed = false; }
      else resume(scene);
    }
    schedule();
  }
  function onPageShow() { suspended = false; onVisibility(); }
  function onPageHide(event) {
    if (event.persisted) { suspended = true; onVisibility(); return; }
    disposed = true; cancelAnimationFrame(frame); frame = 0;
    scenes.forEach(scene => { release(scene); scene.observer?.disconnect(); });
    motion.removeEventListener('change', onPreference); connection?.removeEventListener?.('change', onPreference);
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('pagehide', onPageHide); window.removeEventListener('pageshow', onPageShow);
  }
  motion.addEventListener('change', onPreference); connection?.addEventListener?.('change', onPreference);
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pagehide', onPageHide); window.addEventListener('pageshow', onPageShow);
})();
