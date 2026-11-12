import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const GREEN = new THREE.Color('#76b900');
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const smooth = (t) => t * t * (3 - 2 * t);
const lerp = (a, b, t) => a + (b - a) * t;

function rng(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------- procedural textures ---------- */
function dieTextures(seed) {
  const r = rng(seed);
  const w = 768, h = 1280;
  const mk = () => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  const a = mk(), e = mk();
  const g = a.getContext('2d'), ge = e.getContext('2d');
  g.fillStyle = '#0b0d0b'; g.fillRect(0, 0, w, h);
  ge.fillStyle = '#000'; ge.fillRect(0, 0, w, h);

  const m = 34, cols = 6, rows = 10;
  const cw = (w - m * 2) / cols, ch = (h - m * 2) / rows;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const px = m + x * cw, py = m + y * ch;
      // L2 cache band through the middle
      if (y === 4 || y === 5) {
        g.fillStyle = '#16191a'; g.fillRect(px + 3, py + 3, cw - 6, ch - 6);
        for (let k = 0; k < 18; k++) {
          g.fillStyle = k % 2 ? '#1d2122' : '#121516';
          g.fillRect(px + 6, py + 6 + k * ((ch - 12) / 18), cw - 12, (ch - 12) / 36);
        }
        ge.fillStyle = 'rgba(118,185,0,0.10)'; ge.fillRect(px + 3, py + 3, cw - 6, ch - 6);
        continue;
      }
      const s = 18 + Math.floor(r() * 14);
      g.fillStyle = `rgb(${s},${s + 3},${s})`; g.fillRect(px + 4, py + 4, cw - 8, ch - 8);
      // tensor-core sub blocks
      for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
        const t = s + 8 + Math.floor(r() * 10);
        g.fillStyle = `rgb(${t},${t + 2},${t})`;
        g.fillRect(px + 10 + i * (cw - 20) / 2, py + 10 + j * (ch - 20) / 2, (cw - 28) / 2, (ch - 28) / 2);
      }
      ge.strokeStyle = 'rgba(118,185,0,0.45)'; ge.lineWidth = 2;
      ge.strokeRect(px + 4, py + 4, cw - 8, ch - 8);
      if (r() < 0.22) { ge.fillStyle = 'rgba(118,185,0,0.35)'; ge.fillRect(px + 10, py + 10, cw - 20, ch - 20); }
    }
  }
  // buses
  ge.fillStyle = 'rgba(160,230,40,0.9)';
  for (let k = 0; k < 3; k++) ge.fillRect(m, m + ch * (2 + k * 3) - 1, w - m * 2, 2);
  ge.fillRect(w / 2 - 1, m, 2, h - m * 2);
  // die edge seal ring
  g.strokeStyle = '#2a2f2c'; g.lineWidth = 8; g.strokeRect(8, 8, w - 16, h - 16);
  ge.strokeStyle = 'rgba(118,185,0,0.6)'; ge.lineWidth = 3; ge.strokeRect(14, 14, w - 28, h - 28);

  const map = new THREE.CanvasTexture(a); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 8;
  const emissiveMap = new THREE.CanvasTexture(e); emissiveMap.colorSpace = THREE.SRGBColorSpace;
  return { map, emissiveMap };
}

