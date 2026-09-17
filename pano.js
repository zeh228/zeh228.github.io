import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

/* ============================================================
   雪原孤亭 · 照片级全景版
   以等距柱状全景图为 360° 环境,叠加真实 3D 风雪粒子
   ============================================================ */

const container = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 0, 0.01);

// ---------- 全景环境 & 多场景系统 ----------
const loader = new THREE.TextureLoader();
const fadeEl = document.getElementById('fade');
const scenesBar = document.getElementById('scenes');
const texCache = {};
let sceneList = [];

function prepTexture(tex) {
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return tex;
}

function applyScene(sc) {
  fadeEl.classList.add('on');
  const finish = (tex) => {
    scene.background = tex;
    postMat.uniforms.uTint.value.set(sc.tint[0], sc.tint[1], sc.tint[2]);
    postMat.uniforms.uExposurePost.value = sc.exposure;
    moon.visible = !!sc.moon;
    // 季节天气切换
    const w = sc.weather || 'snow';
    snow.visible = bokeh.mesh.visible = haze.mesh.visible = (w === 'snow');
    rain.visible = (w === 'rain' || w === 'storm');
    leaves.mesh.visible = (w === 'leaves');
    petals.mesh.visible = (w === 'petals');
    BOLT.min = (sc.bolt && sc.bolt[0]) || 7;
    BOLT.max = (sc.bolt && sc.bolt[1]) || 19;
    STORM.level = sc.storm;
    stormSlider.value = sc.storm;
    missingEl.classList.remove('show');
    document.querySelectorAll('.scene-chip').forEach((el) =>
      el.classList.toggle('active', el.dataset.id === sc.id));
    fadeEl.classList.remove('on');
    document.getElementById('loading').classList.add('done');
  };
  if (texCache[sc.id]) { finish(texCache[sc.id]); return; }
  loader.load(sc.file, (tex) => {
    prepTexture(tex);
    texCache[sc.id] = tex;
    finish(tex);
  }, undefined, () => {
    // 底图缺失:展示生成提示词
    fadeEl.classList.remove('on');
    document.getElementById('loading').classList.add('done');
    document.getElementById('mp-name').textContent = sc.name;
    document.getElementById('mp-file').textContent = sc.file;
    document.getElementById('mp-prompt').textContent = sc.genPrompt || '';
    missingEl.classList.add('show');
  });
}

const missingEl = document.getElementById('missing');
document.getElementById('mp-close').addEventListener('click', () => missingEl.classList.remove('show'));

// --- 场景组(两级点选:场景组 → 四季) ---
const groupTabsEl = document.getElementById('group-tabs');
const chipsEl = document.getElementById('chips');
let groups = [];
let activeGroup = null;

function buildChips(group) {
  chipsEl.innerHTML = '';
  for (const sc of group.scenes) {
    const chip = document.createElement('div');
    chip.className = 'scene-chip';
    chip.dataset.id = sc.id;
    chip.innerHTML = `<div class="n">${sc.name}</div><div class="d">${sc.desc}</div>`;
    chip.addEventListener('click', () => applyScene(sc, group));
    chipsEl.appendChild(chip);
  }
  document.querySelectorAll('.group-tab').forEach((el) =>
    el.classList.toggle('active', el.dataset.id === group.id));
  document.getElementById('scene-title').textContent = group.name;
  document.getElementById('scene-sub').textContent = group.subtitle;
  document.title = `${group.name} · 极寒之境`;
}

function selectGroup(group, sceneId) {
  activeGroup = group;
  buildChips(group);
  const sc = group.scenes.find((s) => s.id === sceneId) || group.scenes[group.scenes.length - 1];
  applyScene(sc, group);
}

fetch('./scenes.json')
  .then((r) => r.json())
  .then((data) => {
    groups = data.groups;
    for (const g of groups) {
      const tab = document.createElement('div');
      tab.className = 'group-tab';
      tab.dataset.id = g.id;
      tab.textContent = g.name;
      tab.addEventListener('click', () => selectGroup(g));
      groupTabsEl.appendChild(tab);
    }
    selectGroup(groups[0], 'p-winter');
    // 空闲时预加载所有场景底图
    let delay = 0;
    for (const g of groups) {
      for (const sc of g.scenes) {
        delay += 1500;
        setTimeout(() => {
          if (!texCache[sc.id]) loader.load(sc.file, (t) => (texCache[sc.id] = prepTexture(t)), undefined, () => {});
        }, delay);
      }
    }
  });

