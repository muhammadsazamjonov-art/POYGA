import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

export type RacePhase = 'countdown' | 'racing' | 'over';
export type CrashReason = 'traffic' | 'wall';

export interface RacerHud {
  phase: RacePhase;
  countdown: number;
  speed: number;
  score: number;
  time: number;
  distance: number;
  nitro: number;
  boosting: boolean;
  message: string;
}

export interface RacerResult {
  score: number;
  time: number;
  distance: number;
  topSpeed: number;
  reason: CrashReason;
}

export interface RacerCallbacks {
  onHud: (hud: RacerHud) => void;
  onCrash: (result: RacerResult) => void;
}

export interface RacerOptions {
  quality?: 'high' | 'low';
  shake?: boolean;
}

export interface RacerControls {
  left: boolean;
  right: boolean;
  gas: boolean;
  brake: boolean;
  boost: boolean;
}

const ROAD_HALF = 9;
const LANES = [-5.4, -1.8, 1.8, 5.4];
const COUNTDOWN_SECONDS = 3.3;
const FIXED_STEP = 1 / 60;
const FOG_COLOR = 0x070a12;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const damp = (current: number, target: number, smoothing: number, dt: number) => current + (target - current) * (1 - Math.exp(-smoothing * dt));

function makeRng(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvasTexture(width: number, height: number, paint: (ctx: CanvasRenderingContext2D, width: number, height: number) => void) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D is unavailable');
  paint(ctx, width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

function makeAsphaltTexture() {
  const rng = makeRng(7);
  const texture = canvasTexture(512, 1024, (ctx, width, height) => {
    const base = ctx.createLinearGradient(0, 0, width, 0);
    base.addColorStop(0, '#191d23');
    base.addColorStop(0.5, '#1e2229');
    base.addColorStop(1, '#161a20');
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, width, height);
    for (let i = 0; i < 7000; i++) {
      const shade = 20 + Math.floor(rng() * 42);
      ctx.fillStyle = `rgba(${shade},${shade + 3},${shade + 7},${0.12 + rng() * 0.22})`;
      const size = rng() > 0.86 ? 3 : 1.4;
      ctx.fillRect(rng() * width, rng() * height, size, size);
    }
    // Rubbered-in racing lines through each lane.
    for (const center of [0.125, 0.375, 0.625, 0.875]) {
      const gradient = ctx.createLinearGradient((center - 0.055) * width, 0, (center + 0.055) * width, 0);
      gradient.addColorStop(0, 'rgba(8,10,13,0)');
      gradient.addColorStop(0.5, 'rgba(8,10,13,.38)');
      gradient.addColorStop(1, 'rgba(8,10,13,0)');
      ctx.fillStyle = gradient;
      ctx.fillRect((center - 0.06) * width, 0, width * 0.12, height);
    }
    // Lane dashes.
    ctx.strokeStyle = 'rgba(232,238,220,.62)';
    ctx.lineWidth = 5;
    ctx.setLineDash([128, 128]);
    for (const center of [0.3, 0.5, 0.7]) {
      ctx.beginPath();
      ctx.moveTo(center * width, 0);
      ctx.lineTo(center * width, height);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    // Solid lines mark the outside shoulder.
    ctx.strokeStyle = 'rgba(226,234,214,.5)';
    ctx.lineWidth = 5;
    for (const x of [0.1 * width, 0.9 * width]) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    // Occasional tar seams.
    ctx.strokeStyle = 'rgba(9,11,14,.45)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 5; i++) {
      const y = rng() * height;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.bezierCurveTo(width * 0.3, y + 14, width * 0.6, y - 12, width, y + 5);
      ctx.stroke();
    }
  });
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1, 1000 / 26);
  return texture;
}

function makeFacadeTexture(seed: number, warm: boolean) {
  const rng = makeRng(seed);
  return canvasTexture(256, 512, (ctx, width, height) => {
    const base = ctx.createLinearGradient(0, 0, 0, height);
    base.addColorStop(0, '#0b1119');
    base.addColorStop(0.72, '#060a10');
    base.addColorStop(1, '#0a0d11');
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, width, height);
    const cols = 8;
    const rows = 26;
    const cellW = width / cols;
    const cellH = height / rows;
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const x = col * cellW + cellW * 0.18;
        const y = row * cellH + cellH * 0.2;
        const lit = rng() < (warm ? 0.3 : 0.22);
        if (!lit) {
          ctx.fillStyle = `rgba(52,68,88,${0.03 + rng() * 0.04})`;
        } else {
          const hot = rng() < 0.74;
          const warmth = Math.floor(rng() * 40);
          ctx.fillStyle = hot
            ? `rgba(255,${196 + warmth},${120 + warmth},${0.5 + rng() * 0.42})`
            : `rgba(120,200,255,${0.34 + rng() * 0.4})`;
        }
        ctx.fillRect(x, y, cellW * 0.62, cellH * 0.42);
      }
      ctx.fillStyle = 'rgba(0,0,0,.34)';
      ctx.fillRect(0, row * cellH + cellH * 0.78, width, 1.5);
    }
    // Ground-floor shopfronts: bright band near the bottom of the texture.
    const shop = ctx.createLinearGradient(0, height - 46, 0, height);
    shop.addColorStop(0, 'rgba(255,196,120,.05)');
    shop.addColorStop(0.35, 'rgba(255,196,120,.34)');
    shop.addColorStop(1, 'rgba(255,170,110,.08)');
    ctx.fillStyle = shop;
    ctx.fillRect(0, height - 46, width, 46);
    for (let i = 0; i < 5; i++) {
      const podX = i * (width / 5) + 6;
      const colors = ['rgba(200,246,90,.7)', 'rgba(255,120,140,.65)', 'rgba(130,210,255,.7)'];
      ctx.fillStyle = colors[i % colors.length];
      ctx.fillRect(podX, height - 40, width / 5 - 12, 3);
    }
    if (rng() < 0.75) {
      ctx.fillStyle = rng() < 0.6 ? 'rgba(200,246,90,.8)' : 'rgba(255,86,120,.75)';
      ctx.fillRect(rng() < 0.5 ? 0 : width - 3, 0, 3, height);
    }
  });
}

function makeDustTexture() {
  return canvasTexture(64, 64, (ctx, width, height) => {
    const gradient = ctx.createRadialGradient(width / 2, height / 2, 0, width / 2, height / 2, width / 2);
    gradient.addColorStop(0, 'rgba(255,255,255,.9)');
    gradient.addColorStop(0.45, 'rgba(255,255,255,.32)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
  });
}

function makeShadowTexture() {
  return canvasTexture(128, 128, (ctx, width, height) => {
    const gradient = ctx.createRadialGradient(width / 2, height / 2, 4, width / 2, height / 2, width / 2);
    gradient.addColorStop(0, 'rgba(0,0,0,.78)');
    gradient.addColorStop(0.55, 'rgba(0,0,0,.42)');
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
  });
}

function makeGlowTexture(color: string) {
  return canvasTexture(128, 128, (ctx, width, height) => {
    const gradient = ctx.createRadialGradient(width / 2, height / 2, 0, width / 2, height / 2, width / 2);
    gradient.addColorStop(0, color);
    gradient.addColorStop(0.5, color.replace(/[\d.]+\)$/, '0.24)'));
    gradient.addColorStop(1, color.replace(/[\d.]+\)$/, '0)'));
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
  });
}