function substrateTexture() {
  const r = rng(11);
  const c = document.createElement('canvas'); c.width = c.height = 1024;
  const g = c.getContext('2d');
  g.fillStyle = '#0b120a'; g.fillRect(0, 0, 1024, 1024);
  g.strokeStyle = '#18270f'; g.lineWidth = 2;
  for (let i = 0; i < 160; i++) {
    let x = r() * 1024, y = r() * 1024;
    g.beginPath(); g.moveTo(x, y);
    for (let k = 0; k < 4; k++) {
      if (r() < 0.5) x += (r() - 0.5) * 300; else y += (r() - 0.5) * 300;
      g.lineTo(x, y);
    }
    g.stroke();
  }
  // edge pads
  g.fillStyle = '#6b5a2a';
  for (let i = 0; i < 48; i++) {
    const t = 40 + i * 19.5;
    g.fillRect(t, 14, 8, 14); g.fillRect(t, 996, 8, 14); g.fillRect(14, t, 14, 8); g.fillRect(996, t, 14, 8);
  }
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function hbmTexture() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 320;
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 256, 320);
  grd.addColorStop(0, '#3a3d3b'); grd.addColorStop(1, '#202322');
  g.fillStyle = grd; g.fillRect(0, 0, 256, 320);
  g.fillStyle = 'rgba(255,255,255,0.08)';
  g.font = '500 28px JetBrains Mono, monospace'; g.fillText('HBM3e', 28, 60);
  g.fillStyle = 'rgba(255,255,255,0.04)';
  for (let i = 0; i < 6; i++) g.fillRect(28, 100 + i * 30, 200, 2);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

/* ---------- point / line shaders ---------- */
const pointsVert = /* glsl */`
  attribute float aSize; attribute float aAlpha;
  varying float vAlpha; varying float vDist;
  uniform float uScale;
  void main(){
    vec4 mv = modelViewMatrix * vec4(position,1.0);
    vec4 wp = modelMatrix * vec4(position,1.0);
    vDist = length(wp.xz);
    vAlpha = aAlpha;
    gl_PointSize = aSize * uScale / -mv.z;
    gl_Position = projectionMatrix * mv;
  }`;
const pointsFrag = /* glsl */`
  uniform vec3 uColor; uniform float uOpacity; uniform float uRadius;
  varying float vAlpha; varying float vDist;
  void main(){
    float d = length(gl_PointCoord-0.5);
    float a = smoothstep(0.5,0.0,d);
    a *= vAlpha * uOpacity;
    a *= smoothstep(uRadius, uRadius-3.0, vDist);
    a *= 1.0 - smoothstep(14.0, 30.0, vDist);
    gl_FragColor = vec4(uColor * (0.6 + a*1.6), a);
  }`;

const traceVert = /* glsl */`
  varying float vDist;
  void main(){
    vec4 wp = modelMatrix * vec4(position,1.0);
    vDist = length(wp.xz);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }`;
const traceFrag = /* glsl */`
  uniform vec3 uColor; uniform float uOpacity; uniform float uRadius;
  varying float vDist;
  void main(){
    float a = uOpacity * smoothstep(uRadius, uRadius-2.5, vDist) * (1.0 - smoothstep(10.0, 28.0, vDist));
    float edge = smoothstep(uRadius-2.5, uRadius-0.3, vDist) * step(vDist, uRadius);
    gl_FragColor = vec4(uColor + edge*vec3(0.6,0.9,0.3), a + edge*0.6);
  }`;