// ---------- 清晰度增强(反锐化掩模 + 轻反差曲线) ----------
const pr = renderer.getPixelRatio();
const rt = new THREE.WebGLRenderTarget(window.innerWidth * pr, window.innerHeight * pr, { samples: 4 });
const postScene = new THREE.Scene();
const postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const postMat = new THREE.ShaderMaterial({
  uniforms: {
    tDiffuse: { value: rt.texture },
    uTexel:   { value: new THREE.Vector2(1 / rt.width, 1 / rt.height) },
    uSharp:   { value: 0.5 },      // 锐化强度
    uClarity: { value: 0.25 },     // 反差曲线强度
    uTint:    { value: new THREE.Vector3(1, 1, 1) },  // 场景色调
    uExposurePost: { value: 1.0 },                    // 场景曝光
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform vec2 uTexel;
    uniform float uSharp;
    uniform float uClarity;
    uniform vec3 uTint;
    uniform float uExposurePost;
    varying vec2 vUv;
    void main() {
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      vec3 blur = (
        texture2D(tDiffuse, vUv + vec2(0.0,  uTexel.y)).rgb +
        texture2D(tDiffuse, vUv - vec2(0.0,  uTexel.y)).rgb +
        texture2D(tDiffuse, vUv + vec2(uTexel.x, 0.0)).rgb +
        texture2D(tDiffuse, vUv - vec2(uTexel.x, 0.0)).rgb
      ) * 0.25;
      vec3 col = clamp(c + (c - blur) * uSharp, 0.0, 1.0);   // 反锐化掩模
      col *= uTint * uExposurePost;                          // 场景色彩分级
      vec3 curve = col * col * (3.0 - 2.0 * col);            // S 曲线提反差
      col = mix(col, curve, uClarity);
      gl_FragColor = vec4(col, 1.0);
      #include <colorspace_fragment>
    }`,
});
postMat.toneMapped = false;
postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), postMat));

// ---------- 视角控制(360° 环视 + 滚轮变焦) ----------
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableZoom = false;
controls.enablePan = false;
controls.rotateSpeed = -0.35;            // 反向拖拽,符合全景浏览直觉
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minPolarAngle = 0.7;            // 限制抬头低头幅度
controls.maxPolarAngle = 2.25;
controls.autoRotate = true;
controls.autoRotateSpeed = -0.18;
controls.addEventListener('start', () => (controls.autoRotate = false));

renderer.domElement.addEventListener('wheel', (e) => {
  camera.fov = THREE.MathUtils.clamp(camera.fov + e.deltaY * 0.03, 35, 95);
  camera.updateProjectionMatrix();
}, { passive: true });

// ---------- 天气系统 ----------
const STORM = { level: 0.65 };
let gust = 0;
const windBase = 7;

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
function fbm(x, y, oct = 3) {
  let v = 0, amp = 0.5, f = 1;
  for (let i = 0; i < oct; i++) { v += amp * vnoise(x * f, y * f); amp *= 0.5; f *= 2.1; }
  return v;
}

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

// --- 雪花贴图集(2x2:柔和雪点 / 絮状雪团 / 风拉雪痕 / 亮雪晶) ---
function makeFlakeAtlas() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  function blob(cx, cy, r, a) {
    const gr = g.createRadialGradient(cx, cy, 0, cx, cy, r);
    gr.addColorStop(0, `rgba(255,255,255,${a})`);
    gr.addColorStop(0.5, `rgba(255,255,255,${(a * 0.55).toFixed(3)})`);
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(cx - r, cy - r, r * 2, r * 2);
  }
  // 左上:柔和雪点(轻微不规则,避免"完美圆形"的假感)
  blob(64, 64, 40, 1); blob(47, 55, 22, 0.5); blob(81, 73, 20, 0.5); blob(59, 85, 16, 0.4);
  // 右上:絮状雪团(多个团块随机叠加)
  for (let i = 0; i < 8; i++) blob(192 + Math.random() * 46 - 23, 64 + Math.random() * 46 - 23, 10 + Math.random() * 15, 0.55);
  blob(192, 64, 36, 0.3);
  // 左下:风拉雪痕(斜向拖尾,模拟动态模糊)
  g.save(); g.translate(64, 192); g.rotate(-0.85);
  for (let i = 0; i < 7; i++) blob(-33 + i * 11, Math.random() * 5 - 2.5, 9 - i * 0.9, 0.75 * (1 - i / 8));
  g.restore();
  // 右下:小而亮的雪晶
  blob(192, 192, 11, 1); blob(192, 192, 26, 0.3);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// --- 暴雪粒子(着色器驱动:4 种形态 + 旋转 + 景深衰减) ---
const SNOW_COUNT = 6000;
const BOX = { x: 45, yMin: -8, yMax: 32, z: 45 };
const snowPos = new Float32Array(SNOW_COUNT * 3);
const snowSpeed = new Float32Array(SNOW_COUNT);
const snowPhase = new Float32Array(SNOW_COUNT);
const snowFreq = new Float32Array(SNOW_COUNT);
const aSize  = new Float32Array(SNOW_COUNT);
const aType  = new Float32Array(SNOW_COUNT);
const aRot   = new Float32Array(SNOW_COUNT * 2);
const aAlpha = new Float32Array(SNOW_COUNT);
for (let i = 0; i < SNOW_COUNT; i++) {
  snowPos[i * 3]     = (Math.random() * 2 - 1) * BOX.x;
  snowPos[i * 3 + 1] = BOX.yMin + Math.random() * (BOX.yMax - BOX.yMin);
  snowPos[i * 3 + 2] = (Math.random() * 2 - 1) * BOX.z;
  snowSpeed[i] = 4.5 + Math.random() * 7;
  snowPhase[i] = Math.random() * Math.PI * 2;
  snowFreq[i]  = 0.6 + Math.random() * 1.6;
  const r = Math.random();
  const type = r < 0.5 ? 0 : r < 0.78 ? 1 : r < 0.92 ? 2 : 3;
  aType[i] = type;
  aSize[i] = type === 0 ? 0.9 + Math.random() * 1.3
           : type === 1 ? 1.3 + Math.random() * 1.5
           : type === 2 ? 1.6 + Math.random() * 1.4
           :              0.4 + Math.random() * 0.6;
  aRot[i * 2]     = type === 2 ? 0 : (Math.random() - 0.5) * 2.5;   // 雪痕不旋转
  aRot[i * 2 + 1] = type === 2 ? -0.85 : Math.random() * Math.PI * 2;
  aAlpha[i] = type === 3 ? 0.5 + Math.random() * 0.3 : 0.65 + Math.random() * 0.35;
}
const snowGeo = new THREE.BufferGeometry();
snowGeo.setAttribute('position', new THREE.BufferAttribute(snowPos, 3));
snowGeo.setAttribute('aSize',  new THREE.BufferAttribute(aSize, 1));
snowGeo.setAttribute('aType',  new THREE.BufferAttribute(aType, 1));
snowGeo.setAttribute('aRot',   new THREE.BufferAttribute(aRot, 2));
snowGeo.setAttribute('aAlpha', new THREE.BufferAttribute(aAlpha, 1));
// --- 通用粒子材质工厂(雪花/落叶共用:贴图集 + 旋转 + 景深衰减) ---
function makeParticleMaterial(tex, cr, cg, cb) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime:       { value: 0 },
      uTex:        { value: tex },
      uAlpha:      { value: 0.9 },
      uPixelRatio: { value: renderer.getPixelRatio() },
      uColorize:   { value: new THREE.Vector3(cr, cg, cb) },
    },
    transparent: true,
    depthWrite: false,
    vertexShader: /* glsl */`
      attribute float aSize;
      attribute float aType;
      attribute vec2 aRot;
      attribute float aAlpha;
      uniform float uTime;
      uniform float uPixelRatio;
      varying float vType;
      varying float vAngle;
      varying float vAlpha;
      void main() {
        vType = aType;
        vAngle = aRot.y + uTime * aRot.x;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        float dist = max(-mv.z, 0.1);
        gl_PointSize = clamp(aSize * uPixelRatio * (260.0 / dist), 1.0, 220.0);
        vAlpha = aAlpha * smoothstep(48.0, 22.0, dist) * smoothstep(0.5, 1.6, dist);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D uTex;
      uniform float uAlpha;
      uniform vec3 uColorize;
      varying float vType;
      varying float vAngle;
      varying float vAlpha;
      void main() {
        vec2 cell = vec2(mod(vType, 2.0), 1.0 - floor(vType / 2.0));
        vec2 uv = gl_PointCoord - 0.5;
        float cs = cos(vAngle), sn = sin(vAngle);
        uv = mat2(cs, -sn, sn, cs) * uv;
        uv = clamp(uv + 0.5, 0.02, 0.98);
        uv = (uv + cell) * 0.5;
        vec4 tex = texture2D(uTex, uv);
        float a = tex.a * vAlpha * uAlpha;
        if (a < 0.01) discard;
        gl_FragColor = vec4(tex.rgb * uColorize, a);
      }`,
  });
}

const snow = new THREE.Points(snowGeo, makeParticleMaterial(makeFlakeAtlas(), 0.97, 0.985, 1.0));
snow.frustumCulled = false;
scene.add(snow);
const snowUniforms = snow.material.uniforms;
const particleMats = [snow.material];

// --- 简易雪层(前景失焦大光斑 / 远处细密雪雾) ---
function makeSnowLayer(count, xz, yMin, yMax, size, opacity) {
  const pos = new Float32Array(count * 3);
  const spd = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    pos[i * 3]     = (Math.random() * 2 - 1) * xz;
    pos[i * 3 + 1] = yMin + Math.random() * (yMax - yMin);
    pos[i * 3 + 2] = (Math.random() * 2 - 1) * xz;
    spd[i] = 0.8 + Math.random() * 1.6;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({
    size, map: flakeTex, transparent: true, opacity,
    depthWrite: false, sizeAttenuation: true,
  }));
  pts.frustumCulled = false;
  scene.add(pts);
  return { count, xz, yMin, yMax, geo, spd, mesh: pts };
}
const bokeh = makeSnowLayer(50, 14, -4, 10, 2.8, 0.09);   // 贴着镜头的失焦雪
const haze  = makeSnowLayer(2200, 70, -10, 40, 0.16, 0.13); // 远景雪雾,增加纵深
function driftLayer(L, fall, windF, dt, windX) {
  const p = L.geo.attributes.position.array;
  const span = L.yMax - L.yMin;
  for (let i = 0; i < L.count; i++) {
    const ix = i * 3;
    p[ix + 1] -= L.spd[i] * fall * dt;
    p[ix] += windX * windF * dt;
    if (p[ix + 1] < L.yMin) p[ix + 1] += span;
    if (p[ix] > L.xz) p[ix] -= L.xz * 2;
  }
  L.geo.attributes.position.needsUpdate = true;
}

// --- 雨(春·烟雨 / 夏·雷暴) ---
const RAIN_COUNT = 1600;
const rainPos = new Float32Array(RAIN_COUNT * 6);
const rainSpeed = new Float32Array(RAIN_COUNT);
for (let i = 0; i < RAIN_COUNT; i++) {
  rainPos[i * 6]     = (Math.random() * 2 - 1) * 50;
  rainPos[i * 6 + 1] = Math.random() * 40 - 6;
  rainPos[i * 6 + 2] = (Math.random() * 2 - 1) * 50;
  rainSpeed[i] = 24 + Math.random() * 12;
}
const rainGeo = new THREE.BufferGeometry();
rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
const rain = new THREE.LineSegments(rainGeo, new THREE.LineBasicMaterial({
  color: 0xd4dee8, transparent: true, opacity: 0.3,
}));
rain.visible = false;
rain.frustumCulled = false;
scene.add(rain);

// --- 落叶贴图集 & 落叶系统(秋) ---
function makeLeafAtlas() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const cells = [
    [64, 64, '#e3a83c', '#8a5a1a'],    // 琥珀
    [192, 64, '#c45f28', '#7a3010'],   // 锈红
    [64, 192, '#e8c84a', '#9a7820'],   // 金黄
    [192, 192, '#a85838', '#5f2f18'],  // 褐红
  ];
  for (const [cx, cy, c1, c2] of cells) {
    g.save();
    g.translate(cx, cy);
    g.rotate(((cx + cy) % 5) * 0.6 - 1.2);
    const gr = g.createRadialGradient(0, 0, 2, 0, 0, 42);
    gr.addColorStop(0, c1);
    gr.addColorStop(1, c2);
    g.fillStyle = gr;
    g.beginPath();
    g.ellipse(0, 0, 32, 19, 0, 0, Math.PI * 2);
    g.fill();
    g.beginPath();                    // 叶尖
    g.moveTo(28, 0); g.lineTo(46, -4); g.lineTo(46, 4);
    g.closePath(); g.fill();
    g.restore();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
// --- 花瓣贴图集(春·樱花雨) ---
function makePetalAtlas() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const cells = [
    [64, 64, '#f9d3e0', '#e89bb5'],
    [192, 64, '#fdeef2', '#f0b9cb'],
    [64, 192, '#f4b8cd', '#dd7f9f'],
    [192, 192, '#ffe9f0', '#f5c9d8'],
  ];
  for (const [cx, cy, c1, c2] of cells) {
    g.save();
    g.translate(cx, cy);
    g.rotate(((cx * cy) % 7) * 0.5 - 1.5);
    const gr = g.createRadialGradient(0, 0, 2, 0, 0, 34);
    gr.addColorStop(0, c1);
    gr.addColorStop(1, c2);
    g.fillStyle = gr;
    g.beginPath();
    g.ellipse(0, 0, 30, 17, 0, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// --- 飘舞粒子工厂(落叶 / 花瓣共用) ---
function makeFlutter(atlas, count, fallScale) {
  const pos   = new Float32Array(count * 3);
  const speed = new Float32Array(count);
  const phase = new Float32Array(count);
  const size  = new Float32Array(count);
  const type  = new Float32Array(count);
  const rot   = new Float32Array(count * 2);
  const alpha = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    pos[i * 3]     = (Math.random() * 2 - 1) * 40;
    pos[i * 3 + 1] = Math.random() * 25;
    pos[i * 3 + 2] = (Math.random() * 2 - 1) * 40;
    speed[i] = 1.2 + Math.random() * 1.6;
    phase[i] = Math.random() * Math.PI * 2;
    size[i]  = 1.0 + Math.random() * 1.2;
    type[i]  = Math.floor(Math.random() * 4);
    rot[i * 2]     = (Math.random() - 0.5) * 7;
    rot[i * 2 + 1] = Math.random() * Math.PI * 2;
    alpha[i] = 0.85 + Math.random() * 0.15;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSize',  new THREE.BufferAttribute(size, 1));
  geo.setAttribute('aType',  new THREE.BufferAttribute(type, 1));
  geo.setAttribute('aRot',   new THREE.BufferAttribute(rot, 2));
  geo.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1));
  const mesh = new THREE.Points(geo, makeParticleMaterial(atlas, 1, 1, 1));
  mesh.material.uniforms.uAlpha.value = 1.0;
  mesh.visible = false;
  mesh.frustumCulled = false;
  scene.add(mesh);
  particleMats.push(mesh.material);
  return { mesh, geo, speed, phase, count, fallScale };
}
const leaves = makeFlutter(makeLeafAtlas(), 380, 1.0);   // 秋·落叶
const petals = makeFlutter(makePetalAtlas(), 320, 0.6);  // 春·花瓣(落得更轻缓)

// --- 风痕流线 ---
const STREAKS = 200;
const streakPos = new Float32Array(STREAKS * 6);
const streakLen = new Float32Array(STREAKS);
for (let i = 0; i < STREAKS; i++) {
  streakPos[i * 6]     = (Math.random() * 2 - 1) * 60;
  streakPos[i * 6 + 1] = Math.random() * 28;
  streakPos[i * 6 + 2] = (Math.random() * 2 - 1) * 60;
  streakLen[i] = 1.5 + Math.random() * 3;
}
const streakGeo = new THREE.BufferGeometry();
streakGeo.setAttribute('position', new THREE.BufferAttribute(streakPos, 3));
const streaks = new THREE.LineSegments(streakGeo, new THREE.LineBasicMaterial({
  color: 0xffffff, transparent: true, opacity: 0.2,
}));
streaks.frustumCulled = false;
scene.add(streaks);

// --- 近地流雾 ---
const mists = [];
{
  for (let i = 0; i < 12; i++) {
    const mat = new THREE.SpriteMaterial({
      map: flakeTex, color: 0xd6dde4, transparent: true,
      opacity: 0.05 + Math.random() * 0.06, depthWrite: false,
    });
    const s = new THREE.Sprite(mat);
    const a = Math.random() * Math.PI * 2;
    const r = 14 + Math.random() * 30;
    s.position.set(Math.cos(a) * r, -1 + Math.random() * 3, Math.sin(a) * r);
    const sc = 22 + Math.random() * 26;
    s.scale.set(sc, sc * 0.35, 1);
    mists.push(s);
    scene.add(s);
  }
}

// --- 冷月(月夜场景显示) ---
const moon = new THREE.Group();
{
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: flakeTex, color: 0xaebfdd, transparent: true, opacity: 0.4, depthWrite: false,
  }));
  halo.scale.set(230, 230, 1);
  const core = new THREE.Sprite(new THREE.SpriteMaterial({
    map: flakeTex, color: 0xf6f9ff, transparent: true, opacity: 0.95, depthWrite: false,
  }));
  core.scale.set(58, 58, 1);
  moon.add(halo, core);
  moon.position.set(-300, 330, 0);   // 挂在全景图云隙亮区方向
  moon.visible = false;
  scene.add(moon);
}

// --- 闪电(通过曝光脉冲实现) ---
const BOLT = { min: 7, max: 19 };   // 闪电间隔(秒),随场景切换
const lightning = { next: 6 + Math.random() * 8, start: -10 };
function flashEnvelope(t) {
  let f = 0;
  for (let k = 0; k < 3; k++) {
    const d = (t - k * 0.14) / 0.05;
    f += Math.exp(-d * d) * (k === 1 ? 1 : 0.55);
  }
  return f;
}

// ---------- 风声 ----------
let audioCtx = null, windGain = null, soundOn = false;
const soundBtn = document.getElementById('soundBtn');
function initWindAudio() {
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  const len = audioCtx.sampleRate * 3;
  const buf = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
  const data = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const white = Math.random() * 2 - 1;
    last = (last + 0.02 * white) / 1.02;
    data[i] = last * 3.2;
  }
  const src = audioCtx.createBufferSource();
  src.buffer = buf; src.loop = true;
  const filter = audioCtx.createBiquadFilter();
  filter.type = 'bandpass'; filter.frequency.value = 320; filter.Q.value = 0.6;
  windGain = audioCtx.createGain();
  windGain.gain.value = 0;
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
soundBtn.addEventListener('click', () => {
  if (!audioCtx) initWindAudio();
  soundOn = !soundOn;
  audioCtx.resume();
  windGain.gain.linearRampToValueAtTime(soundOn ? 0.22 : 0, audioCtx.currentTime + 1.2);
  soundBtn.textContent = soundOn ? '🔊 关闭风声' : '🔇 开启风声';
});
const stormSlider = document.getElementById('storm');
stormSlider.addEventListener('input', (e) => {
  STORM.level = parseFloat(e.target.value);
});

// ---------- 主循环 ----------
const clock = new THREE.Clock();
let elapsed = 0;

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  elapsed += dt;
  const t = elapsed;
  const lv = STORM.level;

  gust = fbm(t * 0.18, 3.7, 2) * 1.6 * lv;
  const windX = (windBase + gust * 14) * lv;

  // 雪
  if (snow.visible) {
    const p = snowGeo.attributes.position.array;
    const fallMul = (0.75 + gust * 0.35) * lv;
    const ySpan = BOX.yMax - BOX.yMin;
    for (let i = 0; i < SNOW_COUNT; i++) {
      const ix = i * 3;
      p[ix + 1] -= snowSpeed[i] * fallMul * dt;
      p[ix]     += (windX * (0.55 + snowFreq[i] * 0.25) + Math.sin(t * snowFreq[i] + snowPhase[i]) * 2.2) * dt;
      p[ix + 2] += Math.cos(t * snowFreq[i] * 0.8 + snowPhase[i]) * 1.4 * dt;
      if (p[ix + 1] < BOX.yMin)   p[ix + 1] += ySpan;
      if (p[ix] > BOX.x)          p[ix] -= BOX.x * 2;
      if (p[ix + 2] > BOX.z)      p[ix + 2] -= BOX.z * 2;
      if (p[ix + 2] < -BOX.z)     p[ix + 2] += BOX.z * 2;
    }
    snowGeo.attributes.position.needsUpdate = true;
  }
  snowUniforms.uTime.value = t;
  snowUniforms.uAlpha.value = Math.min(0.85, 0.3 + lv * 0.28);
  for (const m of particleMats) m.uniforms.uTime.value = t;

  // 前景失焦雪斑 & 远景雪雾
  if (bokeh.mesh.visible) {
    driftLayer(bokeh, 0.5, 0.12, dt, windX);
    driftLayer(haze, 3.0, 0.45, dt, windX);
    bokeh.mesh.material.opacity = 0.05 + lv * 0.04;
    haze.mesh.material.opacity = 0.08 + lv * 0.07;
  }

  // --- 雨 ---
  if (rain.visible) {
    const rp = rainGeo.attributes.position.array;
    const rainFall = (0.85 + gust * 0.3) * (0.7 + lv * 0.5);
    for (let i = 0; i < RAIN_COUNT; i++) {
      const ix = i * 6;
      rp[ix + 1] -= rainSpeed[i] * rainFall * dt;
      rp[ix] += windX * 0.35 * dt;
      if (rp[ix + 1] < -6) {
        rp[ix + 1] += 42;
        rp[ix] = (Math.random() * 2 - 1) * 50;
        rp[ix + 2] = (Math.random() * 2 - 1) * 50;
      }
      if (rp[ix] > 50) rp[ix] -= 100;
      rp[ix + 3] = rp[ix] - windX * 0.028;   // 雨尾逆风倾斜
      rp[ix + 4] = rp[ix + 1] + 1.1;
      rp[ix + 5] = rp[ix + 2];
    }
    rainGeo.attributes.position.needsUpdate = true;
    rain.material.opacity = 0.16 + Math.min(0.3, lv * 0.18);
  }

  // --- 落叶 / 花瓣 ---
  function updateFlutter(F) {
    const p = F.geo.attributes.position.array;
    for (let i = 0; i < F.count; i++) {
      const ix = i * 3;
      p[ix + 1] -= F.speed[i] * (0.8 + lv * 0.4) * F.fallScale * dt;
      p[ix]     += (windX * 0.35 + Math.sin(t * 1.3 + F.phase[i]) * 3.5) * dt;
      p[ix + 2] += Math.cos(t * 1.1 + F.phase[i] * 1.7) * 3.0 * dt;
      if (p[ix + 1] < -1)  p[ix + 1] += 26;
      if (p[ix] > 40)      p[ix] -= 80;
      if (p[ix + 2] > 40)  p[ix + 2] -= 80;
      if (p[ix + 2] < -40) p[ix + 2] += 80;
    }
    F.geo.attributes.position.needsUpdate = true;
  }
  if (leaves.mesh.visible) updateFlutter(leaves);
  if (petals.mesh.visible) updateFlutter(petals);

  // 风痕
  const sp = streakGeo.attributes.position.array;
  const streakSpeed = (36 + gust * 55) * lv;
  for (let i = 0; i < STREAKS; i++) {
    const ix = i * 6;
    sp[ix] += streakSpeed * dt;
    if (sp[ix] > 60) {
      sp[ix] = -60;
      sp[ix + 1] = Math.random() * 28;
      sp[ix + 2] = (Math.random() * 2 - 1) * 60;
    }
    const L = streakLen[i] * (0.7 + gust * 0.5);
    sp[ix + 3] = sp[ix] - L;
    sp[ix + 4] = sp[ix + 1];
    sp[ix + 5] = sp[ix + 2];
  }
  streakGeo.attributes.position.needsUpdate = true;
  streaks.material.opacity = 0.05 + Math.min(0.2, gust * 0.12);

  // 流雾
  for (const m of mists) {
    m.position.x += (1.2 + gust * 2.5) * dt;
    if (m.position.x > 50) m.position.x = -50;
  }

  // 闪电 → 曝光脉冲
  if (t > lightning.next) { lightning.start = t; lightning.next = t + BOLT.min + Math.random() * (BOLT.max - BOLT.min); }
  const f = flashEnvelope(t - lightning.start);
  renderer.toneMappingExposure = 1.0 + f * 1.8;

  controls.update();
  renderer.setRenderTarget(rt);
  renderer.render(scene, camera);
  renderer.setRenderTarget(null);
  renderer.render(postScene, postCam);
}
animate();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  const pr2 = renderer.getPixelRatio();
  rt.setSize(window.innerWidth * pr2, window.innerHeight * pr2);
  postMat.uniforms.uTexel.value.set(1 / rt.width, 1 / rt.height);
});