function makeSignTexture(text: string, color: string) {
  return canvasTexture(512, 256, (ctx, width, height) => {
    ctx.fillStyle = '#070a0d';
    ctx.fillRect(0, 0, width, height);
    const wash = ctx.createLinearGradient(0, 0, width, height);
    wash.addColorStop(0, 'rgba(255,255,255,.04)');
    wash.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = wash;
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 26;
    ctx.lineWidth = 7;
    ctx.strokeRect(14, 14, width - 28, height - 28);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#f4f6ea';
    ctx.shadowBlur = 32;
    ctx.font = '800 78px "Barlow Condensed", "Arial Narrow", sans-serif';
    ctx.fillText(text, width / 2, height / 2 + 5);
    ctx.shadowBlur = 0;
    ctx.fillStyle = color;
    ctx.font = '600 20px "DM Sans", Arial, sans-serif';
    ctx.fillText('REDLINE · NIGHT RUN', width / 2, height - 42);
  });
}

function makeMoonTexture() {
  return canvasTexture(256, 256, (ctx, width, height) => {
    const glow = ctx.createRadialGradient(width / 2, height / 2, 18, width / 2, height / 2, width / 2);
    glow.addColorStop(0, 'rgba(228,238,255,.95)');
    glow.addColorStop(0.22, 'rgba(196,214,255,.5)');
    glow.addColorStop(0.52, 'rgba(146,170,255,.14)');
    glow.addColorStop(1, 'rgba(120,150,255,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = '#eef3ff';
    ctx.beginPath();
    ctx.arc(width / 2, height / 2, 34, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(170,188,225,.35)';
    for (const [x, y, r] of [[118, 114, 8], [138, 136, 5], [112, 142, 4], [142, 110, 3]]) {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

interface Building {
  x: number;
  z: number;
  width: number;
  height: number;
  depth: number;
  rotation: number;
  lane: number;
}

interface Lamp {
  z: number;
  side: number;
}

interface Sign {
  z: number;
  side: number;
  group: THREE.Group;
}

interface TrafficCar {
  group: THREE.Group;
  body: THREE.Mesh;
  x: number;
  z: number;
  speed: number;
  halfWidth: number;
  halfLength: number;
  lane: number;
  passed: boolean;
}

export class RacerEngine {
  readonly controls: RacerControls = { left: false, right: false, gas: false, brake: false, boost: false };

  private readonly container: HTMLElement;
  private readonly callbacks: RacerCallbacks;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly composer: EffectComposer | null;
  private readonly lowPower: boolean;
  private readonly reduceShake: boolean;

  private raf = 0;
  private lastFrame = 0;
  private accumulator = 0;
  private elapsed = 0;
  private paused = false;

  private phase: RacePhase = 'countdown';
  private countdown = COUNTDOWN_SECONDS;
  private time = 0;
  private score = 0;
  private distance = 0;
  private speed = 0;
  private topSpeed = 0;
  private nitro = 100;
  private boosting = false;
  private steer = 0;
  private lateral = LANES[2];
  private message = '';
  private messageTtl = 0;
  private crashReason: CrashReason | null = null;
  private crashAt = 0;
  private crashShake = 0;

  private readonly boxGeometry = new THREE.BoxGeometry(1, 1, 1);
  private readonly poleGeometry = new THREE.CylinderGeometry(0.13, 0.16, 8, 7);
  private readonly asphalt: THREE.Texture;
  private readonly glowLime: THREE.Texture;
  private readonly glowRed: THREE.Texture;
  private readonly poolGlow: THREE.Texture;
  private readonly shadowTexture: THREE.Texture;
  private underglowMaterial!: THREE.MeshBasicMaterial;

  private player!: THREE.Group;
  private wheels: THREE.Group[] = [];
  private brakeLight!: THREE.MeshBasicMaterial;
  private flames: THREE.Sprite[] = [];
  private underglow!: THREE.Mesh;
  private shadow!: THREE.Mesh;
  private underLight!: THREE.PointLight;
  private heroLight!: THREE.PointLight;
  private spotlight!: THREE.SpotLight;

  private buildings: { mesh: THREE.InstancedMesh; items: Building[] }[] = [];
  private lamps: Lamp[] = [];
  private lampPoles!: THREE.InstancedMesh;
  private lampArms!: THREE.InstancedMesh;
  private lampHeads!: THREE.InstancedMesh;
  private lampPools!: THREE.InstancedMesh;
  private signs: Sign[] = [];
  private gantries: { group: THREE.Group; overhead: boolean }[] = [];

  private traffic: TrafficCar[] = [];
  private trafficMaterials: THREE.MeshStandardMaterial[] = [];
  private glassMaterial!: THREE.MeshStandardMaterial;

  private dust!: THREE.Points;
  private dustPositions!: Float32Array;
  private boostLines!: THREE.LineSegments;
  private boostLinePositions!: Float32Array;
  private boostLineLengths: number[] = [];

  private readonly dummy = new THREE.Object3D();
  private camX = LANES[2];
  private camDistance = 7.15;
  private camHeight = 2.32;
  private lastHud = 0;
  private lastCountdown = -1;
  private envTexture: THREE.Texture | null = null;
  private resizeObserver: ResizeObserver | null = null;

  constructor(container: HTMLElement, callbacks: RacerCallbacks, options: RacerOptions = {}) {
    this.container = container;
    this.callbacks = callbacks;
    this.reduceShake = options.shake === false;
    this.lowPower = options.quality === 'low' || window.matchMedia('(max-width: 820px)').matches;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setClearColor(FOG_COLOR, 1);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.92;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.domElement.dataset.racer = 'true';
    this.renderer.domElement.setAttribute('aria-label', 'Live 3D night street race');
    this.renderer.domElement.setAttribute('role', 'img');
    this.renderer.domElement.style.touchAction = 'none';
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(62, 1, 0.1, 1500);
    this.camera.position.set(0, 2.32, 7.15);
    this.camera.lookAt(0, 1.08, -15);
    this.updateFraming();

    this.asphalt = makeAsphaltTexture();
    this.glowLime = makeGlowTexture('rgba(200,246,90,.9)');
    this.glowRed = makeGlowTexture('rgba(255,74,56,.95)');
    this.poolGlow = makeGlowTexture('rgba(255,214,150,.9)');
    this.shadowTexture = makeShadowTexture();

    this.scene.fog = new THREE.Fog(FOG_COLOR, 70, 540);
    this.buildEnvironment();
    this.buildSky();
    this.buildCity();
    this.buildGantries();
    this.buildPlayer();
    this.buildTraffic();
    this.buildParticles();
    this.buildLights();

    if (this.lowPower) {
      this.composer = null;
    } else {
      this.composer = new EffectComposer(this.renderer);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.48, 0.42, 0.92);
      this.composer.addPass(bloom);
      this.composer.addPass(new OutputPass());
    }

    this.updateScenery(0);
    this.resize();
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(container);
    }
    window.addEventListener('resize', this.handleResize);

    this.emitHud(true);
    this.raf = requestAnimationFrame(this.loop);
  }

  setPaused(paused: boolean) {
    this.paused = paused;
    this.lastFrame = performance.now();
  }

  restart() {
    this.phase = 'countdown';
    this.countdown = COUNTDOWN_SECONDS;
    this.time = 0;
    this.score = 0;
    this.distance = 0;
    this.speed = 0;
    this.topSpeed = 0;
    this.nitro = 100;
    this.boosting = false;
    this.steer = 0;
    this.lateral = LANES[2];
    this.message = '';
    this.messageTtl = 0;
    this.crashReason = null;
    this.crashShake = 0;
    this.paused = false;
    this.clearControls();
    this.player.position.set(this.lateral, 0, 0);
    this.player.rotation.set(0, 0, 0);
    this.camX = this.lateral;
    this.camera.fov = 62;
    this.camera.updateProjectionMatrix();
    for (let index = 0; index < this.traffic.length; index++) {
      this.placeTraffic(this.traffic[index], -60 - index * 38 - Math.random() * 24, true);
    }
    this.emitHud(true);
  }

  clearControls() {
    for (const key of Object.keys(this.controls) as (keyof RacerControls)[]) this.controls[key] = false;
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.resizeObserver?.disconnect();
    window.removeEventListener('resize', this.handleResize);
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    const textures = new Set<THREE.Texture>();
    this.scene.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (mesh.geometry) geometries.add(mesh.geometry);
      const material = mesh.material;
      if (!material) return;
      for (const entry of Array.isArray(material) ? material : [material]) {
        materials.add(entry);
        for (const value of Object.values(entry as unknown as Record<string, unknown>)) {
          if (value instanceof THREE.Texture) textures.add(value);
        }
      }
    });
    for (const texture of textures) texture.dispose();
    for (const material of materials) material.dispose();
    for (const geometry of geometries) geometry.dispose();
    this.envTexture?.dispose();
    this.composer?.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }

  private buildEnvironment() {
    const texture = canvasTexture(512, 256, (ctx, width, height) => {
      const sky = ctx.createLinearGradient(0, 0, 0, height);
      sky.addColorStop(0, '#04060d');
      sky.addColorStop(0.42, '#131a2e');
      sky.addColorStop(0.58, '#392240');
      sky.addColorStop(0.66, '#120d18');
      sky.addColorStop(1, '#030406');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, width, height);
      const blobs: [number, number, number, string][] = [
        [0.08, 0.56, 90, 'rgba(255,94,96,.5)'],
        [0.28, 0.54, 70, 'rgba(200,246,90,.45)'],
        [0.52, 0.58, 100, 'rgba(96,170,255,.4)'],
        [0.74, 0.55, 80, 'rgba(255,176,84,.45)'],
        [0.93, 0.57, 90, 'rgba(180,110,255,.4)'],
      ];
      for (const [x, y, radius, color] of blobs) {
        const glow = ctx.createRadialGradient(x * width, y * height, 0, x * width, y * height, radius);
        glow.addColorStop(0, color);
        glow.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = glow;
        ctx.fillRect(0, 0, width, height);
      }
    });
    texture.mapping = THREE.EquirectangularReflectionMapping;
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const target = pmrem.fromEquirectangular(texture);
    this.scene.environment = target.texture;
    this.scene.environmentIntensity = 0.6;
    this.envTexture = target.texture;
    pmrem.dispose();
    texture.dispose();
  }

  private buildSky() {
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(960, 32, 18),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        depthTest: false,
        fog: false,
        vertexShader: `
          varying vec3 vWorld;
          void main() {
            vec4 world = modelMatrix * vec4(position, 1.0);
            vWorld = world.xyz;
            gl_Position = projectionMatrix * viewMatrix * world;
          }
        `,
        fragmentShader: `
          varying vec3 vWorld;
          void main() {
            float height = normalize(vWorld - cameraPosition).y;
            vec3 low = vec3(0.16, 0.075, 0.14);
            vec3 mid = vec3(0.028, 0.042, 0.095);
            vec3 high = vec3(0.004, 0.007, 0.018);
            vec3 color = mix(low, mid, smoothstep(-0.03, 0.2, height));
            color = mix(color, high, smoothstep(0.16, 0.7, height));
            color += vec3(0.06, 0.022, 0.045) * pow(max(0.0, 1.0 - abs(height)), 10.0);
            gl_FragColor = vec4(color, 1.0);
          }
        `,
      }),
    );
    sky.renderOrder = -10;
    sky.frustumCulled = false;
    this.scene.add(sky);

    const rng = makeRng(21);
    const positions = new Float32Array(520 * 3);
    for (let i = 0; i < 520; i++) {
      const phi = rng() * Math.PI * 2;
      const elevation = 0.06 + rng() * 1.23;
      const radius = 820;
      positions[i * 3] = Math.cos(elevation) * Math.cos(phi) * radius;
      positions[i * 3 + 1] = Math.sin(elevation) * radius;
      positions[i * 3 + 2] = Math.cos(elevation) * Math.sin(phi) * radius;
    }
    const starGeometry = new THREE.BufferGeometry();
    starGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const stars = new THREE.Points(starGeometry, new THREE.PointsMaterial({
      color: 0xc9ddff,
      size: 1.7,
      sizeAttenuation: false,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
      fog: false,
    }));
    stars.renderOrder = -9;
    this.scene.add(stars);

    const moon = new THREE.Sprite(new THREE.SpriteMaterial({
      map: makeMoonTexture(),
      transparent: true,
      depthWrite: false,
      fog: false,
      toneMapped: false,
    }));
    moon.position.set(150, 148, -760);
    moon.scale.set(150, 150, 1);
    moon.renderOrder = -8;
    this.scene.add(moon);
  }

  private buildCity() {
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(620, 1600),
      new THREE.MeshStandardMaterial({ color: 0x05070a, roughness: 1, metalness: 0 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, -0.06, -560);
    this.scene.add(ground);

    const road = new THREE.Mesh(
      new THREE.PlaneGeometry(ROAD_HALF * 2, 1000),
      new THREE.MeshStandardMaterial({ map: this.asphalt, roughness: 0.56, metalness: 0.18, envMapIntensity: 0.45 }),
    );
    road.rotation.x = -Math.PI / 2;
    road.position.set(0, 0, -480);
    this.scene.add(road);

    const railMaterial = new THREE.MeshStandardMaterial({ color: 0x141a20, roughness: 0.55, metalness: 0.7, envMapIntensity: 0.7 });
    for (const side of [-1, 1]) {
      const rail = new THREE.Mesh(this.boxGeometry, railMaterial);
      rail.scale.set(0.28, 0.86, 1000);
      rail.position.set(side * 10.05, 0.43, -480);
      this.scene.add(rail);

      const curb = new THREE.Mesh(this.boxGeometry, new THREE.MeshStandardMaterial({ color: 0x1a1e22, roughness: 0.8 }));
      curb.scale.set(0.5, 0.14, 1000);
      curb.position.set(side * 9.2, 0.07, -480);
      this.scene.add(curb);

      const edgeGlow = new THREE.Mesh(this.boxGeometry, new THREE.MeshBasicMaterial({
        color: new THREE.Color(0.62, 1.45, 0.28),
        toneMapped: false,
      }));
      edgeGlow.scale.set(0.1, 0.03, 1000);
      edgeGlow.position.set(side * 8.78, 0.04, -480);
      this.scene.add(edgeGlow);
    }

    // Roadside lamps: poles, arms, heads and pools of light.
    const lampCount = 18;
    const poleMaterial = new THREE.MeshStandardMaterial({ color: 0x11161b, roughness: 0.5, metalness: 0.8 });
    this.lampPoles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.08, 0.11, 7.2, 6), poleMaterial, lampCount);
    this.lampArms = new THREE.InstancedMesh(this.boxGeometry, poleMaterial, lampCount);
    this.lampHeads = new THREE.InstancedMesh(this.boxGeometry, new THREE.MeshBasicMaterial({
      color: new THREE.Color(2.6, 1.9, 1.1),
      toneMapped: false,
    }), lampCount);
    const poolGeometry = new THREE.PlaneGeometry(11, 20);
    poolGeometry.rotateX(-Math.PI / 2);
    this.lampPools = new THREE.InstancedMesh(poolGeometry, new THREE.MeshBasicMaterial({
      map: this.poolGlow,
      color: 0xffe6c2,
      transparent: true,
      opacity: 0.1,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    }), lampCount);
    for (const mesh of [this.lampPoles, this.lampArms, this.lampHeads, this.lampPools]) {
      mesh.frustumCulled = false;
      this.scene.add(mesh);
    }
    for (let i = 0; i < lampCount; i++) {
      this.lamps.push({ z: -14 - i * 32, side: i % 2 === 0 ? 1 : -1 });
    }

    // Distant towers with lit windows.
    const variants = [
      makeFacadeTexture(31, true),
      makeFacadeTexture(74, false),
      makeFacadeTexture(113, true),
    ];
    const rng = makeRng(1987);
    variants.forEach((texture, variantIndex) => {
      const material = new THREE.MeshStandardMaterial({
        map: texture,
        emissive: new THREE.Color(1, 1, 1),
        emissiveMap: texture,
        emissiveIntensity: 1.1,
        roughness: 0.9,
        metalness: 0.08,
      });
      const count = 24;
      const mesh = new THREE.InstancedMesh(this.boxGeometry, material, count);
      mesh.frustumCulled = false;
      this.scene.add(mesh);
      const items: Building[] = [];
      for (let i = 0; i < count; i++) {
        const side = rng() > 0.5 ? 1 : -1;
        const width = 9 + rng() * 16;
        const depth = 9 + rng() * 14;
        items.push({
          x: side * (25 + rng() * 34 + width / 2),
          z: -26 - rng() * 570,
          width,
          height: 16 + rng() * (variantIndex === 1 ? 100 : 66),
          depth,
          rotation: (rng() - 0.5) * 0.22,
          lane: variantIndex,
        });
      }
      this.buildings.push({ mesh, items });
    });

    // Neon billboards.
    const texts: [string, string][] = [
      ['REDLINE', '#c8f65a'],
      ['AFTERDARK', '#ff5f6d'],
      ['NIGHT RUN', '#6bd5ff'],
      ['TOKYO 01', '#ffd166'],
      ['NO LIMITS', '#b18dff'],
      ['OWN THE NIGHT', '#c8f65a'],
    ];
    texts.forEach(([text, color], index) => {
      const group = new THREE.Group();
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(8, 4), new THREE.MeshBasicMaterial({
        map: makeSignTexture(text, color),
        toneMapped: false,
      }));
      sign.position.y = 10;
      group.add(sign);
      const frame = new THREE.Mesh(this.boxGeometry, new THREE.MeshStandardMaterial({ color: 0x0b0f13, roughness: 0.6, metalness: 0.6 }));
      frame.scale.set(8.35, 4.35, 0.18);
      frame.position.set(0, 10, -0.13);
      group.add(frame);
      const pole = new THREE.Mesh(this.poleGeometry, new THREE.MeshStandardMaterial({ color: 0x0d1116, roughness: 0.5, metalness: 0.8 }));
      pole.scale.set(0.7, 1, 0.7);
      pole.position.y = 4;
      group.add(pole);
      const side = index % 2 === 0 ? 1 : -1;
      group.position.set(side * 12.4, 0, -64 - index * 96);
      group.rotation.y = -side * 0.3;
      this.scene.add(group);
      this.signs.push({ z: group.position.z, side, group });
    });
  }

  private buildGantries() {
    const steel = new THREE.MeshStandardMaterial({ color: 0x0e1418, roughness: 0.55, metalness: 0.75, envMapIntensity: 0.7 });
    const stripMaterial = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.7, 1.6, 0.35), toneMapped: false });
    const panelMaterials = ['REDLINE', 'SECTOR 04', 'NIGHT RUN'].map(text => new THREE.MeshBasicMaterial({
      map: makeSignTexture(text, '#c8f65a'),
      toneMapped: false,
    }));
    for (let index = 0; index < 3; index++) {
      const group = new THREE.Group();
      for (const side of [-1, 1]) {
        const post = new THREE.Mesh(this.boxGeometry, steel);
        post.scale.set(0.44, 6.9, 0.44);
        post.position.set(side * 10.9, 3.45, 0);
        group.add(post);
        const brace = new THREE.Mesh(this.boxGeometry, steel);
        brace.scale.set(0.16, 1.5, 0.16);
        brace.position.set(side * 10.1, 5.5, 0);
        brace.rotation.z = side * 0.7;
        group.add(brace);
      }
      const beam = new THREE.Mesh(this.boxGeometry, steel);
      beam.scale.set(22.2, 0.62, 0.6);
      beam.position.set(0, 6.9, 0);
      group.add(beam);
      const strip = new THREE.Mesh(this.boxGeometry, stripMaterial);
      strip.scale.set(21.6, 0.07, 0.09);
      strip.position.set(0, 6.56, 0.34);
      group.add(strip);
      const panel = new THREE.Mesh(new THREE.PlaneGeometry(7.4, 3.7), panelMaterials[index % panelMaterials.length]);
      panel.position.set(0, 8.9, 0.1);
      group.add(panel);
      const panelBack = new THREE.Mesh(this.boxGeometry, steel);
      panelBack.scale.set(7.7, 4, 0.16);
      panelBack.position.set(0, 8.9, 0);
      group.add(panelBack);
      group.position.set(0, 0, -110 - index * 192);
      this.scene.add(group);
      this.gantries.push({ group, overhead: false });
    }
  }

  /** Overhead gantries would cover the chase camera; fade their crossbeam instead of clipping through it. */
  private updateGantryVisibility() {
    for (const gantry of this.gantries) {
      const z = gantry.group.position.z;
      const close = z > -30 && z < 20;
      const building = z > -170 && z < -30;
      gantry.group.visible = !close;
      const factor = close ? 0 : building ? Math.max(0.35, (z + 170) / 140) : 1;
      gantry.group.traverse(object => {
        const mesh = object as THREE.Mesh;
        const materials = mesh.material ? (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) : [];
        for (const material of materials) {
          if (material.userData.baseOpacity === undefined) {
            material.transparent = true;
            material.userData.baseOpacity = material.opacity ?? 1;
          }
          material.opacity = material.userData.baseOpacity * factor;
        }
      });
    }
  }

  private buildPlayer() {
    const paint = new THREE.MeshPhysicalMaterial({
      color: 0xd9ff57,
      metalness: 0.46,
      roughness: 0.24,
      clearcoat: 1,
      clearcoatRoughness: 0.12,
      envMapIntensity: 1.5,
    });
    const carbon = new THREE.MeshStandardMaterial({ color: 0x0b0e11, metalness: 0.6, roughness: 0.45 });
    const glass = new THREE.MeshPhysicalMaterial({
      color: 0x0a1219,
      metalness: 0.85,
      roughness: 0.06,
      clearcoat: 1,
      envMapIntensity: 1.7,
    });
    this.glassMaterial = new THREE.MeshStandardMaterial({ color: 0x0a1018, metalness: 0.8, roughness: 0.14 });
    const tire = new THREE.MeshStandardMaterial({ color: 0x070809, roughness: 0.96, metalness: 0 });
    const rim = new THREE.MeshStandardMaterial({ color: 0xbfc9d4, metalness: 1, roughness: 0.22, envMapIntensity: 1.4 });
    const headlight = new THREE.MeshBasicMaterial({ color: new THREE.Color(4.2, 4.2, 3.7), toneMapped: false });
    this.brakeLight = new THREE.MeshBasicMaterial({ color: new THREE.Color(4.6, 0.22, 0.18), toneMapped: false });
    const flame = new THREE.SpriteMaterial({
      map: this.glowLime,
      color: 0x9fe8ff,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });

    this.player = new THREE.Group();
    this.scene.add(this.player);

    const profile = new THREE.Shape();
    profile.moveTo(2.3, 0.26);
    profile.lineTo(2.36, 0.46);
    profile.quadraticCurveTo(2.12, 0.64, 1.4, 0.7);
    profile.lineTo(0.45, 0.76);
    profile.lineTo(-1.72, 0.82);
    profile.quadraticCurveTo(-2.1, 0.84, -2.24, 0.72);
    profile.lineTo(-2.2, 0.4);
    profile.quadraticCurveTo(-2.16, 0.2, -1.92, 0.19);
    profile.lineTo(1.92, 0.19);
    profile.lineTo(2.24, 0.21);
    profile.closePath();
    const bodyGeometry = new THREE.ExtrudeGeometry(profile, {
      depth: 1.76,
      bevelEnabled: true,
      bevelSize: 0.05,
      bevelThickness: 0.05,
      bevelSegments: 2,
      steps: 1,
    });
    bodyGeometry.translate(0, 0, -1.76 / 2);
    bodyGeometry.rotateY(-Math.PI / 2);
    bodyGeometry.computeVertexNormals();
    const body = new THREE.Mesh(bodyGeometry, paint);
    this.player.add(body);

    const cabinGeometry = new THREE.BoxGeometry(1.6, 0.52, 1.98);
    const cabinPosition = cabinGeometry.attributes.position;
    for (let i = 0; i < cabinPosition.count; i++) {
      if (cabinPosition.getY(i) > 0) {
        cabinPosition.setX(i, cabinPosition.getX(i) * 0.72);
        cabinPosition.setZ(i, cabinPosition.getZ(i) * 0.6 - 0.1);
      }
    }
    cabinGeometry.computeVertexNormals();
    const cabin = new THREE.Mesh(cabinGeometry, glass);
    cabin.position.set(0, 0.99, -0.22);
    this.player.add(cabin);

    const addPart = (x: number, y: number, z: number, width: number, height: number, depth: number, material: THREE.Material) => {
      const mesh = new THREE.Mesh(this.boxGeometry, material);
      mesh.position.set(x, y, z);
      mesh.scale.set(width, height, depth);
      this.player.add(mesh);
      return mesh;
    };

    addPart(0, 0.15, -2.02, 1.84, 0.08, 0.52, carbon);
    addPart(0, 0.2, 2.05, 1.8, 0.16, 0.34, carbon);
    addPart(-0.92, 0.23, 0, 0.09, 0.12, 2.9, carbon);
    addPart(0.92, 0.23, 0, 0.09, 0.12, 2.9, carbon);
    addPart(0, 0.93, -1.62, 0.32, 0.07, 0.42, carbon);
    addPart(0, 0.93, 1.7, 0.32, 0.07, 0.42, carbon);
    addPart(-0.62, 0.98, 1.86, 0.09, 0.24, 0.1, carbon);
    addPart(0.62, 0.98, 1.86, 0.09, 0.24, 0.1, carbon);
    addPart(0, 1.13, 1.9, 1.76, 0.06, 0.36, carbon);
    addPart(-0.95, 0.94, -0.5, 0.14, 0.07, 0.22, carbon);
    addPart(0.95, 0.94, -0.5, 0.14, 0.07, 0.22, carbon);
    addPart(0, 0.47, 2.24, 1.62, 0.085, 0.05, this.brakeLight);
    const accent = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.8, 1.7, 0.34), toneMapped: false });
    addPart(-0.97, 0.5, 0.2, 0.035, 0.04, 2.4, accent);
    addPart(0.97, 0.5, 0.2, 0.035, 0.04, 2.4, accent);
    addPart(-0.5, 0.85, -1.05, 0.6, 0.03, 0.7, carbon);
    addPart(0.5, 0.85, -1.05, 0.6, 0.03, 0.7, carbon);
    addPart(-0.62, 0.56, -2.3, 0.44, 0.08, 0.06, headlight);
    addPart(0.62, 0.56, -2.3, 0.44, 0.08, 0.06, headlight);
    addPart(0, 0.3, 2.28, 0.9, 0.16, 0.05, carbon);

    const exhaustGeometry = new THREE.CylinderGeometry(0.07, 0.08, 0.26, 10);
    exhaustGeometry.rotateX(Math.PI / 2);
    for (const x of [-0.44, 0.44]) {
      const exhaust = new THREE.Mesh(exhaustGeometry, rim);
      exhaust.position.set(x, 0.31, 2.32);
      this.player.add(exhaust);
    }

    for (const x of [-0.44, 0.44]) {
      const flameMesh = new THREE.Sprite(flame.clone());
      flameMesh.position.set(x, 0.31, 2.42);
      flameMesh.visible = false;
      flameMesh.scale.set(0.7, 0.7, 1);
      this.player.add(flameMesh);
      this.flames.push(flameMesh);
    }

    const wheelGeometry = new THREE.CylinderGeometry(0.37, 0.37, 0.3, 20);
    wheelGeometry.rotateZ(Math.PI / 2);
    const rimGeometry = new THREE.CylinderGeometry(0.235, 0.235, 0.31, 14);
    rimGeometry.rotateZ(Math.PI / 2);
    const ringGeometry = new THREE.TorusGeometry(0.26, 0.018, 6, 24);
    ringGeometry.rotateY(Math.PI / 2);
    const ringMaterial = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.9, 1.8, 0.35), toneMapped: false });
    const wheelPlacements: [number, number, number][] = [
      [-0.88, 0.37, -1.44],
      [0.88, 0.37, -1.44],
      [-0.9, 0.37, 1.48],
      [0.9, 0.37, 1.48],
    ];
    for (const [x, y, z] of wheelPlacements) {
      const wheel = new THREE.Group();
      wheel.position.set(x, y, z);
      wheel.add(new THREE.Mesh(wheelGeometry, tire));
      wheel.add(new THREE.Mesh(rimGeometry, rim));
      const ring = new THREE.Mesh(ringGeometry, ringMaterial);
      ring.position.x = Math.sign(x) * 0.16;
      wheel.add(ring);
      this.player.add(wheel);
      this.wheels.push(wheel);
    }

    const glowMaterial = new THREE.SpriteMaterial({
      map: this.glowRed,
      color: 0xff7a58,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
      opacity: 0.85,
    });
    for (const x of [-0.66, 0.66]) {
      const glow = new THREE.Sprite(glowMaterial);
      glow.position.set(x, 0.47, 2.32);
      glow.scale.set(1.15, 1.15, 1);
      this.player.add(glow);
    }

    this.spotlight = new THREE.SpotLight(0xd9e9ff, 190, 80, 0.44, 0.65, 1.8);
    this.spotlight.position.set(0, 0.9, -1.9);
    const target = new THREE.Object3D();
    target.position.set(0, -0.4, -42);
    this.player.add(target);
    this.spotlight.target = target;
    this.player.add(this.spotlight);

    this.shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(4.4, 6.6).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: this.shadowTexture, transparent: true, opacity: 0.85, depthWrite: false }),
    );
    this.shadow.position.y = 0.014;
    this.shadow.renderOrder = 1;
    this.shadow.scale.set(1.05, 1, 1);
    this.scene.add(this.shadow);

    this.underglowMaterial = new THREE.MeshBasicMaterial({
      map: this.glowLime,
      transparent: true,
      opacity: 0.22,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    this.underglow = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 7).rotateX(-Math.PI / 2), this.underglowMaterial);
    this.underglow.position.y = 0.02;
    this.underglow.renderOrder = 2;
    this.scene.add(this.underglow);

    this.underLight = new THREE.PointLight(0xc8f65a, 7, 9, 2);
    this.scene.add(this.underLight);

    // A soft key light that travels with the chase camera so the bodywork always reads.
    this.heroLight = new THREE.PointLight(0xfff1dc, 46, 26, 2);
    this.scene.add(this.heroLight);
  }

  private buildTraffic() {
    const colors = [0xe1483a, 0x3f7fe0, 0xe7b04a, 0xd8dde4, 0x7d54e6, 0x39a6a0, 0xb64a76];
    this.trafficMaterials = colors.map(color => new THREE.MeshStandardMaterial({
      color,
      metalness: 0.55,
      roughness: 0.4,
      envMapIntensity: 1.1,
    }));
    const tail = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.1, 0.14, 0.11), toneMapped: false });
    const tailGlow = new THREE.SpriteMaterial({
      map: this.glowRed,
      color: 0xff4a38,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
      opacity: 0.8,
    });
    const bumper = new THREE.MeshStandardMaterial({ color: 0x0a0d10, roughness: 0.6, metalness: 0.5 });
    const rng = makeRng(918);
    for (let index = 0; index < 14; index++) {
      const van = index % 5 === 2;
      const group = new THREE.Group();
      const width = van ? 2.1 : 1.86;
      const length = van ? 5.2 : 4.2;
      const bodyMaterial = this.trafficMaterials[Math.floor(rng() * this.trafficMaterials.length)];
      const body = new THREE.Mesh(this.boxGeometry, bodyMaterial);
      body.scale.set(width, van ? 1.55 : 0.58, length);
      body.position.y = van ? 1.1 : 0.58;
      group.add(body);
      if (!van) {
        const cabin = new THREE.Mesh(this.boxGeometry, this.glassMaterial);
        cabin.scale.set(1.5, 0.44, 1.95);
        cabin.position.set(0, 1, 0.12);
        group.add(cabin);
      }
      const lampBar = new THREE.Mesh(this.boxGeometry, tail);
      lampBar.scale.set(width * 0.72, 0.11, 0.05);
      lampBar.position.set(0, van ? 0.75 : 0.66, length / 2 + 0.01);
      group.add(lampBar);
      const rearBumper = new THREE.Mesh(this.boxGeometry, bumper);
      rearBumper.scale.set(width + 0.04, 0.17, 0.2);
      rearBumper.position.set(0, van ? 0.35 : 0.3, length / 2 - 0.06);
      group.add(rearBumper);
      for (const x of [-width * 0.34, width * 0.34]) {
        const glow = new THREE.Sprite(tailGlow);
        glow.position.set(x, van ? 0.8 : 0.68, length / 2 + 0.06);
        glow.scale.set(1.25, 1.25, 1);
        group.add(glow);
      }
      if (van) {
        const topper = new THREE.Mesh(this.boxGeometry, new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 2.2, 0.5), toneMapped: false }));
        topper.scale.set(width * 0.5, 0.14, 0.1);
        topper.position.set(0, 1.95, length / 2 - 0.1);
        group.add(topper);
      }
      this.scene.add(group);
      this.traffic.push({
        group,
        body,
        x: 0,
        z: 0,
        speed: 45,
        halfWidth: width / 2,
        halfLength: length / 2,
        lane: 0,
        passed: false,
      });
      this.placeTraffic(this.traffic[index], -64 - index * 36 - rng() * 22, true);
    }
  }

  private buildParticles() {
    const rng = makeRng(551);
    this.dustPositions = new Float32Array(170 * 3);
    for (let i = 0; i < 170; i++) {
      this.dustPositions[i * 3] = (rng() - 0.5) * 46;
      this.dustPositions[i * 3 + 1] = 0.4 + rng() * 13;
      this.dustPositions[i * 3 + 2] = -132 + rng() * 112;
    }
    const dustGeometry = new THREE.BufferGeometry();
    dustGeometry.setAttribute('position', new THREE.BufferAttribute(this.dustPositions, 3));
    this.dust = new THREE.Points(dustGeometry, new THREE.PointsMaterial({
      color: 0xb5c9e4,
      map: makeDustTexture(),
      size: 0.7,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    }));
    this.dust.frustumCulled = false;
    this.scene.add(this.dust);

    const lines = 52;
    this.boostLinePositions = new Float32Array(lines * 6);
    this.boostLineLengths = [];
    for (let i = 0; i < lines; i++) {
      const x = (rng() - 0.5) * 20;
      const y = 0.9 + rng() * 5.4;
      const z = -136 + rng() * 112;
      const length = 2.4 + rng() * 6;
      this.boostLineLengths.push(length);
      this.boostLinePositions[i * 6] = x;
      this.boostLinePositions[i * 6 + 1] = y;
      this.boostLinePositions[i * 6 + 2] = z;
      this.boostLinePositions[i * 6 + 3] = x;
      this.boostLinePositions[i * 6 + 4] = y;
      this.boostLinePositions[i * 6 + 5] = z - length;
    }
    const boostGeometry = new THREE.BufferGeometry();
    boostGeometry.setAttribute('position', new THREE.BufferAttribute(this.boostLinePositions, 3));
    this.boostLines = new THREE.LineSegments(boostGeometry, new THREE.LineBasicMaterial({
      color: 0xc8f65a,
      transparent: true,
      opacity: 0.34,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    }));
    this.boostLines.frustumCulled = false;
    this.boostLines.visible = false;
    this.scene.add(this.boostLines);
  }

  private buildLights() {
    this.scene.add(new THREE.HemisphereLight(0x5d74a5, 0x06080c, 0.85));
    this.scene.add(new THREE.AmbientLight(0x26314a, 0.85));
    const moonLight = new THREE.DirectionalLight(0xa7c1ff, 1.05);
    moonLight.position.set(30, 60, 40);
    this.scene.add(moonLight);
    const cityGlow = new THREE.PointLight(0xff6d4e, 700, 220, 2);
    cityGlow.position.set(-35, 18, -85);
    this.scene.add(cityGlow);
    const cityGlow2 = new THREE.PointLight(0x6ea8ff, 620, 240, 2);
    cityGlow2.position.set(38, 22, -180);
    this.scene.add(cityGlow2);
  }

  private handleResize = () => this.resize();

  private updateFraming() {
    const aspect = this.camera.aspect;
    const portrait = aspect < 1.15;
    this.camDistance = portrait ? 9.2 : aspect < 1.55 ? 7.9 : 7.15;
    this.camHeight = portrait ? 2.75 : 2.32;
    this.camera.fov = portrait ? 68 : 62;
    this.camera.updateProjectionMatrix();
  }

  private resize() {
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    const maxDpr = this.lowPower ? 1.35 : 1.85;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxDpr));
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.updateFraming();
    this.camera.updateProjectionMatrix();
    if (this.composer) {
      this.composer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxDpr));
      this.composer.setSize(width, height);
    }
  }

  private placeTraffic(car: TrafficCar, z: number, initial = false) {
    let lane = Math.floor(Math.random() * LANES.length);
    // Never spawn a wall of traffic directly in the player's lane on the opening stretch.
    if (initial && z > -200) {
      const playerLane = LANES.findIndex(value => Math.abs(value - this.lateral) < 1.6);
      if (lane === playerLane) lane = (lane + 2) % LANES.length;
    }
    car.lane = lane;
    car.x = LANES[lane] + (Math.random() - 0.5) * 0.5;
    car.z = z;
    car.speed = 42 + Math.random() * 48;
    car.passed = false;
    car.group.position.set(car.x, 0, car.z);
    if (!initial) {
      car.body.material = this.trafficMaterials[Math.floor(Math.random() * this.trafficMaterials.length)];
    }
  }

  private setMessage(text: string, ttl: number) {
    this.message = text;
    this.messageTtl = ttl;
    this.emitHud(true);
  }

  private crash(reason: CrashReason) {
    if (this.phase !== 'racing') return;
    this.phase = 'over';
    this.crashReason = reason;
    this.crashAt = this.elapsed;
    this.crashShake = 1.1;
    this.boosting = false;
    this.speed = 0;
    this.clearControls();
    this.message = '';
    this.messageTtl = 0;
    const result: RacerResult = {
      score: Math.round(this.score),
      time: this.time,
      distance: Math.round(this.distance),
      topSpeed: Math.round(this.topSpeed),
      reason,
    };
    this.emitHud(true);
    this.callbacks.onCrash(result);
  }

  private simulate(dt: number) {
    const wantsBoost = this.controls.boost && this.nitro > 0.5;
    this.boosting = wantsBoost && this.speed > 20;
    const maxSpeed = this.boosting ? 334 : 292;

    if (this.controls.gas || wantsBoost) {
      const falloff = 1 - clamp(this.speed / maxSpeed, 0, 1);
      this.speed += (this.boosting ? 76 : 34) * falloff * dt + 4 * dt;
    } else {
      this.speed -= 15 * dt;
    }
    if (this.controls.brake) this.speed -= 96 * dt;
    if (wantsBoost) {
      this.nitro = Math.max(0, this.nitro - 27 * dt);
      this.speed += 54 * dt * (1 - clamp(this.speed / 350, 0, 1));
    } else {
      this.nitro = Math.min(100, this.nitro + 8.5 * dt);
    }
    this.speed = clamp(this.speed, 0, 340);
    this.topSpeed = Math.max(this.topSpeed, this.speed);

    const steerTarget = ((this.controls.left ? -1 : 0) + (this.controls.right ? 1 : 0)) * 9.5;
    this.steer = damp(this.steer, steerTarget, 6.5, dt);
    this.lateral = clamp(this.lateral + this.steer * dt, -7.9, 7.9);
    if (this.lateral >= 7.9 || this.lateral <= -7.9) {
      if (this.speed > 118) {
        this.crash('wall');
        return;
      }
      this.speed *= 0.97;
    }

    const travelled = (this.speed / 3.6) * dt;
    this.distance += travelled;
    this.time += dt;
    this.score += (this.speed * 0.55 + (this.boosting ? 55 : 0)) * dt;

    if (this.nitro <= 0) this.boosting = false;

    for (const car of this.traffic) {
      const previousZ = car.z;
      car.z += ((this.speed - car.speed) / 3.6) * dt;
      car.group.position.z = car.z;
      const lateralGap = Math.abs(car.x - this.lateral);
      if (Math.abs(car.z) < car.halfLength + 2.1 && lateralGap < car.halfWidth + 0.9) {
        this.crash('traffic');
        return;
      }
      if (!car.passed && previousZ < 0 && car.z >= 0) {
        car.passed = true;
        if (lateralGap < 4.2) {
          this.score += 150;
          this.setMessage('NEAR MISS  +150', 1.1);
        }
      }
      if (car.z > 24 || car.z < -640) {
        this.placeTraffic(car, -520 - Math.random() * 120);
      }
    }
  }

  private updateScenery(dt: number) {
    const travelled = (this.speed / 3.6) * dt;
    if (this.speed > 0.2) {
      this.asphalt.offset.y = (this.asphalt.offset.y + travelled / 26) % 1;
    }

    for (const group of this.buildings) {
      group.items.forEach((building, index) => {
        building.z += travelled;
        if (building.z > 36) building.z -= 606;
        this.dummy.position.set(building.x, building.height / 2, building.z);
        this.dummy.rotation.set(0, building.rotation, 0);
        this.dummy.scale.set(building.width, building.height, building.depth);
        this.dummy.updateMatrix();
        group.mesh.setMatrixAt(index, this.dummy.matrix);
      });
      group.mesh.instanceMatrix.needsUpdate = true;
    }

    for (const lamp of this.lamps) {
      lamp.z += travelled;
      if (lamp.z > 30) lamp.z -= 576;
    }
    this.lamps.forEach((lamp, index) => {
      const side = lamp.side;
      this.dummy.rotation.set(0, 0, 0);
      this.dummy.scale.set(1, 1, 1);
      this.dummy.position.set(side * 10.55, 3.6, lamp.z);
      this.dummy.updateMatrix();
      this.lampPoles.setMatrixAt(index, this.dummy.matrix);

      this.dummy.position.set(side * 9.45, 7.08, lamp.z);
      this.dummy.scale.set(2.3, 0.11, 0.11);
      this.dummy.updateMatrix();
      this.lampArms.setMatrixAt(index, this.dummy.matrix);

      this.dummy.position.set(side * 8.3, 7.05, lamp.z);
      this.dummy.scale.set(0.94, 0.13, 0.42);
      this.dummy.updateMatrix();
      this.lampHeads.setMatrixAt(index, this.dummy.matrix);

      this.dummy.position.set(side * 6.9, 0.025, lamp.z);
      this.dummy.scale.set(1, 1, 1);
      this.dummy.updateMatrix();
      this.lampPools.setMatrixAt(index, this.dummy.matrix);
    });
    for (const mesh of [this.lampPoles, this.lampArms, this.lampHeads, this.lampPools]) mesh.instanceMatrix.needsUpdate = true;

    for (const sign of this.signs) {
      sign.z += travelled;
      if (sign.z > 26) sign.z -= 576;
      sign.group.position.z = sign.z;
    }

    for (const gantry of this.gantries) {
      gantry.group.position.z += travelled;
      if (gantry.group.position.z > 24) gantry.group.position.z -= 576;
    }
    this.updateGantryVisibility();

    if (this.speed > 1) {
      for (let i = 0; i < this.dustPositions.length / 3; i++) {
        let z = this.dustPositions[i * 3 + 2] + travelled * 1.05;
        if (z > -18) z -= 132;
        this.dustPositions[i * 3 + 2] = z;
      }
      this.dust.geometry.attributes.position.needsUpdate = true;
    }

    this.boostLines.visible = this.boosting;
    if (this.boosting) {
      const travel = travelled * 2.4 + 30 * dt;
      for (let i = 0; i < this.boostLineLengths.length; i++) {
        let z = this.boostLinePositions[i * 6 + 2] + travel;
        if (z > -14) z -= 122;
        this.boostLinePositions[i * 6 + 2] = z;
        this.boostLinePositions[i * 6 + 5] = z - this.boostLineLengths[i];
      }
      this.boostLines.geometry.attributes.position.needsUpdate = true;
    }
  }

  private updateCar(dt: number) {
    const speedFactor = clamp(this.speed / 320, 0, 1);
    this.player.position.x = this.lateral;
    if (this.phase !== 'over') {
      const bounce = Math.sin(this.elapsed * 17) * 0.008 * speedFactor + Math.sin(this.elapsed * 9.3) * 0.005;
      this.player.position.y = bounce;
      this.player.rotation.z = -this.steer * 0.011;
      this.player.rotation.y = -this.steer * 0.009;
      const pitch = (this.controls.gas ? 0.012 : 0) - (this.controls.brake ? 0.02 : 0);
      this.player.rotation.x = damp(this.player.rotation.x, pitch, 4, dt);
      const wheelSpeed = (this.speed / 3.6) / 0.37;
      for (const wheel of this.wheels) wheel.rotation.x -= wheelSpeed * dt;
    } else {
      const since = this.elapsed - this.crashAt;
      this.player.rotation.z = damp(this.player.rotation.z, this.crashReason === 'wall' ? -Math.sign(this.lateral || 1) * 0.16 : 0.1, 5, dt);
      this.player.rotation.y = Math.sin(since * 5) * 0.06;
      this.player.position.y = Math.sin(Math.min(since * 7, Math.PI)) * 0.05;
    }

    this.brakeLight.color.setRGB(this.controls.brake && this.phase === 'racing' ? 8 : 4.4, this.controls.brake ? 0.36 : 0.21, this.controls.brake ? 0.28 : 0.17);
    const flicker = 0.78 + Math.random() * 0.34;
    for (const flame of this.flames) {
      flame.visible = this.boosting;
      const width = 0.62 * flicker;
      flame.scale.set(width, 0.62 * flicker, 1);
    }

    this.shadow.position.x = this.lateral;
    this.underglow.position.x = this.lateral;
    this.underglowMaterial.opacity = 0.16 + speedFactor * 0.16;
    this.underLight.position.set(this.lateral, 0.5, 0.2);

    const shakeStrength = this.reduceShake ? 0 : 1;
    this.crashShake = Math.max(0, this.crashShake - dt * 1.4);
    const speedShake = (speedFactor * 0.012 + (this.boosting ? 0.022 : 0)) * shakeStrength + this.crashShake * 0.11;
    const shakeX = (Math.sin(this.elapsed * 47) + Math.sin(this.elapsed * 61.3)) * speedShake * 0.5;
    const shakeY = (Math.sin(this.elapsed * 53.7) + Math.cos(this.elapsed * 71.1)) * speedShake * 0.3;
    this.camX = damp(this.camX, this.lateral * 0.58, 5, dt);
    const fovTarget = (this.camera.aspect < 1.15 ? 68 : 62) + speedFactor * ((this.camera.aspect < 1.15 ? 7 : 9)) + (this.boosting ? 5 : 0);
    this.camera.fov = damp(this.camera.fov, fovTarget, 3.5, dt);
    this.camera.updateProjectionMatrix();
    this.heroLight.position.set(this.camX + 1.6, 3.4, 6.4);
    this.camera.position.set(this.camX + shakeX, this.camHeight + speedFactor * 0.22 + shakeY, this.camDistance - speedFactor * 0.85);
    this.camera.lookAt(this.lateral * 0.7, 1.08, -15 - speedFactor * 8);
    this.camera.rotation.z += -this.steer * 0.0024 + shakeX * 0.02;
  }

  private update(dt: number) {
    this.elapsed += dt;
    if (this.phase === 'countdown') {
      this.countdown = Math.max(0, this.countdown - dt);
      if (this.countdown <= 0) {
        this.phase = 'racing';
        this.message = 'GO!';
        this.messageTtl = 1.15;
        this.emitHud(true);
      }
    } else if (this.phase === 'racing') {
      this.simulate(dt);
    }

    if (this.phase === 'racing') this.updateScenery(dt);
    this.updateCar(dt);

    if (this.messageTtl > 0) {
      this.messageTtl -= dt;
      if (this.messageTtl <= 0) {
        this.message = '';
        this.emitHud(true);
      }
    }
    this.emitHud();
  }

  private emitHud(force = false) {
    const now = performance.now();
    const countdown = this.phase === 'countdown' ? Math.min(3, Math.max(1, Math.ceil(this.countdown))) : 0;
    if (!force && countdown === this.lastCountdown && now - this.lastHud < 90) return;
    this.lastHud = now;
    this.lastCountdown = countdown;
    this.callbacks.onHud({
      phase: this.phase,
      countdown,
      speed: Math.round(this.speed),
      score: Math.round(this.score),
      time: this.time,
      distance: Math.round(this.distance),
      nitro: Math.round(this.nitro),
      boosting: this.boosting,
      message: this.message,
    });
  }

  private loop = (now: number) => {
    this.raf = requestAnimationFrame(this.loop);
    if (!this.lastFrame) this.lastFrame = now;
    const realDt = Math.min(0.25, Math.max(0, (now - this.lastFrame) / 1000));
    this.lastFrame = now;
    if (!this.paused) {
      // Fixed-step simulation keeps the run speed tied to wall-clock time even at low frame rates.
      this.accumulator += realDt;
      let steps = 0;
      while (this.accumulator >= FIXED_STEP && steps < 15) {
        this.update(FIXED_STEP);
        this.accumulator -= FIXED_STEP;
        steps += 1;
      }
      if (steps === 15) this.accumulator = 0;
    }
    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  };
}
