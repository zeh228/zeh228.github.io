import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

/* ============================================================
   雪原孤亭 · 极寒之境
   风雪交加的 3D 虚拟空间:暴雪粒子 / 风痕 / 地雾 / 闪电 / 远山
   ============================================================ */

// ---------- 基础 ----------
const container = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9fa9b4);
scene.fog = new THREE.FogExp2(0x9fa9b4, 0.008);

const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 1500);
camera.position.set(26, 10, 34);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 4, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.minDistance = 10;
controls.maxDistance = 90;
controls.maxPolarAngle = 1.53;
controls.minPolarAngle = 0.15;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.45;
controls.addEventListener('start', () => (controls.autoRotate = false));

// ---------- 灯光 ----------
const hemi = new THREE.HemisphereLight(0xaeb8c4, 0x5f6875, 0.95);
scene.add(hemi);

const sun = new THREE.DirectionalLight(0xe8edf4, 1.35);
sun.position.set(45, 80, 25);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -30;
sun.shadow.camera.right = 30;
sun.shadow.camera.top = 30;
sun.shadow.camera.bottom = -30;
sun.shadow.camera.far = 220;
sun.shadow.bias = -0.0005;
scene.add(sun);

// ---------- 天空穹顶(渐变) ----------
const skyMat = new THREE.ShaderMaterial({
  side: THREE.BackSide,
  depthWrite: false,
  fog: false,
  uniforms: {
    top:    { value: new THREE.Color(0x5b6572) },
    bottom: { value: new THREE.Color(0xa9b3bf) },
  },
  vertexShader: /* glsl */`
    varying vec3 vPos;
    void main() {
      vPos = position;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */`
    uniform vec3 top; uniform vec3 bottom;
    varying vec3 vPos;
    void main() {
      float h = normalize(vPos).y;
      float t = pow(max(h, 0.0), 0.65);
      gl_FragColor = vec4(mix(bottom, top, t), 1.0);
    }`,
});
scene.add(new THREE.Mesh(new THREE.SphereGeometry(700, 32, 16), skyMat));

// ---------- 噪声工具 ----------
function hash2(x, y) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
const sstep = (t) => t * t * (3 - 2 * t);
function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const a = hash2(xi, yi), b = hash2(xi + 1, yi);
  const c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
  const u = sstep(xf), v = sstep(yf);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, y, oct = 4) {
  let v = 0, amp = 0.5, f = 1;
  for (let i = 0; i < oct; i++) { v += amp * vnoise(x * f, y * f); amp *= 0.5; f *= 2.1; }
  return v;
}
// 与地形生成共用的高度函数(供摆放岩石/树木取样)
function terrainHeight(x, z) {
  const d = Math.hypot(x, z);
  let h = fbm(x * 0.02 + 10, z * 0.02 + 10, 4) * 6 + fbm(x * 0.08, z * 0.08, 3) * 1.2;
  h *= THREE.MathUtils.smoothstep(d, 6, 30);            // 亭子周围压平
  h += THREE.MathUtils.smoothstep(d, 120, 240) * 25 * (0.5 + fbm(x * 0.01, z * 0.01, 3));
  return h - 0.15;
}

// ---------- 雪原地形 ----------
{
  const geo = new THREE.PlaneGeometry(500, 500, 200, 200);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    pos.setY(i, terrainHeight(pos.getX(i), pos.getZ(i)));
  }
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ color: 0xe6ebf1, roughness: 0.96, metalness: 0 });
  const ground = new THREE.Mesh(geo, mat);
  ground.receiveShadow = true;
  scene.add(ground);
}

// ---------- 远山 ----------
{
  const mat = new THREE.MeshStandardMaterial({ color: 0x9aa4b0, roughness: 1, flatShading: true });
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + hash2(i, 7) * 0.5;
    const r = 290 + hash2(i, 3) * 130;
    const w = 55 + hash2(i, 11) * 85;
    const h = 38 + hash2(i, 17) * 62;
    const g = new THREE.ConeGeometry(w, h, 7, 3);
    const p = g.attributes.position;
    for (let j = 0; j < p.count; j++) {
      const nx = p.getX(j), nz = p.getZ(j);
      const n = fbm(nx * 0.05 + i * 9, nz * 0.05, 3) - 0.5;
      p.setX(j, nx + n * w * 0.25);
      p.setZ(j, nz + n * w * 0.25);
    }
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, mat);
    m.position.set(Math.cos(a) * r, h / 2 - 6, Math.sin(a) * r);
    m.rotation.y = hash2(i, 23) * Math.PI;
    scene.add(m);
  }
}

// ---------- 乱石 & 枯灌木 ----------
{
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x6e7883, roughness: 1, flatShading: true });
  const baseRock = new THREE.IcosahedronGeometry(1, 1);
  for (let i = 0; i < 48; i++) {
    const a = hash2(i, 31) * Math.PI * 2;
    const r = 9 + Math.pow(hash2(i, 37), 0.7) * 130;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const g = baseRock.clone();
    const p = g.attributes.position;
    for (let j = 0; j < p.count; j++) {
      const s = 0.7 + hash2(j * 3.1, i * 7.7) * 0.6;
      p.setXYZ(j, p.getX(j) * s, p.getY(j) * s * 0.75, p.getZ(j) * s);
    }
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, rockMat);
    const sc = 0.35 + hash2(i, 41) * 1.6;
    m.scale.setScalar(sc);
    m.position.set(x, terrainHeight(x, z) + sc * 0.25, z);
    m.rotation.set(hash2(i, 43) * 3, hash2(i, 47) * 3, hash2(i, 53) * 3);
    m.castShadow = m.receiveShadow = true;
    scene.add(m);
  }
  const bushMat = new THREE.MeshStandardMaterial({ color: 0x3d434a, roughness: 1, flatShading: true });
  for (let i = 0; i < 10; i++) {
    const a = hash2(i, 61) * Math.PI * 2;
    const r = 12 + hash2(i, 67) * 70;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.6 + hash2(i, 71) * 0.5, 0), bushMat);
    m.scale.y = 0.45;
    m.position.set(x, terrainHeight(x, z) + 0.15, z);
    m.castShadow = true;
    scene.add(m);
  }
}

// ============================================================
//  中式重檐六角亭
// ============================================================
const pavilion = new THREE.Group();
{
  const wood  = new THREE.MeshStandardMaterial({ color: 0x3f2a20, roughness: 0.82 });
  const tile  = new THREE.MeshStandardMaterial({ color: 0x30353c, roughness: 0.9, side: THREE.DoubleSide });
  const stone = new THREE.MeshStandardMaterial({ color: 0x969ea8, roughness: 1 });
  const snowM = new THREE.MeshStandardMaterial({ color: 0xf3f6f9, roughness: 0.92 });

  const R = 2.6;               // 檐柱半径
  const A0 = 0;                // 柱位起始角
  const colAngle = (i) => A0 + (i * Math.PI) / 3;

  // --- 石台基 ---
  const base = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 3.95, 0.8, 6), stone);
  base.position.y = 0.3;
  const baseSnow = new THREE.Mesh(new THREE.CylinderGeometry(3.62, 3.62, 0.07, 6), snowM);
  baseSnow.position.y = 0.73;
  pavilion.add(base, baseSnow);

  // --- 台阶(朝 30° 方向) ---
  const stepDir = Math.PI / 6;
  [0.525, 0.35, 0.175].forEach((top, i) => {
    const h = top + 0.18;
    const s = new THREE.Mesh(new THREE.BoxGeometry(1.9, h, 0.5), stone);
    const rr = 3.85 + i * 0.46;
    s.position.set(Math.cos(stepDir) * rr, top - h / 2, Math.sin(stepDir) * rr);
    s.rotation.y = Math.PI / 2 - stepDir;
    pavilion.add(s);
  });

  // --- 檐柱 ---
  for (let i = 0; i < 6; i++) {
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 3.2, 10), wood);
    c.position.set(Math.cos(colAngle(i)) * R, 0.7 + 1.6, Math.sin(colAngle(i)) * R);
    pavilion.add(c);
  }

  // --- 栏杆(留出台阶一侧) ---
  for (let i = 0; i < 6; i++) {
    const mid = colAngle(i) + Math.PI / 6;
    if (Math.abs(THREE.MathUtils.euclideanModulo(mid - stepDir + Math.PI, Math.PI * 2) - Math.PI) < 0.3) continue;
    const panel = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.5, 0.07), wood);
    const rr = R * Math.cos(Math.PI / 6);
    panel.position.set(Math.cos(mid) * rr, 1.05, Math.sin(mid) * rr);
    panel.rotation.y = Math.PI / 2 - mid;
    pavilion.add(panel);
    // 栏杆顶扶手
    const rail = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.09, 0.12), wood);
    rail.position.set(Math.cos(mid) * rr, 1.34, Math.sin(mid) * rr);
    rail.rotation.y = Math.PI / 2 - mid;
    pavilion.add(rail);
  }

  // --- 檐枋环 + 柱头斗拱 ---
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(2.78, 2.78, 0.3, 6), wood);
  beam.position.y = 4.0;
  pavilion.add(beam);
  for (let i = 0; i < 6; i++) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.28, 0.55), wood);
    b.position.set(Math.cos(colAngle(i)) * R, 4.28, Math.sin(colAngle(i)) * R);
    pavilion.add(b);
  }

  // --- 屋面(下檐 + 上檐,Lathe 曲线带翘角) ---
  function roofGeo(radius, height, rimLift) {
    const pts = [];
    const n = 10;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const r = Math.max(t * radius, 0.001);
      const y = height * Math.pow(1 - t, 1.55) + (t > 0.8 ? ((t - 0.8) / 0.2) * rimLift : 0);
      pts.push(new THREE.Vector2(r, y));
    }
    return new THREE.LatheGeometry(pts, 6);
  }
  // 顶棚(挡住屋檐内侧)
  const ceiling = new THREE.Mesh(new THREE.CylinderGeometry(2.8, 2.8, 0.12, 6), wood);
  ceiling.position.y = 4.38;
  pavilion.add(ceiling);

  const lowerRoof = new THREE.Mesh(roofGeo(3.95, 1.5, 0.38), tile);
  lowerRoof.position.y = 4.42;
  const lowerSnow = new THREE.Mesh(roofGeo(3.95, 1.5, 0.38), snowM);
  lowerSnow.scale.set(1.012, 1, 1.012);
  lowerSnow.position.y = 4.5;
  pavilion.add(lowerRoof, lowerSnow);

  // 中层鼓座
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(1.55, 1.55, 0.85, 6), wood);
  drum.position.y = 5.72;
  pavilion.add(drum);

  const upperRoof = new THREE.Mesh(roofGeo(2.5, 1.15, 0.3), tile);
  upperRoof.position.y = 6.1;
  const upperSnow = new THREE.Mesh(roofGeo(2.5, 1.15, 0.3), snowM);
  upperSnow.scale.set(1.012, 1, 1.012);
  upperSnow.position.y = 6.18;
  pavilion.add(upperRoof, upperSnow);

  // --- 宝顶 ---
  const finial = new THREE.Group();
  const f1 = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.26, 0.22, 6), tile);
  const f2 = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), tile);
  const f3 = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.55, 8), tile);
  f1.position.y = 0.1; f2.position.y = 0.42; f3.position.y = 0.75;
  finial.add(f1, f2, f3);
  finial.position.y = 7.18;
  pavilion.add(finial);

  // --- 亭内暖灯(风雪中的一点人气) ---
  const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.6, 6), wood);
  cord.position.y = 3.95;
  const lantern = new THREE.Mesh(
    new THREE.SphereGeometry(0.24, 14, 12),
    new THREE.MeshStandardMaterial({ color: 0xffc78a, emissive: 0xff9d45, emissiveIntensity: 2.2 })
  );
  lantern.position.y = 3.55;
  const glow = new THREE.PointLight(0xffa257, 26, 26, 2);
  glow.position.y = 3.55;
  pavilion.add(cord, lantern, glow);

  pavilion.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  scene.add(pavilion);
}

// ============================================================
//  天气系统
// ============================================================
const STORM = { level: 0.65 };          // 风暴强度(UI 滑块控制)
let windBase = 7;                    // 基础风速
let gust = 0;                        // 阵风系数(随时间起伏)

// --- 雪花贴图 ---
function makeFlakeTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.4, 'rgba(255,255,255,.85)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
const flakeTex = makeFlakeTexture();

// --- 暴雪粒子 ---
const SNOW_COUNT = 15000;
const SNOW_BOX = { x: 95, y: 55, z: 95 };
const snowPos = new Float32Array(SNOW_COUNT * 3);
const snowSpeed = new Float32Array(SNOW_COUNT);
const snowPhase = new Float32Array(SNOW_COUNT);
const snowFreq = new Float32Array(SNOW_COUNT);
for (let i = 0; i < SNOW_COUNT; i++) {
  snowPos[i * 3]     = (Math.random() * 2 - 1) * SNOW_BOX.x;
  snowPos[i * 3 + 1] = Math.random() * SNOW_BOX.y;
  snowPos[i * 3 + 2] = (Math.random() * 2 - 1) * SNOW_BOX.z;
  snowSpeed[i] = 7 + Math.random() * 8;
  snowPhase[i] = Math.random() * Math.PI * 2;
  snowFreq[i]  = 0.6 + Math.random() * 1.6;
}
const snowGeo = new THREE.BufferGeometry();
snowGeo.setAttribute('position', new THREE.BufferAttribute(snowPos, 3));
const snow = new THREE.Points(snowGeo, new THREE.PointsMaterial({
  size: 0.42, map: flakeTex, transparent: true, opacity: 0.92,
  depthWrite: false, color: 0xffffff, sizeAttenuation: true,
}));
snow.frustumCulled = false;
scene.add(snow);

// --- 风痕(横向疾驰的白色流线) ---
const STREAKS = 240;
const streakPos = new Float32Array(STREAKS * 6);
const streakLen = new Float32Array(STREAKS);
for (let i = 0; i < STREAKS; i++) {
  streakPos[i * 6]     = (Math.random() * 2 - 1) * 110;
  streakPos[i * 6 + 1] = Math.random() * 45;
  streakPos[i * 6 + 2] = (Math.random() * 2 - 1) * 110;
  streakLen[i] = 2 + Math.random() * 4;
}
const streakGeo = new THREE.BufferGeometry();
streakGeo.setAttribute('position', new THREE.BufferAttribute(streakPos, 3));
const streaks = new THREE.LineSegments(streakGeo, new THREE.LineBasicMaterial({
  color: 0xffffff, transparent: true, opacity: 0.22,
}));
streaks.frustumCulled = false;
scene.add(streaks);

// --- 地面流雾 ---
const mists = [];
{
  const mat = new THREE.SpriteMaterial({
    map: flakeTex, color: 0xd6dde4, transparent: true,
    opacity: 0.08, depthWrite: false,
  });
  for (let i = 0; i < 14; i++) {
    const s = new THREE.Sprite(mat.clone());
    const a = Math.random() * Math.PI * 2;
    const r = 12 + Math.random() * 75;
    s.position.set(Math.cos(a) * r, 1 + Math.random() * 2.5, Math.sin(a) * r);
    const sc = 26 + Math.random() * 34;
    s.scale.set(sc, sc * 0.4, 1);
    s.material.opacity = 0.05 + Math.random() * 0.06;
    mists.push(s);
    scene.add(s);
  }
}

// --- 闪电 ---
const lightning = { next: 6 + Math.random() * 8, start: -10 };
function flashEnvelope(t) {
  // 三次脉冲的闪光包络
  let f = 0;
  for (let k = 0; k < 3; k++) {
    const d = (t - k * 0.14) / 0.05;
    f += Math.exp(-d * d) * (k === 1 ? 1 : 0.55);
  }
  return f;
}

// ============================================================
//  风声(WebAudio 程序合成,需用户点击开启)
// ============================================================
let audioCtx = null, windGain = null;
const soundBtn = document.getElementById('soundBtn');
function initWindAudio() {
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  const len = audioCtx.sampleRate * 3;
  const buf = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
  const data = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {           // 布朗噪声,更接近风吼
    const white = Math.random() * 2 - 1;
    last = (last + 0.02 * white) / 1.02;
    data[i] = last * 3.2;
  }
  const src = audioCtx.createBufferSource();
  src.buffer = buf; src.loop = true;

  const filter = audioCtx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 320;
  filter.Q.value = 0.6;

  windGain = audioCtx.createGain();
  windGain.gain.value = 0;

  // 低频振荡调制滤波频率与音量 → 风的呼啸起伏
  const lfo = audioCtx.createOscillator();
  lfo.frequency.value = 0.13;
  const lfoGain = audioCtx.createGain();
  lfoGain.gain.value = 140;
  lfo.connect(lfoGain).connect(filter.frequency);
  const lfo2 = audioCtx.createOscillator();
  lfo2.frequency.value = 0.07;
  const lfo2Gain = audioCtx.createGain();
  lfo2Gain.gain.value = 0.08;
  lfo2.connect(lfo2Gain).connect(windGain.gain);

  src.connect(filter).connect(windGain).connect(audioCtx.destination);
  src.start(); lfo.start(); lfo2.start();
}
let soundOn = false;
soundBtn.addEventListener('click', () => {
  if (!audioCtx) initWindAudio();
  soundOn = !soundOn;
  audioCtx.resume();
  windGain.gain.linearRampToValueAtTime(soundOn ? 0.22 : 0, audioCtx.currentTime + 1.2);
  soundBtn.textContent = soundOn ? '🔊 关闭风声' : '🔇 开启风声';
});

// --- 风暴强度滑块 ---
document.getElementById('storm').addEventListener('input', (e) => {
  STORM.level = parseFloat(e.target.value);
});

// ============================================================
//  主循环
// ============================================================
const clock = new THREE.Clock();
let elapsed = 0;

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  elapsed += dt;
  const t = elapsed;
  const lv = STORM.level;

  // 阵风起伏(低频噪声)
  gust = fbm(t * 0.18, 3.7, 2) * 1.6 * lv;
  const windX = (windBase + gust * 14) * lv;

  // --- 雪 ---
  const p = snowGeo.attributes.position.array;
  const fallMul = (0.75 + gust * 0.35) * lv;
  for (let i = 0; i < SNOW_COUNT; i++) {
    const ix = i * 3;
    p[ix + 1] -= snowSpeed[i] * fallMul * dt;
    p[ix]     += (windX * (0.55 + snowFreq[i] * 0.25) + Math.sin(t * snowFreq[i] + snowPhase[i]) * 2.2) * dt;
    p[ix + 2] += Math.cos(t * snowFreq[i] * 0.8 + snowPhase[i]) * 1.4 * dt;
    if (p[ix + 1] < 0)          p[ix + 1] += SNOW_BOX.y;
    if (p[ix] > SNOW_BOX.x)     p[ix] -= SNOW_BOX.x * 2;
    if (p[ix + 2] > SNOW_BOX.z) p[ix + 2] -= SNOW_BOX.z * 2;
    if (p[ix + 2] < -SNOW_BOX.z) p[ix + 2] += SNOW_BOX.z * 2;
  }
  snowGeo.attributes.position.needsUpdate = true;
  snow.material.opacity = Math.min(0.95, 0.55 + lv * 0.35);

  // --- 风痕 ---
  const sp = streakGeo.attributes.position.array;
  const streakSpeed = (38 + gust * 55) * lv;
  for (let i = 0; i < STREAKS; i++) {
    const ix = i * 6;
    sp[ix] += streakSpeed * dt;
    if (sp[ix] > 110) {
      sp[ix] = -110;
      sp[ix + 1] = Math.random() * 45;
      sp[ix + 2] = (Math.random() * 2 - 1) * 110;
    }
    const L = streakLen[i] * (0.7 + gust * 0.5);
    sp[ix + 3] = sp[ix] - L;      // 尾部
    sp[ix + 4] = sp[ix + 1];
    sp[ix + 5] = sp[ix + 2];
  }
  streakGeo.attributes.position.needsUpdate = true;
  streaks.material.opacity = 0.1 + Math.min(0.3, gust * 0.16);

  // --- 流雾 ---
  for (const m of mists) {
    m.position.x += (1.5 + gust * 3) * dt;
    if (m.position.x > 100) m.position.x = -100;
  }

  // --- 闪电 ---
  if (t > lightning.next) { lightning.start = t; lightning.next = t + 7 + Math.random() * 12; }
  const f = flashEnvelope(t - lightning.start);
  sun.intensity  = 1.35 + f * 5.5;
  hemi.intensity = 0.95 + f * 1.4;
  skyMat.uniforms.top.value.setHex(0x5b6572).lerp(new THREE.Color(0xcdd6e0), Math.min(f, 1) * 0.5);

  // 雾密度随强度变化
  scene.fog.density = 0.0055 + lv * 0.0032;

  controls.update();
  renderer.render(scene, camera);
}
animate();
document.getElementById('loading').classList.add('done');

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
