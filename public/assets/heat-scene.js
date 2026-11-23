/* AB Firestop — one porcelain relief, raised from the surrounding wall.
   The original flame alpha supplies a signed-distance height field. */
(() => {
  'use strict';
  const stages = [...document.querySelectorAll('.heat-stage')];
  if (!stages.length) return;
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const mobile = matchMedia('(max-width: 800px)');
  const duration = 3.8, maskWidth = 256, maskHeight = 384, spread = 32;
  const scenes = [];
  let frame = 0, disposed = false, suspended = false;
  const vertex = `attribute vec2 aPosition; void main(){gl_Position=vec4(aPosition,0.0,1.0);}`;
  const fragment = `
precision highp float;
uniform vec2 uResolution;
uniform sampler2D uDistance;
uniform float uProgress;
const vec3 WALL=vec3(0.9607843,0.9607843,0.9529412);
const vec2 SIZE=vec2(1.2,1.8);
const float DEPTH=0.056;
float distanceAt(vec2 p){
  vec2 uv=(p-vec2(0.04,-0.025))/SIZE+0.5;
  if(uv.x<0.0||uv.x>1.0||uv.y<0.0||uv.y>1.0)return -0.15;
  uv.y=1.0-uv.y;
  return (texture2D(uDistance,uv).r-0.5)*64.0*(1.8/384.0);
}
float heightAt(vec2 p){return DEPTH*smoothstep(-0.001,0.04,distanceAt(p));}
vec3 normalAt(vec2 p){
  float e=0.0034;
  return normalize(vec3(heightAt(p-vec2(e,0.0))-heightAt(p+vec2(e,0.0)),
    heightAt(p-vec2(0.0,e))-heightAt(p+vec2(0.0,e)),2.0*e));
}
void main(){
  vec2 uv=gl_FragCoord.xy/uResolution;
  vec2 screen=(uv-0.5)*vec2(2.0*uResolution.x/uResolution.y,2.0);
  float ease=1.0-pow(1.0-uProgress,3.0);
  float angle=mix(0.32,0.055,ease);
  vec3 ray=normalize(vec3(-tan(angle),-0.07*(1.0-ease),-1.0));
  vec2 wall=screen*vec2(1.0/cos(angle),1.0);
  float sd=distanceAt(wall);
  if(sd< -0.105){gl_FragColor=vec4(WALL,1.0);return;}
  // Intersect a single raised surface. The sides and their parallax therefore
  // belong to the same wall geometry, rather than repeated shifted silhouettes.
  float z=DEPTH+0.002;
  float upper=z;
  vec2 hit=wall;
  for(int i=0;i<20;i++){
    vec2 p=wall+ray.xy/ray.z*z;
    if(z<=heightAt(p)){hit=p;break;}
    upper=z;z=max(0.0,z-(DEPTH+0.002)/19.0);hit=wall+ray.xy/ray.z*z;
  }
  float lower=z;
  for(int i=0;i<5;i++){
    float mid=(lower+upper)*0.5;
    vec2 p=wall+ray.xy/ray.z*mid;
    if(mid>heightAt(p))upper=mid;else lower=mid;
  }
  z=(lower+upper)*0.5;hit=wall+ray.xy/ray.z*z;
  vec3 normal=normalAt(hit);
  vec3 key=normalize(vec3(-0.65,0.82,1.35));
  float shadow=1.0;
  for(int i=1;i<=7;i++){
    float stepZ=float(i)*0.010;
    vec2 sampleP=hit+key.xy/key.z*stepZ;
    float obstruction=heightAt(sampleP)-z-stepZ;
    shadow=min(shadow,1.0-0.16*smoothstep(-0.008,0.008,obstruction));
  }
  float diffuse=max(dot(normal,key),0.0);
  float shade=1.0+(diffuse-key.z)*0.28;
  vec3 halfVector=normalize(key-ray);
  float broadSpec=pow(max(dot(normal,halfVector),0.0),24.0)-pow(max(halfVector.z,0.0),24.0);
  float seam=exp(-abs(distanceAt(hit))*230.0)*(1.0-smoothstep(0.003,0.02,z));
  vec3 colour=WALL*(shade*shadow-seam*0.015)+vec3(broadSpec*0.065);
  // A narrow warm grazing light crosses the bevel once. The final material is
  // neutral matte porcelain; there is no chrome, idle orbit, halo or fire image.
  float sweep=mix(-0.88,0.9,smoothstep(0.02,0.97,uProgress));
  float line=hit.x+hit.y*0.28-sweep;
  float band=exp(-line*line/0.0045);
  float envelope=pow(max(0.0,sin(uProgress*3.14159265)),0.8);
  float relief=smoothstep(-0.006,0.007,distanceAt(hit));
  float grazing=(0.26+0.74*(1.0-normal.z))*relief;
  colour*=vec3(1.0,1.0-band*envelope*grazing*0.48,1.0-band*envelope*grazing*0.67);
  colour+=vec3(0.025,0.006,0.001)*band*envelope*grazing;
  float edge=smoothstep(0.0,0.055,uv.x)*smoothstep(0.0,0.055,1.0-uv.x)
    *smoothstep(0.0,0.045,uv.y)*smoothstep(0.0,0.045,1.0-uv.y);
  gl_FragColor=vec4(mix(WALL,clamp(colour,0.0,1.0),edge),1.0);
}`;

  // Exact squared Euclidean distance transform, linear in the mask's area.
  // A small alpha mask is enough for a clean bevel; no high-resolution CPU mesh.
  function distanceTransform(binary, inside) {
    const size = Math.max(maskWidth, maskHeight), inf = 1e12;
    const f = new Float64Array(size), d = new Float64Array(size);
    const v = new Int32Array(size), boundaries = new Float64Array(size + 1);
    const result = new Float64Array(binary.length);
    function line(length) {
      let k = 0; v[0] = 0; boundaries[0] = -Infinity; boundaries[1] = Infinity;
      for (let q = 1; q < length; q++) {
        let s;
        do {
          const p = v[k]; s = ((f[q] + q * q) - (f[p] + p * p)) / (2 * (q - p));
          if (s <= boundaries[k]) k--; else break;
        } while (k >= 0);
        k++; v[k] = q; boundaries[k] = s; boundaries[k + 1] = Infinity;
      }
      k = 0;
      for (let q = 0; q < length; q++) {
        while (boundaries[k + 1] < q) k++;
        const delta = q - v[k]; d[q] = delta * delta + f[v[k]];
      }
    }
    for (let y = 0; y < maskHeight; y++) {
      for (let x = 0; x < maskWidth; x++) f[x] = binary[y * maskWidth + x] === inside ? 0 : inf;
      line(maskWidth);
      for (let x = 0; x < maskWidth; x++) result[y * maskWidth + x] = d[x];
    }
    for (let x = 0; x < maskWidth; x++) {
      for (let y = 0; y < maskHeight; y++) f[y] = result[y * maskWidth + x];
      line(maskHeight);
      for (let y = 0; y < maskHeight; y++) result[y * maskWidth + x] = d[y];
    }
    return result;
  }
  function makeDistance(image) {
    const mask = document.createElement('canvas'); mask.width = maskWidth; mask.height = maskHeight;
    const ctx = mask.getContext('2d', {willReadFrequently: true});
    if (!ctx) throw new Error('No alpha mask context');
    const inset = 10, scale = Math.min((maskWidth - inset * 2) / image.naturalWidth, (maskHeight - inset * 2) / image.naturalHeight);
    const w = image.naturalWidth * scale, h = image.naturalHeight * scale;
    ctx.drawImage(image, (maskWidth - w) / 2, (maskHeight - h) / 2, w, h);
    const source = ctx.getImageData(0, 0, maskWidth, maskHeight).data;
    const binary = new Uint8Array(maskWidth * maskHeight);
    for (let i = 0; i < binary.length; i++) binary[i] = source[i * 4 + 3] >= 128 ? 1 : 0;
    const toOutside = distanceTransform(binary, 0), toInside = distanceTransform(binary, 1);
    const encoded = new Uint8Array(binary.length * 4);
    for (let i = 0; i < binary.length; i++) {
      const sd = binary[i] ? Math.sqrt(toOutside[i]) - .5 : .5 - Math.sqrt(toInside[i]);
      const value = Math.round(Math.max(0, Math.min(1, .5 + sd / (spread * 2))) * 255);
      encoded[i * 4] = value; encoded[i * 4 + 1] = value; encoded[i * 4 + 2] = value; encoded[i * 4 + 3] = 255;
    }
    mask.width = mask.height = 1;
    return encoded;
  }
  function makeSoftwareField(data) {
    const max = Math.max, min = Math.min, round = Math.round, hypot = Math.hypot, pow = Math.pow, exp = Math.exp;
    const count = maskWidth * maskHeight, heights = new Float32Array(count);
    const base = new Float32Array(count), grazing = new Float32Array(count);
    const smooth = value => { const t = max(0, min(1, value)); return t * t * (3 - 2 * t); };
    const distance = i => (data[i * 4] / 255 - .5) * 64 * (1.8 / 384);
    for (let i = 0; i < count; i++) heights[i] = .056 * smooth((distance(i) + .001) / .041);
    const keyLength = hypot(-.65, .82, 1.35), keyX = -.65 / keyLength, keyY = .82 / keyLength, keyZ = 1.35 / keyLength;
    const halfLength = hypot(keyX + .055, keyY, keyZ + 1);
    const hx = (keyX + .055) / halfLength, hy = keyY / halfLength, hz = (keyZ + 1) / halfLength;
    const frontSpec = pow(hz, 24);
    for (let y = 0; y < maskHeight; y++) for (let x = 0; x < maskWidth; x++) {
      const i = y * maskWidth + x;
      const gx = heights[y * maskWidth + max(0, x - 1)] - heights[y * maskWidth + min(maskWidth - 1, x + 1)];
      const gy = heights[min(maskHeight - 1, y + 1) * maskWidth + x] - heights[max(0, y - 1) * maskWidth + x];
      const nz = 2 * 1.8 / maskHeight, length = hypot(gx, gy, nz);
      const nx = gx / length, ny = gy / length, normalZ = nz / length;
      let shadow = 1;
      for (let step = 1; step <= 7; step++) {
        const sx = round(x - .65 / 1.35 * step * .01 / 1.2 * maskWidth);
        const sy = round(y - .82 / 1.35 * step * .01 / 1.8 * maskHeight);
        if (sx < 0 || sx >= maskWidth || sy < 0 || sy >= maskHeight) continue;
        const obstruction = heights[sy * maskWidth + sx] - heights[i] - step * .01;
        shadow = min(shadow, 1 - .16 * smooth((obstruction + .008) / .016));
      }
      const diffuse = max(0, nx * keyX + ny * keyY + normalZ * keyZ);
      const spec = pow(max(0, nx * hx + ny * hy + normalZ * hz), 24) - frontSpec;
      const seam = exp(-Math.abs(distance(i)) * 230) * (1 - smooth((heights[i] - .003) / .017));
      base[i] = (1 + (diffuse - keyZ) * .28) * shadow - seam * .015 + spec * .065;
      grazing[i] = (.26 + .74 * (1 - normalZ)) * smooth((distance(i) + .006) / .013);
    }
    return {data, heights, base, grazing};
  }
  function drawSoftware(scene, progress) {
    const ctx = scene.context2D, field = scene.software;
    if (!ctx || !field) return;
    const w = scene.canvas.width, h = scene.canvas.height;
    const smooth = value => value <= 0 ? 0 : value >= 1 ? 1 : value * value * (3 - 2 * value);
    const exp = Math.exp;
    if (!scene.softwarePixels || scene.softwarePixels.width !== w || scene.softwarePixels.height !== h) {
      scene.softwarePixels = ctx.createImageData(w, h);
      const backing = new Uint8ClampedArray(w * h * 4);
      for (let i = 0; i < backing.length; i += 4) { backing[i] = backing[i + 1] = 245; backing[i + 2] = 243; backing[i + 3] = 255; }
      scene.softwareBacking = backing;
      scene.softwareEdgeX = Float32Array.from({length: w}, (_, x) => smooth(x / (w * .055)) * smooth((w - 1 - x) / (w * .055)));
      scene.softwareEdgeY = Float32Array.from({length: h}, (_, y) => smooth(y / (h * .045)) * smooth((h - 1 - y) / (h * .045)));
    }
    const pixels = scene.softwarePixels, out = pixels.data;
    out.set(scene.softwareBacking);
    const ease = 1 - Math.pow(1 - progress, 3), angle = .32 + (.055 - .32) * ease;
    const cosine = Math.cos(angle), slopeX = Math.tan(angle), slopeY = .07 * (1 - ease);
    const sweep = -.88 + 1.78 * smooth((progress - .02) / .95);
    const envelope = Math.pow(Math.max(0, Math.sin(progress * Math.PI)), .8);
    const sample = (x, y) => {
      const u = ((x - .04) / 1.2 + .5) * maskWidth;
      const v = (.5 - (y + .025) / 1.8) * maskHeight;
      if (u < 0 || u >= maskWidth || v < 0 || v >= maskHeight) return -1;
      return (v | 0) * maskWidth + (u | 0);
    };
    const {heights, base, grazing, data} = field;
    const bilinear = (values, u, v) => {
      const x = u | 0, y = v | 0, fx = u - x, fy = v - y, i = y * maskWidth + x;
      const a = values[i], b = values[i + 1], c = values[i + maskWidth], d = values[i + maskWidth + 1];
      return a + (b - a) * fx + (c - a + (a - b - c + d) * fx) * fy;
    };
    const heightAt = (x, y) => {
      const u = ((x - .04) / 1.2 + .5) * maskWidth - .5;
      const v = (.5 - (y + .025) / 1.8) * maskHeight - .5;
      if (u < 0 || u >= maskWidth - 1 || v < 0 || v >= maskHeight - 1) return 0;
      return bilinear(heights, u, v);
    };
    for (let py = 0; py < h; py++) {
      const wallY = (0.5 - py / h) * 2;
      if (wallY < -.95 || wallY > .94) continue;
      for (let px = 0; px < w; px++) {
        const wallX = (px / w - .5) * (2 * w / h) / cosine;
        const wallIndex = sample(wallX, wallY);
        if (wallIndex < 0 || data[wallIndex * 4] < 89) continue;
        // With this broad bevel the surface slope is bounded. Fixed-point
        // parallax converges without a costly full ray march in software.
        const signed = data[wallIndex * 4];
        let z = signed < 107 ? 0 : signed > 180 ? .056 : heights[wallIndex];
        if (signed >= 107 && signed <= 180) {
          for (let step = 0; step < 6; step++) z = heightAt(wallX + slopeX * z, wallY + slopeY * z);
        }
        const hitX = wallX + slopeX * z, hitY = wallY + slopeY * z;
        const textureX = ((hitX - .04) / 1.2 + .5) * maskWidth - .5;
        const textureY = (.5 - (hitY + .025) / 1.8) * maskHeight - .5;
        if (textureX < 0 || textureX >= maskWidth - 1 || textureY < 0 || textureY >= maskHeight - 1) continue;
        const line = hitX + hitY * .28 - sweep;
        const light = exp(-line * line / .0045) * envelope * bilinear(grazing, textureX, textureY);
        const edge = scene.softwareEdgeX[px] * scene.softwareEdgeY[py];
        const shade = bilinear(base, textureX, textureY), i = (py * w + px) * 4;
        out[i] = 245 + (245 * shade + light * 6.375 - 245) * edge;
        out[i + 1] = 245 + (245 * shade * (1 - light * .48) + light * 1.53 - 245) * edge;
        out[i + 2] = 243 + (243 * shade * (1 - light * .67) + light * .255 - 243) * edge;
      }
    }
    ctx.putImageData(pixels, 0, 0);
  }
  function classes(scene) {
    scene.stage.classList.toggle('heat-running', scene.running);
    scene.stage.classList.toggle('heat-settled', scene.settled);
    scene.stage.classList.toggle('heat-paused', document.hidden || suspended);
    scene.hero?.classList.toggle('heat-playing', scene.running);
  }
  function active(scene) {
    return !disposed && !suspended && !document.hidden && !motion.matches
      && scene.visible && scene.running && !scene.settled && (scene.ready || scene.unavailable);
  }
  function schedule() {
    if (scenes.some(active)) { if (!frame) frame = requestAnimationFrame(tick); }
    else { cancelAnimationFrame(frame); frame = 0; }
  }
  function draw(scene, progress = scene.elapsed / duration) {
    if (!scene.ready || disposed) return;
    if (scene.context2D) { drawSoftware(scene, Math.max(0, Math.min(1, progress))); return; }
    if (!scene.gl) return;
    const gl = scene.gl;
    gl.viewport(0, 0, scene.canvas.width, scene.canvas.height);
    gl.useProgram(scene.program); gl.bindBuffer(gl.ARRAY_BUFFER, scene.buffer);
    gl.enableVertexAttribArray(scene.position); gl.vertexAttribPointer(scene.position, 2, gl.FLOAT, false, 0, 0);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, scene.texture);
    gl.uniform1i(scene.uniforms.distance, 0);
    gl.uniform2f(scene.uniforms.resolution, scene.canvas.width, scene.canvas.height);
    gl.uniform1f(scene.uniforms.progress, Math.max(0, Math.min(1, progress)));
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }
  function resize(scene) {
    const rect = scene.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const budget = scene.context2D ? (mobile.matches ? 75000 : 165000) : (mobile.matches ? 190000 : 520000);
    const ratio = Math.min(devicePixelRatio || 1, 1.5, Math.sqrt(budget / (rect.width * rect.height)));
    const w = Math.max(1, Math.floor(rect.width * ratio)), h = Math.max(1, Math.floor(rect.height * ratio));
    if (scene.canvas.width !== w || scene.canvas.height !== h) {
      scene.canvas.width = w; scene.canvas.height = h; draw(scene, scene.settled ? 1 : scene.elapsed / duration);
    }
  }
  function cleanupGL(scene) {
    const gl = scene.gl;
    if (!gl) return;
    if (scene.texture) gl.deleteTexture(scene.texture);
    if (scene.buffer) gl.deleteBuffer(scene.buffer);
    if (scene.program) gl.deleteProgram(scene.program);
    scene.texture = scene.buffer = scene.program = null;
  }
  function unavailable(scene) {
    cleanupGL(scene); scene.gl = null; scene.ready = false;
    try {
      let context = scene.canvas.getContext('2d', {alpha: false});
      if (!context) {
        // A canvas that already owned WebGL cannot switch context type.
        const replacement = scene.canvas.cloneNode(false);
        scene.canvas.removeEventListener('webglcontextlost', scene.onContextLost);
        scene.canvas.replaceWith(replacement); scene.canvas = replacement;
        replacement.addEventListener('webglcontextlost', scene.onContextLost);
        context = replacement.getContext('2d', {alpha: false});
      }
      if (context) {
        scene.context2D = context; scene.unavailable = false;
        scene.stage.classList.add('heat-software');
        loadShape(scene); return;
      }
    } catch (_) {}
    scene.unavailable = true;
    scene.stage.classList.remove('heat-ready'); scene.stage.classList.add('heat-unavailable');
    if (scene.visible) begin(scene);
  }
  function installShape(scene, data) {
    if (disposed) return;
    scene.distanceData = data;
    if (scene.context2D) scene.software = makeSoftwareField(data);
    else {
      const gl = scene.gl;
      if (!gl) return;
      scene.texture = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, scene.texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, maskWidth, maskHeight, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
    }
    scene.ready = true; scene.stage.classList.add('heat-ready'); scene.stage.classList.remove('heat-unavailable');
    resize(scene); draw(scene, motion.matches || scene.settled ? 1 : scene.elapsed / duration); begin(scene);
  }
  function loadShape(scene) {
    if (scene.distanceData) { installShape(scene, scene.distanceData); return; }
    if (scene.image) { scene.image.onload = scene.image.onerror = null; }
    const image = new Image(); scene.image = image;
    image.onload = () => {
      if (disposed || scene.image !== image) return;
      try { installShape(scene, makeDistance(image)); }
      catch (_) {
        scene.ready = false; scene.unavailable = true;
        scene.stage.classList.remove('heat-ready'); scene.stage.classList.add('heat-unavailable'); begin(scene);
      }
      image.onload = image.onerror = null;
    };
    image.onerror = () => {
      if (disposed || scene.image !== image) return;
      scene.ready = false; scene.unavailable = true;
      scene.stage.classList.remove('heat-ready'); scene.stage.classList.add('heat-unavailable'); begin(scene);
    };
    image.src = '/assets/beeldmerk.png';
  }
  function begin(scene) {
    if (!scene.visible || (!scene.ready && !scene.unavailable) || disposed) return;
    scene.settled = motion.matches || scene.elapsed >= duration;
    scene.running = !scene.settled; scene.last = null;
    if (scene.settled) { scene.elapsed = duration; draw(scene, 1); }
    classes(scene); schedule();
  }
  function tick(now) {
    frame = 0;
    for (const scene of scenes) {
      if (!active(scene)) { scene.last = null; continue; }
      if (scene.last !== null && now - scene.last < (mobile.matches ? 1000 / 24 : 1000 / 30)) continue;
      const delta = scene.last === null ? 0 : (now - scene.last) / 1000;
      scene.elapsed = Math.min(duration, scene.elapsed + delta); scene.last = now;
      draw(scene);
      if (scene.elapsed >= duration) { scene.running = false; scene.settled = true; scene.last = null; classes(scene); }
    }
    schedule();
  }
  function enter(scene) {
    if (scene.visible) return;
    scene.visible = true; scene.elapsed = 0; scene.last = null; scene.settled = false;
    begin(scene);
  }
  function exit(scene) {
    scene.visible = false; scene.running = false; scene.settled = true; scene.last = null;
    classes(scene); schedule();
  }
  function compile(gl, type, source) {
    const shader = gl.createShader(type); gl.shaderSource(shader, source); gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) { gl.deleteShader(shader); throw new Error('Relief shader unavailable'); }
    return shader;
  }
  function initialize(scene) {
    let gl;
    try { gl = scene.canvas.getContext('webgl', {alpha: false, antialias: false, depth: false, stencil: false,
      powerPreference: 'low-power', preserveDrawingBuffer: true}); } catch (_) {}
    if (!gl) { unavailable(scene); return; }
    scene.gl = gl;
    try {
      const precision = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT);
      const vs = compile(gl, gl.VERTEX_SHADER, vertex);
      const fs = compile(gl, gl.FRAGMENT_SHADER, precision?.precision ? fragment : fragment.replace('precision highp float;', 'precision mediump float;'));
      const program = gl.createProgram(); scene.program = program;
      gl.attachShader(program, vs); gl.attachShader(program, fs); gl.linkProgram(program);
      gl.deleteShader(vs); gl.deleteShader(fs);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('Relief program unavailable');
      scene.position = gl.getAttribLocation(program, 'aPosition');
      scene.uniforms = {distance: gl.getUniformLocation(program, 'uDistance'), resolution: gl.getUniformLocation(program, 'uResolution'), progress: gl.getUniformLocation(program, 'uProgress')};
      scene.buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, scene.buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
      loadShape(scene);
    } catch (_) { unavailable(scene); }
  }
  for (const stage of stages) {
    const canvas = stage.querySelector('.heat-canvas');
    if (!canvas) continue;
    canvas.setAttribute('aria-hidden', 'true');
    const scene = {stage, canvas, hero: stage.closest('.new-hero'), gl: null, ready: false, unavailable: false,
      visible: false, running: false, settled: motion.matches, elapsed: 0, last: null, image: null,
      program: null, texture: null, buffer: null, resizeObserver: null, visibilityObserver: null};
    scenes.push(scene); classes(scene); resize(scene);
    scene.onContextLost = event => {
      event.preventDefault(); scene.gl = null; scene.ready = false; scene.last = null;
      unavailable(scene); classes(scene); schedule();
    };
    canvas.addEventListener('webglcontextlost', scene.onContextLost);
    initialize(scene);
    if ('ResizeObserver' in window) { scene.resizeObserver = new ResizeObserver(() => resize(scene)); scene.resizeObserver.observe(stage); }
    if ('IntersectionObserver' in window) {
      scene.visibilityObserver = new IntersectionObserver(entries => {
        const entry = entries[0];
        if (!entry.isIntersecting || entry.intersectionRatio === 0) exit(scene);
        else if (entry.intersectionRatio >= .12) enter(scene);
      }, {threshold: [0, .12]});
      scene.visibilityObserver.observe(stage);
    } else { const rect = stage.getBoundingClientRect(); if (rect.top < innerHeight && rect.bottom > 0) enter(scene); }
  }
  function onVisibility() { scenes.forEach(scene => { scene.last = null; classes(scene); }); schedule(); }
  function onMotion() {
    scenes.forEach(scene => {
      scene.elapsed = motion.matches ? duration : 0; scene.last = null;
      scene.settled = motion.matches; scene.running = false;
      if (motion.matches) { draw(scene, 1); classes(scene); } else begin(scene);
    });
    schedule();
  }
  function onResize() { scenes.forEach(resize); }
  function onPageShow() { suspended = false; onVisibility(); }
  function onPageHide(event) {
    if (event.persisted) { suspended = true; onVisibility(); return; }
    disposed = true; cancelAnimationFrame(frame); frame = 0;
    scenes.forEach(scene => {
      scene.running = false; scene.settled = true; classes(scene);
      scene.resizeObserver?.disconnect(); scene.visibilityObserver?.disconnect();
      scene.canvas.removeEventListener('webglcontextlost', scene.onContextLost);
      if (scene.image) { scene.image.onload = scene.image.onerror = null; scene.image.removeAttribute('src'); }
      cleanupGL(scene); scene.gl = null; scene.software = scene.distanceData = scene.softwarePixels = scene.softwareBacking = scene.softwareEdgeX = scene.softwareEdgeY = null;
    });
    motion.removeEventListener('change', onMotion); document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('resize', onResize); window.removeEventListener('pageshow', onPageShow); window.removeEventListener('pagehide', onPageHide);
  }
  motion.addEventListener('change', onMotion); document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('resize', onResize, {passive: true});
  window.addEventListener('pageshow', onPageShow); window.addEventListener('pagehide', onPageHide);
})();
