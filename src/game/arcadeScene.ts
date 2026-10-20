import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

export type Mark = 'X' | 'O';

export interface CellRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface ArcadeSceneState {
  board: (Mark | null)[];
  winning: readonly number[] | null;
  ghost: Mark | null;
  ghostIndex: number | null;
}

export interface ArcadeSceneOptions {
  quality: 'high' | 'low';
  onLayout: (rects: CellRect[]) => void;
}

const PITCH = 1.14;
const CELL_HALF = 0.55;
const BOARD_TOP = 0.13;
const PIECE_Y = 0.56;
const X_HALF = 0.36;
const O_HALF = 0.41;
const LIME = new THREE.Color(0xc8f65a);
const VIOLET = new THREE.Color(0xa06bff);

interface Piece {
  group: THREE.Group;
  mark: Mark;
  index: number;
  born: number;
  materials: THREE.MeshStandardMaterial[];
}

interface Spark {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  life: number;
  maxLife: number;
}

function cellPosition(index: number) {
  return new THREE.Vector3(((index % 3) - 1) * PITCH, BOARD_TOP, (Math.floor(index / 3) - 1) * PITCH);
}

function canvasTexture(size: number, paint: (ctx: CanvasRenderingContext2D, size: number) => void) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D is unavailable');
  paint(ctx, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function glowTexture(color: string) {
  return canvasTexture(256, (ctx, size) => {
    const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, color);
    gradient.addColorStop(0.4, color.replace(/[\d.]+\)$/, '0.28)'));
    gradient.addColorStop(1, color.replace(/[\d.]+\)$/, '0)'));
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
  });
}

function gridFloorTexture() {
  return canvasTexture(512, (ctx, size) => {
    ctx.fillStyle = '#050807';
    ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = 'rgba(200,246,90,.16)';
    ctx.lineWidth = 1;
    const step = size / 16;
    for (let i = 0; i <= 16; i++) {
      ctx.beginPath();
      ctx.moveTo(i * step, 0);
      ctx.lineTo(i * step, size);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i * step);
      ctx.lineTo(size, i * step);
      ctx.stroke();
    }
    const vignette = ctx.createRadialGradient(size / 2, size / 2, size * 0.1, size / 2, size / 2, size * 0.5);
    vignette.addColorStop(0, 'rgba(5,8,7,0)');
    vignette.addColorStop(1, 'rgba(5,8,7,.96)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, size, size);
  });
}

export class ArcadeScene {
  private readonly container: HTMLElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly composer: EffectComposer | null;
  private readonly onLayout: (rects: CellRect[]) => void;
  private readonly clock = new THREE.Clock();

  private pieces: Piece[] = [];
  private ghost: THREE.Group | null = null;
  private ghostMark: Mark | null = null;
  private ghostMaterials: THREE.MeshBasicMaterial[] = [];
  private winning: readonly number[] = [];
  private winBar: THREE.Mesh | null = null;
  private winStart = 0;
  private sparks: Spark[] = [];
  private sparkGeometry = new THREE.BufferGeometry();
  private sparkPoints: THREE.Points;
  private dustPositions: Float32Array;
  private dust: THREE.Points;
  private rings: THREE.Mesh[] = [];
  private frameMaterials: THREE.MeshStandardMaterial[] = [];
  private readonly contactTexture: THREE.Texture;
  private raf = 0;
  private resizeObserver: ResizeObserver | null = null;
  private disposed = false;

  constructor(container: HTMLElement, options: ArcadeSceneOptions) {
    this.container = container;
    this.onLayout = options.onLayout;
    const high = options.quality === 'high';

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setClearAlpha(0);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.82;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.domElement.dataset.arcade = 'true';
    this.renderer.domElement.setAttribute('aria-hidden', 'true');
    this.container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 80);
    this.frameBoard();

    this.scene.fog = new THREE.Fog(0x050807, 9, 24);

    this.contactTexture = glowTexture('rgba(255,255,255,.85)');
    this.buildBoard();
    this.buildDecor();

    this.dustPositions = new Float32Array(150 * 3);
    for (let index = 0; index < 150; index++) {
      this.dustPositions[index * 3] = (Math.random() - 0.5) * 16;
      this.dustPositions[index * 3 + 1] = Math.random() * 6 - 0.4;
      this.dustPositions[index * 3 + 2] = (Math.random() - 0.5) * 14;
    }
    const dustGeometry = new THREE.BufferGeometry();
    dustGeometry.setAttribute('position', new THREE.BufferAttribute(this.dustPositions, 3));
    this.dust = new THREE.Points(dustGeometry, new THREE.PointsMaterial({
      color: 0xc8f65a,
      size: 0.035,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }));
    this.scene.add(this.dust);