/* ---------- keyframes for the whole stage, indexed by scroll progress ---------- */
const K = [
  { p: 0.00, cam: [0, 8.6, 11.6], tgt: [0, -0.5, 0],   rot: -0.55, ex: 0, wire: 0.0,  solid: 1,    sc: 1,     fac: 0, wave: 0, glow: 0.9 },
  { p: 0.10, cam: [0.5, 7.6, 10.2], tgt: [0, -0.2, 0], rot: -0.3,  ex: 0, wire: 0.05, solid: 1,    sc: 1,     fac: 0, wave: 0, glow: 1.0 },
  { p: 0.24, cam: [2.5, 2.5, 3.3], tgt: [0.75, 0.15, -0.25], rot: 0.12, ex: 0, wire: 0.15, solid: 1, sc: 1,  fac: 0, wave: 0, glow: 1.7 },
  { p: 0.31, cam: [2.0, 2.2, 2.9], tgt: [0.6, 0.15, -0.1], rot: 0.2, ex: 0, wire: 0.2,  solid: 1,    sc: 1,     fac: 0, wave: 0, glow: 1.8 },
  { p: 0.45, cam: [-7.2, 6.4, 8.6], tgt: [0, 0.7, 0],  rot: 0.8,   ex: 1, wire: 1,    solid: 0.1,  sc: 1,     fac: 0, wave: 0, glow: 1.2 },
  { p: 0.54, cam: [-7.6, 7.0, 8.0], tgt: [0, 0.7, 0],  rot: 0.95,  ex: 1, wire: 1,    solid: 0.1,  sc: 1,     fac: 0, wave: 0, glow: 1.2 },
  { p: 0.69, cam: [0, 31, 25],    tgt: [0, 0, 0],      rot: 0,     ex: 0, wire: 0.2,  solid: 1,    sc: 0.165, fac: 1, wave: 0, glow: 1.0 },
  { p: 0.76, cam: [0, 30, 23.5],  tgt: [0, 0, 0],      rot: 0,     ex: 0, wire: 0.2,  solid: 1,    sc: 0.165, fac: 1, wave: 0, glow: 1.0 },
  { p: 0.91, cam: [17, 5.6, 17],  tgt: [0, 1.3, 0],    rot: 0,     ex: 0, wire: 0.2,  solid: 1,    sc: 0.165, fac: 1, wave: 1, glow: 1.5 },
  { p: 1.00, cam: [19, 6.2, 13.5], tgt: [0, 1.5, 0],   rot: 0,     ex: 0, wire: 0.2,  solid: 1,    sc: 0.165, fac: 1, wave: 1, glow: 1.6 },
];
function sample(p) {
  let i = 0;
  while (i < K.length - 2 && p > K[i + 1].p) i++;
  const a = K[i], b = K[i + 1];
  const t = smooth(clamp((p - a.p) / (b.p - a.p)));
  const o = {};
  for (const k in a) {
    if (k === 'p') continue;
    o[k] = Array.isArray(a[k]) ? a[k].map((v, j) => lerp(v, b[k][j], t)) : lerp(a[k], b[k], t);
  }
  return o;
}

export function createScene(canvas, { reduced = false } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
  renderer.setPixelRatio(dpr);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#050605');
  scene.fog = new THREE.FogExp2('#050605', 0.026);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.45;

  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 200);

  scene.add(new THREE.AmbientLight(0xffffff, 0.12));
  const key = new THREE.DirectionalLight(0xffffff, 1.8); key.position.set(-6, 10, 6); scene.add(key);
  const rim = new THREE.PointLight(GREEN, 60, 40, 2); rim.position.set(5, 3, -6); scene.add(rim);

  /* ---------- the chip ---------- */
  const chip = new THREE.Group(); scene.add(chip);
  const wireMat = new THREE.LineBasicMaterial({ color: GREEN, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  const solidMats = [];
  const parts = [];
  const track = (m) => { m.transparent = true; solidMats.push(m); return m; };

  function addPart(geo, mat, pos, ey, delay, ex = 0) {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(pos);
    mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), wireMat));
    chip.add(mesh);
    parts.push({ mesh, x: pos.x, y: pos.y, ey, ex, delay });
    return mesh;
  }

  const side = track(new THREE.MeshStandardMaterial({ color: '#1a1d1b', metalness: 0.85, roughness: 0.32 }));
  const subTop = track(new THREE.MeshStandardMaterial({ map: substrateTexture(), metalness: 0.35, roughness: 0.6 }));
  const subSide = track(new THREE.MeshStandardMaterial({ color: '#0e150c', metalness: 0.3, roughness: 0.7 }));
  addPart(new THREE.BoxGeometry(6.2, 0.16, 6.2), [subSide, subSide, subTop, subSide, subSide, subSide], new THREE.Vector3(0, 0, 0), -1.0, 0.0);

  const inter = track(new THREE.MeshStandardMaterial({ color: '#1f2220', metalness: 0.92, roughness: 0.22 }));
  addPart(new THREE.BoxGeometry(5.2, 0.06, 3.8), inter, new THREE.Vector3(0, 0.11, 0), 0.25, 0.12);

  const dieMats = [];
  [-1, 1].forEach((s, i) => {
    const { map, emissiveMap } = dieTextures(3 + i * 17);
    const top = track(new THREE.MeshStandardMaterial({ map, emissiveMap, emissive: GREEN, emissiveIntensity: 1, metalness: 0.6, roughness: 0.28 }));
    dieMats.push(top);
    addPart(new THREE.BoxGeometry(1.8, 0.1, 3.0), [side, side, top, side, side, side], new THREE.Vector3(s * 0.97, 0.19, 0), 1.95, 0.3 + i * 0.06);
  });

  const hbmTop = track(new THREE.MeshStandardMaterial({ map: hbmTexture(), metalness: 0.8, roughness: 0.3 }));
  const hbmGeo = new THREE.BoxGeometry(0.58, 0.22, 0.74);
  [-1, 1].forEach((s) => {
    [-1.23, -0.41, 0.41, 1.23].forEach((z, j) => {
      addPart(hbmGeo, [side, side, hbmTop, side, side, side], new THREE.Vector3(s * 2.25, 0.25, z), 1.25, 0.45 + j * 0.05, s * 0.6);
    });
  });

  // capacitors around the substrate edge (ride with the substrate)
  const capGeo = new THREE.BoxGeometry(0.12, 0.06, 0.2);
  const capMat = track(new THREE.MeshStandardMaterial({ color: '#8a6e33', metalness: 1, roughness: 0.35 }));
  const caps = new THREE.InstancedMesh(capGeo, capMat, 40);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < 40; i++) {
    const sideI = i % 4, t = -2.6 + Math.floor(i / 4) * 0.58;
    const pos = [[t, 2.85], [t, -2.85], [2.85, t], [-2.85, t]][sideI];
    dummy.position.set(pos[0], 0.11, pos[1]);
    dummy.rotation.y = sideI > 1 ? Math.PI / 2 : 0;
    dummy.updateMatrix(); caps.setMatrixAt(i, dummy.matrix);
  }
  parts[0].mesh.add(caps);

  // scan line that sweeps the dies in blueprint mode
  const scanMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uScan: { value: 0 }, uOpacity: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);} `,
    fragmentShader: `uniform float uScan; uniform float uOpacity; varying vec2 vUv;
      void main(){ float d=abs(vUv.x-uScan); float a=smoothstep(0.03,0.0,d)+smoothstep(0.25,0.0,d)*0.25;
        float grid = step(0.97, fract(vUv.x*24.0)) + step(0.97, fract(vUv.y*18.0));
        a += grid*0.12; gl_FragColor=vec4(vec3(0.46,0.73,0.0)*1.6, a*uOpacity);} `,
  });
  const scan = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 3.4), scanMat);
  scan.rotation.x = -Math.PI / 2; scan.position.y = 2.15;
  chip.add(scan);

  /* ---------- circuit traces + data pulses on the floor ---------- */
  const R = rng(7);
  const traces = [];
  const linePos = [];
  for (let i = 0; i < 150; i++) {
    const s = i % 4, along = (R() * 2 - 1) * 2.8;
    let p = [[3.2, along], [-3.2, along], [along, 3.2], [along, -3.2]][s];
    let dir = [[1, 0], [-1, 0], [0, 1], [0, -1]][s];
    const base = dir.slice();
    const pts = [new THREE.Vector3(p[0], -0.1, p[1])];
    let diag = false;
    for (let k = 0; k < 6; k++) {
      const step = 0.8 + R() * 3.5;
      p = [p[0] + dir[0] * step, p[1] + dir[1] * step];
      pts.push(new THREE.Vector3(p[0], -0.1, p[1]));
      if (diag) { dir = base.slice(); diag = false; }
      else if (R() < 0.55) {
        const turn = R() < 0.5 ? 1 : -1;
        const perp = [-base[1] * turn, base[0] * turn];
        dir = [(base[0] + perp[0]) * Math.SQRT1_2, (base[1] + perp[1]) * Math.SQRT1_2];
        diag = true;
      }
    }
    const cum = [0];
    for (let k = 1; k < pts.length; k++) {
      cum.push(cum[k - 1] + pts[k].distanceTo(pts[k - 1]));
      linePos.push(pts[k - 1].x, pts[k - 1].y, pts[k - 1].z, pts[k].x, pts[k].y, pts[k].z);
    }
    traces.push({ pts, cum, total: cum[cum.length - 1] });
  }
  const traceGeo = new THREE.BufferGeometry();
  traceGeo.setAttribute('position', new THREE.Float32BufferAttribute(linePos, 3));
  const traceMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uColor: { value: new THREE.Color('#2e5410') }, uOpacity: { value: 1 }, uRadius: { value: 0 } },
    vertexShader: traceVert, fragmentShader: traceFrag,
  });
  const traceLines = new THREE.LineSegments(traceGeo, traceMat);
  scene.add(traceLines);

  const PN = reduced ? 80 : 280;
  const pulses = [];
  const pPos = new Float32Array(PN * 3), pSize = new Float32Array(PN), pAlpha = new Float32Array(PN);
  for (let i = 0; i < PN; i++) {
    pulses.push({ tr: Math.floor(R() * traces.length), t: R(), v: 0.08 + R() * 0.22, inward: R() < 0.5 });
    pSize[i] = 2.2 + R() * 3.6; pAlpha[i] = 0.45 + R() * 0.55;
  }
  const pulseGeo = new THREE.BufferGeometry();
  pulseGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  pulseGeo.setAttribute('aSize', new THREE.BufferAttribute(pSize, 1));
  pulseGeo.setAttribute('aAlpha', new THREE.BufferAttribute(pAlpha, 1));
  const pulseMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uColor: { value: new THREE.Color('#9be22d') }, uOpacity: { value: 1 }, uRadius: { value: 0 }, uScale: { value: 60 * dpr } },
    vertexShader: pointsVert, fragmentShader: pointsFrag,
  });
  const pulsePts = new THREE.Points(pulseGeo, pulseMat);
  scene.add(pulsePts);

  // faint floor grid
  const grid = new THREE.GridHelper(80, 80, '#0f170c', '#0c120a');
  grid.position.y = -0.12; scene.add(grid);

  /* ---------- the AI factory: 32 x 32 instanced GPUs ---------- */
  const N = 32, S = 1.3;
  const fBodyMat = new THREE.MeshStandardMaterial({ color: '#141814', metalness: 0.7, roughness: 0.35 });
  const fTopMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const fBody = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.1, 1), fBodyMat, N * N);
  const fTop = new THREE.InstancedMesh(new THREE.BoxGeometry(0.62, 0.03, 0.5), fTopMat, N * N);
  const cells = [];
  const cR = rng(5);
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    const x = (i - 16) * S, z = (j - 16) * S;
    const d = Math.hypot(i - 16, j - 16);
    cells.push({ x, z, d, b: 0.12 + Math.pow(cR(), 3) * 0.9, ph: cR() * 6.28, hero: i === 16 && j === 16 });
  }
  const maxD = Math.hypot(16, 16);
  const col = new THREE.Color();
  for (let k = 0; k < cells.length; k++) fTop.setColorAt(k, col.setRGB(0, 0, 0));
  fBody.count = fTop.count = cells.length;
  scene.add(fBody, fTop);

  // tokens rising off the field
  const TN = reduced ? 150 : 600;
  const tPos = new Float32Array(TN * 3), tSize = new Float32Array(TN), tAlpha = new Float32Array(TN);
  const tokens = [];
  for (let i = 0; i < TN; i++) {
    const c = cells[Math.floor(cR() * cells.length)];
    tokens.push({ x: c.x + (cR() - 0.5) * 0.6, z: c.z + (cR() - 0.5) * 0.6, y: cR() * 8, v: 0.6 + cR() * 1.6 });
    tSize[i] = 1.6 + cR() * 3.2; tAlpha[i] = 0.25 + cR() * 0.6;
  }
  const tokGeo = new THREE.BufferGeometry();
  tokGeo.setAttribute('position', new THREE.BufferAttribute(tPos, 3));
  tokGeo.setAttribute('aSize', new THREE.BufferAttribute(tSize, 1));
  tokGeo.setAttribute('aAlpha', new THREE.BufferAttribute(tAlpha, 1));
  const tokMat = pulseMat.clone();
  tokMat.uniforms = { uColor: { value: new THREE.Color('#b6ff4a') }, uOpacity: { value: 0 }, uRadius: { value: 99 }, uScale: { value: 60 * dpr } };
  const tokPts = new THREE.Points(tokGeo, tokMat);
  scene.add(tokPts);

  /* ---------- post ---------- */
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.6, 0.5, 0.42);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  /* ---------- state ---------- */
  let progress = 0, intro = 0, active = true;
  const pointer = { x: 0, y: 0, sx: 0, sy: 0 };
  const cur = sample(0);
  const camPos = new THREE.Vector3(...cur.cam), camTgt = new THREE.Vector3(...cur.tgt);
  const api = { count: 1 };

  let lastW = 0, lastH = 0;
  function resize() {
    const w = canvas.clientWidth || window.innerWidth, h = canvas.clientHeight || window.innerHeight;
    if (!w || !h) return;
    lastW = w; lastH = h;
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    bloom.setSize(w * dpr, h * dpr);
    camera.aspect = w / h;
    camera.fov = w / h < 0.8 ? 50 : 35;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  const clock = new THREE.Clock();
  function frame() {
    if (!active) return;
    if (canvas.clientWidth !== lastW || canvas.clientHeight !== lastH) resize();
    if (!lastW) return;
    const dt = Math.min(clock.getDelta(), 0.05);
    const time = clock.elapsedTime;
    const k = sample(progress);
    const f = 1 - Math.exp(-dt * 4.5);
    for (const key in k) {
      if (Array.isArray(k[key])) cur[key] = cur[key].map((v, i) => lerp(v, k[key][i], f));
      else cur[key] = lerp(cur[key], k[key], f);
    }
    pointer.sx = lerp(pointer.sx, pointer.x, f);
    pointer.sy = lerp(pointer.sy, pointer.y, f);

    const introE = 1 - Math.pow(1 - intro, 3);

    // camera
    const heroFloat = (1 - clamp(progress / 0.1)) * 0.35;
    camPos.set(cur.cam[0] + pointer.sx * 0.9, cur.cam[1] - pointer.sy * 0.6 + (1 - introE) * 6, cur.cam[2] + (1 - introE) * 5);
    camTgt.set(cur.tgt[0], cur.tgt[1] + Math.sin(time * 0.6) * heroFloat * 0.2, cur.tgt[2]);
    camera.position.copy(camPos);
    camera.lookAt(camTgt);

    // chip transform
    chip.rotation.y = cur.rot + Math.sin(time * 0.4) * 0.06 * heroFloat * 3 + (1 - introE) * -0.8;
    chip.scale.setScalar(cur.sc);
    chip.position.y = Math.sin(time * 0.8) * 0.06 * heroFloat * 3;
    for (const pt of parts) {
      const drop = 1 - smooth(clamp(intro * 1.7 - pt.delay));
      const ex = smooth(cur.ex);
      pt.mesh.position.y = lerp(pt.y, pt.ey, ex) + drop * 7;
      pt.mesh.position.x = pt.x + pt.ex * ex;
      pt.mesh.visible = drop < 0.999;
    }
    wireMat.opacity = clamp(cur.wire) * 0.9 + (1 - introE) * 0.6;
    for (const m of solidMats) {
      m.opacity = cur.solid;
      m.depthWrite = cur.solid > 0.98;
    }
    const flick = intro < 1 ? (Math.sin(time * 40) > 0 ? 1 : 0.4) * introE : 1;
    for (const m of dieMats) m.emissiveIntensity = (0.55 + cur.glow * 0.7 + Math.sin(time * 2) * 0.12) * flick;
    scanMat.uniforms.uScan.value = (time * 0.35) % 1.2 - 0.1;
    scanMat.uniforms.uOpacity.value = smooth(clamp(cur.ex)) * (1 - clamp(cur.fac * 3)) * 0.45;

    // traces + pulses
    const radius = introE * 32;
    traceMat.uniforms.uRadius.value = radius;
    pulseMat.uniforms.uRadius.value = radius;
    const fadeFloor = 1 - clamp(cur.fac * 1.4);
    traceMat.uniforms.uOpacity.value = 0.9 * fadeFloor + 0.15;
    pulseMat.uniforms.uOpacity.value = fadeFloor;
    for (let i = 0; i < PN; i++) {
      const pu = pulses[i];
      pu.t += (pu.v * dt) * (pu.inward ? -1 : 1) * (reduced ? 0.3 : 1);
      if (pu.t > 1) pu.t -= 1; if (pu.t < 0) pu.t += 1;
      const tr = traces[pu.tr];
      const L = pu.t * tr.total;
      let s = 1; while (s < tr.cum.length - 1 && tr.cum[s] < L) s++;
      const a = tr.pts[s - 1], b = tr.pts[s];
      const u = (L - tr.cum[s - 1]) / (tr.cum[s] - tr.cum[s - 1] || 1);
      pPos[i * 3] = lerp(a.x, b.x, u); pPos[i * 3 + 1] = -0.06; pPos[i * 3 + 2] = lerp(a.z, b.z, u);
    }
    pulseGeo.attributes.position.needsUpdate = true;
    grid.visible = true;

    // factory field
    const fac = cur.fac, wave = cur.wave;
    let visible = 1;
    const showField = fac > 0.002;
    fBody.visible = fTop.visible = showField;
    if (showField) {
      for (let n = 0; n < cells.length; n++) {
        const c = cells[n];
        let s = c.hero ? 0 : smooth(clamp(fac * (maxD + 3) - c.d * 0.95));
        if (s > 0.5) visible++;
        const y = wave * (Math.sin(c.d * 0.55 - time * 1.8) * 0.55 + 0.55);
        dummy.position.set(c.x, y + (1 - s) * -0.4, c.z);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.setScalar(Math.max(s, 0.0001));
        dummy.updateMatrix();
        fBody.setMatrixAt(n, dummy.matrix);
        dummy.position.y += 0.065;
        dummy.updateMatrix();
        fTop.setMatrixAt(n, dummy.matrix);
        const pulse = 0.5 + 0.5 * Math.sin(time * 1.5 + c.ph);
        const wv = wave * Math.max(0, Math.sin(c.d * 0.55 - time * 1.8));
        const br = (c.b * (0.55 + 0.35 * pulse) * (1 - wave * 0.35) + wv * wv * 0.75) * s;
        fTop.setColorAt(n, col.setRGB(0.46 * br, 0.73 * br, 0.0 + 0.05 * br));
      }
      fBody.instanceMatrix.needsUpdate = true;
      fTop.instanceMatrix.needsUpdate = true;
      fTop.instanceColor.needsUpdate = true;
    }
    api.count = showField ? Math.min(visible, N * N) : 1;
    // hero chip rides the wave at the centre
    chip.position.y += wave * (Math.sin(-time * 1.8) * 0.55 + 0.55);

    // tokens
    tokMat.uniforms.uOpacity.value = wave * 0.7;
    tokPts.visible = wave > 0.01;
    if (tokPts.visible) {
      for (let i = 0; i < TN; i++) {
        const t = tokens[i];
        t.y += t.v * dt * (reduced ? 0.3 : 1);
        if (t.y > 9) t.y = 0;
        tPos[i * 3] = t.x; tPos[i * 3 + 1] = t.y + 0.4; tPos[i * 3 + 2] = t.z;
      }
      tokGeo.attributes.position.needsUpdate = true;
    }

    bloom.strength = 0.32 + cur.glow * 0.22 - cur.wave * 0.12;
    rim.intensity = 40 + cur.glow * 30;
    composer.render();
  }
  renderer.setAnimationLoop(frame);

  return Object.assign(api, {
    setProgress(p) { progress = clamp(p); },
    setIntro(v) { intro = clamp(v); },
    setPointer(x, y) { pointer.x = x; pointer.y = y; },
    setActive(v) {
      if (v === active) return;
      active = v;
      if (v) clock.getDelta();
    },
    renderer,
  });
}