    this.sparkGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(160 * 3), 3));
    this.sparkPoints = new THREE.Points(this.sparkGeometry, new THREE.PointsMaterial({
      color: 0xd8ff7a,
      size: 0.09,
      map: glowTexture('rgba(255,255,255,.95)'),
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    }));
    this.sparkPoints.frustumCulled = false;
    this.sparkPoints.visible = false;
    this.scene.add(this.sparkPoints);

    this.buildLights();

    if (high) {
      this.composer = new EffectComposer(this.renderer);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      this.composer.addPass(new UnrealBloomPass(new THREE.Vector2(container.clientWidth, container.clientHeight), 0.34, 0.42, 0.96));
      this.composer.addPass(new OutputPass());
    } else {
      this.composer = null;
    }

    this.resize();
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(container);
    }
    window.addEventListener('resize', this.handleResize);
    this.onLayout(this.projectCellRects());

    this.raf = requestAnimationFrame(this.loop);
  }

  /** Mirror the game state into the scene (pieces, ghost preview, win effects). */
  setState(state: ArcadeSceneState) {
    this.syncPieces(state.board);
    this.syncGhost(state.ghost, state.ghostIndex);
    this.syncWin(state.winning);
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.resizeObserver?.disconnect();
    window.removeEventListener('resize', this.handleResize);
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    const textures = new Set<THREE.Texture>();
    this.scene.traverse(object => {
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
    this.composer?.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }

  private buildLights() {
    this.scene.add(new THREE.HemisphereLight(0x86a9c8, 0x05070a, 0.7));
    this.scene.add(new THREE.AmbientLight(0x2a3530, 0.9));
    const key = new THREE.DirectionalLight(0xfff4dd, 1.5);
    key.position.set(3, 8, 5);
    this.scene.add(key);
    const lime = new THREE.PointLight(0xc8f65a, 26, 15, 2);
    lime.position.set(-4.2, 2.6, 2.4);
    this.scene.add(lime);
    const violet = new THREE.PointLight(0x9a6bff, 22, 15, 2);
    violet.position.set(4.2, 2.4, 1.6);
    this.scene.add(violet);
    const front = new THREE.PointLight(0x9ad8ff, 16, 13, 2);
    front.position.set(0, 3.2, 5.4);
    this.scene.add(front);
  }

  private buildBoard() {
    const slab = new THREE.Mesh(
      new THREE.BoxGeometry(4.05, 0.26, 4.05),
      new THREE.MeshPhysicalMaterial({ color: 0x0c1210, roughness: 0.34, metalness: 0.62, clearcoat: 1, clearcoatRoughness: 0.18, envMapIntensity: 0.9 }),
    );
    slab.position.y = BOARD_TOP - 0.13;
    this.scene.add(slab);

    const glass = new THREE.Mesh(
      new THREE.BoxGeometry(3.86, 0.04, 3.86),
      new THREE.MeshPhysicalMaterial({ color: 0x08110d, roughness: 0.16, metalness: 0.4, clearcoat: 1, transparent: true, opacity: 0.94 }),
    );
    glass.position.y = BOARD_TOP - 0.01;
    this.scene.add(glass);

    const gridMaterial = new THREE.MeshStandardMaterial({
      color: 0x0d1a12,
      emissive: LIME,
      emissiveIntensity: 0.55,
      roughness: 0.4,
      metalness: 0.2,
      toneMapped: true,
    });
    this.frameMaterials.push(gridMaterial);
    const line = new THREE.BoxGeometry(3.7, 0.018, 0.022);
    for (const offset of [-PITCH / 2, PITCH / 2]) {
      const horizontal = new THREE.Mesh(line, gridMaterial);
      horizontal.position.set(0, BOARD_TOP + 0.012, offset);
      this.scene.add(horizontal);
      const vertical = new THREE.Mesh(line, gridMaterial);
      vertical.rotation.y = Math.PI / 2;
      vertical.position.set(offset, BOARD_TOP + 0.012, 0);
      this.scene.add(vertical);
    }

    const frame = new THREE.BoxGeometry(3.98, 0.03, 0.05);
    const frameMaterial = new THREE.MeshStandardMaterial({ color: 0x0b1710, emissive: LIME, emissiveIntensity: 0.75, roughness: 0.35, metalness: 0.3 });
    this.frameMaterials.push(frameMaterial);
    for (const [rotation, x, z] of [[0, 0, -1.97], [0, 0, 1.97], [Math.PI / 2, -1.97, 0], [Math.PI / 2, 1.97, 0]] as const) {
      const edge = new THREE.Mesh(frame, frameMaterial);
      edge.rotation.y = rotation;
      edge.position.set(x, BOARD_TOP + 0.02, z);
      this.scene.add(edge);
    }

    const pool = new THREE.Mesh(
      new THREE.PlaneGeometry(13, 13).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: glowTexture('rgba(200,246,90,.75)'), transparent: true, opacity: 0.14, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }),
    );
    pool.position.y = -0.02;
    this.scene.add(pool);
  }

  private buildDecor() {
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(44, 44).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ map: gridFloorTexture(), roughness: 0.95, metalness: 0.1 }),
    );
    floor.position.y = -0.4;
    this.scene.add(floor);

    for (let index = 0; index < 2; index++) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(3.5 + index * 0.55, 0.008, 6, 96),
        new THREE.MeshBasicMaterial({ color: index === 0 ? LIME : VIOLET, transparent: true, opacity: 0.16, toneMapped: false }),
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.02 + index * 0.46;
      this.scene.add(ring);
      this.rings.push(ring);
    }
  }

  private makePieceMark(mark: Mark, index: number, born: number): Piece {
    const group = new THREE.Group();
    const material = new THREE.MeshStandardMaterial({
      color: mark === 'X' ? LIME : VIOLET,
      emissive: mark === 'X' ? LIME : VIOLET,
      emissiveIntensity: mark === 'X' ? 0.5 : 0.45,
      roughness: 0.28,
      metalness: 0.55,
      envMapIntensity: 1.2,
    });
    const materials = [material];
    if (mark === 'X') {
      const bar = new THREE.BoxGeometry(0.74, 0.125, 0.125);
      for (const angle of [Math.PI / 4, -Math.PI / 4]) {
        const mesh = new THREE.Mesh(bar, material);
        mesh.rotation.z = angle;
        group.add(mesh);
      }
    } else {
      const torus = new THREE.Mesh(new THREE.TorusGeometry(0.285, 0.07, 14, 44), material);
      group.add(torus);
    }
    const position = cellPosition(index);
    const half = mark === 'X' ? X_HALF : O_HALF;
    group.position.set(position.x, BOARD_TOP + 0.03 + half, position.z);
    group.rotation.y = 0;
    this.scene.add(group);

    const contact = new THREE.Mesh(
      new THREE.PlaneGeometry(0.92, 0.62).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({
        map: this.contactTexture,
        color: mark === 'X' ? 0xc8f65a : 0xa06bff,
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    );
    contact.position.set(position.x, BOARD_TOP + 0.022, position.z);
    contact.renderOrder = 1;
    this.scene.add(contact);
    group.userData.contact = contact;
    return { group, mark, index, born, materials };
  }

  private makeGhost(mark: Mark) {
    const group = new THREE.Group();
    const material = new THREE.MeshBasicMaterial({
      color: mark === 'X' ? LIME : VIOLET,
      transparent: true,
      opacity: 0.2,
      depthWrite: false,
      toneMapped: false,
    });
    this.ghostMaterials = [material];
    if (mark === 'X') {
      const bar = new THREE.BoxGeometry(0.86, 0.145, 0.145);
      for (const angle of [Math.PI / 4, -Math.PI / 4]) {
        const mesh = new THREE.Mesh(bar, material);
        mesh.rotation.z = angle;
        group.add(mesh);
      }
    } else {
      group.add(new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.078, 10, 32), material));
    }
    return group;
  }

  private syncPieces(board: (Mark | null)[]) {
    for (const piece of [...this.pieces]) {
      if (board[piece.index] !== piece.mark) {
        this.scene.remove(piece.group);
        piece.group.traverse(object => {
          const mesh = object as THREE.Mesh;
          if (mesh.geometry) mesh.geometry.dispose();
        });
        for (const material of piece.materials) material.dispose();
        const contact = piece.group.userData.contact as THREE.Mesh | undefined;
        if (contact) {
          this.scene.remove(contact);
          contact.geometry.dispose();
          (contact.material as THREE.Material).dispose();
        }
        this.pieces = this.pieces.filter(entry => entry !== piece);
      }
    }
    board.forEach((mark, index) => {
      if (!mark) return;
      if (!this.pieces.some(piece => piece.index === index && piece.mark === mark)) {
        this.pieces.push(this.makePieceMark(mark, index, this.clock.getElapsedTime() + index * 0.001));
      }
    });
  }

  private syncGhost(mark: Mark | null, index: number | null) {
    if (!mark || index === null || index < 0) {
      if (this.ghost) {
        this.scene.remove(this.ghost);
        this.ghost.traverse(object => {
          const mesh = object as THREE.Mesh;
          if (mesh.geometry) mesh.geometry.dispose();
        });
        for (const material of this.ghostMaterials) material.dispose();
        this.ghost = null;
        this.ghostMark = null;
      }
      return;
    }
    if (!this.ghost || this.ghostMark !== mark) {
      if (this.ghost) this.scene.remove(this.ghost);
      for (const material of this.ghostMaterials) material.dispose();
      this.ghost = this.makeGhost(mark);
      this.ghostMark = mark;
      this.scene.add(this.ghost);
    }
    const position = cellPosition(index);
    const rest = mark === 'X' ? BOARD_TOP + 0.03 + X_HALF : BOARD_TOP + 0.03 + O_HALF;
    this.ghost.position.set(position.x, rest, position.z);
    this.ghost.userData.restY = rest;
  }

  private syncWin(line: readonly number[] | null) {
    const next = line ?? [];
    const changed = next.join(',') !== this.winning.join(',');
    this.winning = next;
    if (!changed) return;

    if (this.winBar) {
      this.scene.remove(this.winBar);
      (this.winBar.geometry as THREE.BufferGeometry).dispose();
      (this.winBar.material as THREE.Material).dispose();
      this.winBar = null;
    }
    if (next.length !== 3) {
      this.sparks = [];
      this.sparkPoints.visible = false;
      return;
    }

    const first = cellPosition(next[0]);
    const last = cellPosition(next[2]);
    const dx = last.x - first.x;
    const dz = last.z - first.z;
    const length = Math.hypot(dx, dz) + 1.05;
    const bar = new THREE.Mesh(
      new THREE.BoxGeometry(length, 0.045, 0.11),
      new THREE.MeshBasicMaterial({ color: 0xe9ffb0, transparent: true, opacity: 0.9, toneMapped: false }),
    );
    bar.position.set((first.x + last.x) / 2, BOARD_TOP + 0.2, (first.z + last.z) / 2);
    bar.rotation.y = Math.atan2(-dz, dx);
    this.scene.add(bar);
    this.winBar = bar;
    this.winStart = this.clock.getElapsedTime();

    const center = new THREE.Vector3((first.x + last.x) / 2, PIECE_Y, (first.z + last.z) / 2);
    this.sparks = Array.from({ length: 120 }, () => {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1.2 + Math.random() * 2.4;
      return {
        position: center.clone(),
        velocity: new THREE.Vector3(Math.cos(angle) * speed * 0.55, 1.1 + Math.random() * 2.3, Math.sin(angle) * speed * 0.4),
        life: 0,
        maxLife: 0.9 + Math.random() * 0.7,
      };
    });
    this.sparkPoints.visible = true;
  }

  private projectCellRects(): CellRect[] {
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    return Array.from({ length: 9 }, (_, index) => {
      const center = cellPosition(index);
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
        const point = new THREE.Vector3(center.x + dx * CELL_HALF, BOARD_TOP + 0.01, center.z + dz * CELL_HALF).project(this.camera);
        const px = (point.x * 0.5 + 0.5) * width;
        const py = (-point.y * 0.5 + 0.5) * height;
        minX = Math.min(minX, px);
        maxX = Math.max(maxX, px);
        minY = Math.min(minY, py);
        maxY = Math.max(maxY, py);
      }
      return { left: minX, top: minY, width: maxX - minX, height: maxY - minY };
    });
  }

  /** Pull the camera back until the whole slab fits with a comfortable margin, at any aspect ratio. */
  private frameBoard() {
    const half = 2.06;
    const corners: [number, number][] = [[-half, -half], [half, -half], [half, half], [-half, half]];
    const place = (distance: number) => {
      this.camera.position.set(0, distance * 0.7, distance * 0.98);
      this.camera.lookAt(0, BOARD_TOP * 0.6, -0.05);
      this.camera.updateProjectionMatrix();
      this.camera.updateMatrixWorld(true);
    };
    this.camera.updateProjectionMatrix();
    let low = 3;
    let high = 26;
    for (let step = 0; step < 22; step++) {
      const distance = (low + high) / 2;
      place(distance);
      const fits = corners.every(([x, z]) => {
        const point = new THREE.Vector3(x, 0, z).project(this.camera);
        return Math.abs(point.x) <= 0.9 && Math.abs(point.y) <= 0.9;
      });
      if (fits) high = distance;
      else low = distance;
    }
    place(high);
  }

  private resize() {
    if (this.disposed) return;
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    const dpr = Math.min(window.devicePixelRatio || 1, this.composer ? 1.8 : 1.4);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.frameBoard();
    if (this.composer) {
      this.composer.setPixelRatio(dpr);
      this.composer.setSize(width, height);
    }
    this.onLayout(this.projectCellRects());
  }

  private handleResize = () => this.resize();

  private updatePieces(time: number, delta: number) {
    for (const piece of this.pieces) {
      const age = Math.max(0, time - piece.born);
      const drop = Math.min(1, age / 0.42);
      const eased = 1 - Math.pow(1 - drop, 3);
      const bounce = drop >= 1 ? Math.sin(Math.min(1, (age - 0.42) / 0.35) * Math.PI) * 0.06 * (1 - Math.min(1, (age - 0.42) / 0.35)) : 0;
      const winning = this.winning.includes(piece.index);
      const dimmed = this.winning.length > 0 && !winning;
      const pulse = winning ? 1 + Math.sin(time * 7) * 0.07 : 1;
      const rest = piece.mark === 'X' ? BOARD_TOP + 0.03 + X_HALF : BOARD_TOP + 0.03 + O_HALF;
      piece.group.position.y = THREE.MathUtils.lerp(rest + 1.6, rest, eased) + bounce;
      piece.group.scale.setScalar((0.2 + eased * 0.8) * pulse);
      piece.group.rotation.z = (1 - eased) * (piece.mark === 'X' ? 0.9 : -0.9);
      for (const material of piece.materials) {
        material.emissiveIntensity = ((piece.mark === 'X' ? 0.5 : 0.45) + (winning ? 0.55 + Math.sin(time * 7) * 0.25 : 0)) * (dimmed ? 0.35 : 1);
      }
      const contact = piece.group.userData.contact as THREE.Mesh | undefined;
      if (contact) {
        (contact.material as THREE.MeshBasicMaterial).opacity = (0.42 + (winning ? 0.3 + Math.sin(time * 7) * 0.15 : 0)) * eased * (dimmed ? 0.4 : 1);
      }
      if (age > 0.9 && piece.group.rotation.z !== 0 && !winning) piece.group.rotation.z = 0;
    }

    if (this.ghost) {
      this.ghost.position.y = (this.ghost.userData.restY as number ?? PIECE_Y) + Math.sin(time * 2.6) * 0.02;
      this.ghost.rotation.y = Math.sin(time * 0.9) * 0.18;
      for (const material of this.ghostMaterials) material.opacity = 0.16 + Math.sin(time * 2.6) * 0.05;
    }

    if (this.winBar) {
      const age = time - this.winStart;
      const grow = Math.min(1, age / 0.35);
      this.winBar.scale.set(1, 1, 1);
      this.winBar.position.y = BOARD_TOP + 0.06 + Math.sin(age * 4) * 0.01;
      (this.winBar.material as THREE.MeshBasicMaterial).opacity = 0.55 + Math.sin(age * 6) * 0.25;
      this.winBar.scale.set(Math.max(0.02, grow), 1, Math.max(0.02, grow));
    }

    // Sparks
    if (this.sparks.length) {
      const positions = this.sparkGeometry.attributes.position as THREE.BufferAttribute;
      let alive = 0;
      for (const spark of this.sparks) {
        spark.life += delta;
        if (spark.life >= spark.maxLife) continue;
        spark.velocity.y -= 3.6 * delta;
        spark.position.addScaledVector(spark.velocity, delta);
        positions.setXYZ(alive, spark.position.x, spark.position.y, spark.position.z);
        alive += 1;
      }
      this.sparks = this.sparks.filter(spark => spark.life < spark.maxLife);
      positions.needsUpdate = true;
      this.sparkGeometry.setDrawRange(0, alive);
      (this.sparkPoints.material as THREE.PointsMaterial).opacity = Math.min(1, this.sparks.length / 30);
      if (!this.sparks.length) this.sparkPoints.visible = false;
    }

    // Ambient: slowly drifting dust and orbit rings.
    for (let index = 0; index < this.dustPositions.length / 3; index++) {
      let y = this.dustPositions[index * 3 + 1] + delta * 0.08;
      if (y > 5.6) y = -0.3;
      this.dustPositions[index * 3 + 1] = y;
    }
    this.dust.geometry.attributes.position.needsUpdate = true;
    this.rings.forEach((ring, index) => {
      ring.rotation.z += delta * (index === 0 ? 0.22 : -0.16);
    });
    const glow = 0.6 + Math.sin(time * 1.3) * 0.1;
    for (const material of this.frameMaterials) material.emissiveIntensity = glow;
  }

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    const delta = Math.min(0.05, this.clock.getDelta());
    const time = this.clock.getElapsedTime();
    this.updatePieces(time, delta);
    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  };
}
