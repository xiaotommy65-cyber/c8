import { useEffect, useRef } from 'react';
import * as THREE from 'three/webgpu';
import { color, float, mix, sin, texture, uniform, uv } from 'three/tsl';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { CartridgeMeta } from './CartridgeBay';

export type RayActionName =
  | 'up'
  | 'down'
  | 'left'
  | 'right'
  | 'jumpA'
  | 'slashB'
  | 'dashX'
  | 'cartridge';

export interface ThreeHandheldSkinColors {
  outerShell: string;
  outerRim: string;
  innerDeck: string;
  bumper: string;
  dpad: string;
  btnA: string;
  btnB: string;
  btnX: string;
}

export interface ThreeHandheldStageProps {
  gameCanvas: HTMLCanvasElement;
  skin: ThreeHandheldSkinColors;
  cameraPhase: 'boot' | 'play' | 'tray-open' | 'inserting';
  pressedUi: {
    up: boolean;
    down: boolean;
    left: boolean;
    right: boolean;
    jumpA: boolean;
    slashB: boolean;
    dashX: boolean;
  };
  activeCartMeta: CartridgeMeta;
  insertingMeta: CartridgeMeta | null;
  ledState: 'playing' | 'paused' | 'error';
  bootFlashTick: number;
  parallaxEnabled: boolean;
  tiltTarget: { rx: number; ry: number };
  onRayAction: (action: RayActionName, active: boolean, pointerId: number) => void;
  onBackendReady?: (backend: 'WebGPU' | 'WebGL2' | 'Fallback') => void;
}

// Pre-allocated scratch math helpers (zero GC inside animation loop)
const _raycaster = new THREE.Raycaster();
const _ndc = new THREE.Vector2();
const _lookAtCurrent = new THREE.Vector3(0, 0.2, 0);
const _lookAtTarget = new THREE.Vector3(0, 0.2, 0);
const _camTargetPos = new THREE.Vector3(0, 0.1, 8.2);

function detectSoftwareGl(): boolean {
  if (typeof document === 'undefined') return false;
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) ?? '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return false;
  }
}

function paintCartridgeStickerCanvas(canvas: HTMLCanvasElement, meta: CartridgeMeta) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const w = canvas.width;
  const h = canvas.height;

  const grad = ctx.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, '#0B1220');
  grad.addColorStop(0.55, meta.shellBorder);
  grad.addColorStop(1, meta.shellBg);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // Diagonal geometric highlight band
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.beginPath();
  ctx.moveTo(0, h * 0.65);
  ctx.lineTo(w * 0.72, 0);
  ctx.lineTo(w, 0);
  ctx.lineTo(w * 0.24, h);
  ctx.closePath();
  ctx.fill();

  // Serial header bar
  ctx.fillStyle = 'rgba(0,0,0,0.32)';
  ctx.fillRect(0, 0, w, 46);

  ctx.fillStyle = '#E2E8F0';
  ctx.font = 'bold 20px "JetBrains Mono", monospace';
  ctx.fillText(meta.serial, 18, 30);

  ctx.fillStyle = meta.accentHex;
  ctx.font = 'bold 16px "JetBrains Mono", monospace';
  ctx.textAlign = 'right';
  ctx.fillText('CHRONO·ROM 60HZ', w - 18, 29);
  ctx.textAlign = 'left';

  // Emblem icon graphic
  ctx.fillStyle = meta.accentHex;
  ctx.fillRect(20, 68, 56, 56);
  ctx.fillStyle = '#0B1220';
  ctx.fillRect(30, 78, 36, 36);
  ctx.fillStyle = '#FACC15';
  ctx.fillRect(42, 90, 12, 12);

  // Title & subtitle
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 28px "Noto Sans TC", "Plus Jakarta Sans", sans-serif';
  ctx.fillText(meta.shortTitle.slice(0, 14), 92, 94);

  ctx.fillStyle = 'rgba(255,255,255,0.82)';
  ctx.font = '18px "Noto Sans TC", "Plus Jakarta Sans", sans-serif';
  ctx.fillText(meta.subtitle.slice(0, 22), 92, 122);

  // Bottom insert triangle
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.beginPath();
  ctx.moveTo(w / 2 - 12, h - 22);
  ctx.lineTo(w / 2 + 12, h - 22);
  ctx.lineTo(w / 2, h - 8);
  ctx.closePath();
  ctx.fill();
}

function createRadialContactShadowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d');
  if (ctx) {
    const grad = ctx.createRadialGradient(128, 128, 18, 128, 128, 124);
    grad.addColorStop(0, 'rgba(0,0,0,0.68)');
    grad.addColorStop(0.55, 'rgba(0,0,0,0.28)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 256);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function ThreeHandheldStage({
  gameCanvas,
  skin,
  cameraPhase,
  pressedUi,
  activeCartMeta,
  insertingMeta,
  ledState,
  bootFlashTick,
  parallaxEnabled,
  tiltTarget,
  onRayAction,
  onBackendReady,
}: ThreeHandheldStageProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);

  // Mutable live refs read inside the WebGPURenderer animation loop
  const propsRef = useRef({
    skin,
    cameraPhase,
    pressedUi,
    activeCartMeta,
    insertingMeta,
    ledState,
    parallaxEnabled,
    tiltTarget,
  });
  propsRef.current = {
    skin,
    cameraPhase,
    pressedUi,
    activeCartMeta,
    insertingMeta,
    ledState,
    parallaxEnabled,
    tiltTarget,
  };

  const onRayActionRef = useRef(onRayAction);
  onRayActionRef.current = onRayAction;
  const onBackendReadyRef = useRef(onBackendReady);
  onBackendReadyRef.current = onBackendReady;

  const bootFlashLevelRef = useRef(1.0);
  const lastBootTickRef = useRef(bootFlashTick);
  if (bootFlashTick !== lastBootTickRef.current) {
    lastBootTickRef.current = bootFlashTick;
    bootFlashLevelRef.current = 1.0;
  }

  const stickerUpdateFnRef = useRef<((meta: CartridgeMeta) => void) | null>(null);

  // Re-paint cartridge sticker texture whenever active or inserting cartridge changes
  useEffect(() => {
    const targetMeta = insertingMeta ?? activeCartMeta;
    stickerUpdateFnRef.current?.(targetMeta);
  }, [activeCartMeta, insertingMeta]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    let disposed = false;
    let rafId = 0;
    const isSoftwareGl = detectSoftwareGl();

    const width = Math.max(320, container.clientWidth);
    const height = Math.max(240, container.clientHeight);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0c0a14);
    scene.fog = new THREE.FogExp2(0x0c0a14, 0.028);

    const camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 60);
    camera.position.set(1.2, 1.9, 10.6);

    // 1. Live Game CanvasTexture fed from ChronoForgeEngine (sharp nearest pixels)
    const screenTex = new THREE.CanvasTexture(gameCanvas);
    screenTex.colorSpace = THREE.SRGBColorSpace;
    screenTex.minFilter = THREE.NearestFilter;
    screenTex.magFilter = THREE.NearestFilter;
    screenTex.generateMipmaps = false;

    // 2. Dynamic Cartridge Sticker CanvasTexture
    const stickerCanvas = document.createElement('canvas');
    stickerCanvas.width = 512;
    stickerCanvas.height = 320;
    paintCartridgeStickerCanvas(stickerCanvas, propsRef.current.activeCartMeta);
    const stickerTex = new THREE.CanvasTexture(stickerCanvas);
    stickerTex.colorSpace = THREE.SRGBColorSpace;

    const shadowDiscTex = createRadialContactShadowTexture();

    // 3. Studio Three-Point Lighting Rig
    const hemiLight = new THREE.HemisphereLight(0xdbeafe, 0x1a1428, 0.9);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfff4e6, 2.25);
    keyLight.position.set(4.5, 6.8, 6.2);
    keyLight.castShadow = !isSoftwareGl;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.near = 1;
    keyLight.shadow.camera.far = 22;
    keyLight.shadow.camera.left = -6;
    keyLight.shadow.camera.right = 6;
    keyLight.shadow.camera.top = 5;
    keyLight.shadow.camera.bottom = -5;
    keyLight.shadow.bias = -0.0005;
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x6ee7b7, 1.05);
    rimLight.position.set(-5.2, 3.8, -5.5);
    scene.add(rimLight);

    // 4. Arcade Desk Plane & Radial Contact Shadow Grounding
    const deskGeo = new THREE.PlaneGeometry(42, 28);
    const deskMat = new THREE.MeshStandardNodeMaterial({
      color: 0x110e1b,
      roughness: 0.88,
      metalness: 0.06,
    });
    const deskMesh = new THREE.Mesh(deskGeo, deskMat);
    deskMesh.rotation.x = -Math.PI / 2;
    deskMesh.position.y = -2.42;
    deskMesh.receiveShadow = true;
    scene.add(deskMesh);

    const contactGeo = new THREE.PlaneGeometry(11.2, 4.4);
    const contactMat = new THREE.MeshBasicNodeMaterial({
      map: shadowDiscTex,
      transparent: true,
      depthWrite: false,
      opacity: 0.56,
    });
    const contactShadow = new THREE.Mesh(contactGeo, contactMat);
    contactShadow.rotation.x = -Math.PI / 2;
    contactShadow.position.set(0, -2.4, 0.05);
    scene.add(contactShadow);

    // 5. Composite 3-12 Part Procedural Handheld Model (THREE.Group)
    const consolePivot = new THREE.Group();
    consolePivot.rotation.set(0.24, -0.14, 0);
    scene.add(consolePivot);

    const outerShellMat = new THREE.MeshStandardNodeMaterial({
      color: propsRef.current.skin.outerShell,
      roughness: 0.54,
      metalness: 0.05,
    });
    const innerDeckMat = new THREE.MeshStandardNodeMaterial({
      color: propsRef.current.skin.innerDeck,
      roughness: 0.64,
      metalness: 0.02,
    });
    const bumperMat = new THREE.MeshStandardNodeMaterial({
      color: propsRef.current.skin.bumper,
      roughness: 0.45,
      metalness: 0.1,
    });
    const dpadMat = new THREE.MeshStandardNodeMaterial({
      color: propsRef.current.skin.dpad,
      roughness: 0.72,
      metalness: 0.06,
    });
    const bezelMat = new THREE.MeshStandardNodeMaterial({
      color: 0x161922,
      roughness: 0.26,
      metalness: 0.16,
    });
    const btnSocketMat = new THREE.MeshStandardNodeMaterial({
      color: 0x1f2430,
      roughness: 0.75,
      metalness: 0.08,
    });

    const createCandyMaterial = (hex: string) => {
      const m = new THREE.MeshPhysicalNodeMaterial({
        color: hex,
        roughness: 0.18,
        metalness: 0.04,
      });
      m.clearcoat = 0.9;
      m.clearcoatRoughness = 0.08;
      return m;
    };

    const btnAMat = createCandyMaterial(propsRef.current.skin.btnA);
    const btnBMat = createCandyMaterial(propsRef.current.skin.btnB);
    const btnXMat = createCandyMaterial(propsRef.current.skin.btnX);

    // (1) Outer Beveled Handheld Shell
    const shellGeo = new RoundedBoxGeometry(8.9, 4.38, 0.74, 5, 0.42);
    const shellMesh = new THREE.Mesh(shellGeo, outerShellMat);
    shellMesh.castShadow = true;
    shellMesh.receiveShadow = true;
    consolePivot.add(shellMesh);

    // (2) Inner Cream Face Deck
    const deckGeo = new RoundedBoxGeometry(8.3, 3.84, 0.16, 4, 0.30);
    const deckMesh = new THREE.Mesh(deckGeo, innerDeckMat);
    deckMesh.position.set(0, 0, 0.34);
    deckMesh.receiveShadow = true;
    consolePivot.add(deckMesh);

    // (3) Dark Charcoal Display Bezel
    const bezelGeo = new RoundedBoxGeometry(4.84, 2.92, 0.12, 4, 0.15);
    const bezelMesh = new THREE.Mesh(bezelGeo, bezelMat);
    bezelMesh.position.set(0, 0.02, 0.41);
    bezelMesh.receiveShadow = true;
    consolePivot.add(bezelMesh);

    // (4) TSL Live Pixel Screen (CanvasTexture + Scanline Micro-Grid + Boot Flash Uniform)
    const uBootFlash = uniform(1.0);
    const screenMat = new THREE.MeshBasicNodeMaterial();
    const sampled = texture(screenTex, uv());
    const scanline = sin(uv().y.mul(float(270 * Math.PI * 2))).mul(0.022).add(0.978);
    screenMat.colorNode = mix(
      sampled.rgb.mul(scanline),
      color(0xd1fae5),
      uBootFlash.mul(0.82),
    );

    const screenGeo = new THREE.PlaneGeometry(4.44, 2.4975);
    const screenMesh = new THREE.Mesh(screenGeo, screenMat);
    screenMesh.position.set(0, 0.02, 0.478);
    consolePivot.add(screenMesh);

    // (5) Acrylic Protective Glass Cover
    const glassGeo = new THREE.PlaneGeometry(4.5, 2.55);
    const glassMat = new THREE.MeshPhysicalNodeMaterial({
      color: 0xffffff,
      roughness: 0.05,
      metalness: 0.0,
      transparent: true,
      opacity: 0.1,
    });
    glassMat.clearcoat = 1.0;
    glassMat.clearcoatRoughness = 0.05;
    glassMat.depthWrite = false;
    const glassMesh = new THREE.Mesh(glassGeo, glassMat);
    glassMesh.position.set(0, 0.02, 0.486);
    glassMesh.renderOrder = 4;
    consolePivot.add(glassMesh);

    // (6) Power LED Indicator
    const ledGeo = new THREE.SphereGeometry(0.055, 16, 16);
    const ledMat = new THREE.MeshStandardNodeMaterial({
      color: 0x10b981,
      emissive: 0x10b981,
      emissiveIntensity: 1.6,
      roughness: 0.2,
    });
    const ledMesh = new THREE.Mesh(ledGeo, ledMat);
    ledMesh.position.set(-2.22, 1.24, 0.48);
    consolePivot.add(ledMesh);

    // (7) Tactile L & R Shoulder Bumpers
    const bumperGeo = new RoundedBoxGeometry(1.48, 0.28, 0.56, 3, 0.08);
    const bumperL = new THREE.Mesh(bumperGeo, bumperMat);
    bumperL.position.set(-3.1, 2.22, -0.02);
    bumperL.userData.rayAction = 'cartridge';
    consolePivot.add(bumperL);

    const bumperR = new THREE.Mesh(bumperGeo, bumperMat);
    bumperR.position.set(3.1, 2.22, -0.02);
    bumperR.userData.rayAction = 'dashX';
    consolePivot.add(bumperR);

    // (8) Sculpted 3D Cross D-Pad Rocker on Left Wing
    const dpadWellGeo = new THREE.CylinderGeometry(0.78, 0.82, 0.06, 32);
    const dpadWell = new THREE.Mesh(dpadWellGeo, innerDeckMat);
    dpadWell.rotation.x = Math.PI / 2;
    dpadWell.position.set(-3.18, 0.12, 0.41);
    consolePivot.add(dpadWell);

    const dpadPivot = new THREE.Group();
    dpadPivot.position.set(-3.18, 0.12, 0.46);
    consolePivot.add(dpadPivot);

    const dpadHorizGeo = new RoundedBoxGeometry(1.18, 0.36, 0.16, 3, 0.05);
    const dpadVertGeo = new RoundedBoxGeometry(0.36, 1.18, 0.16, 3, 0.05);
    const dpadHoriz = new THREE.Mesh(dpadHorizGeo, dpadMat);
    const dpadVert = new THREE.Mesh(dpadVertGeo, dpadMat);
    dpadHoriz.castShadow = true;
    dpadVert.castShadow = true;
    dpadPivot.add(dpadHoriz, dpadVert);

    const pivotDishGeo = new THREE.CylinderGeometry(0.16, 0.18, 0.04, 24);
    const pivotDish = new THREE.Mesh(pivotDishGeo, btnSocketMat);
    pivotDish.rotation.x = Math.PI / 2;
    pivotDish.position.z = 0.08;
    dpadPivot.add(pivotDish);

    // Raycast Hit Proxies for the 4 D-Pad Arms
    const hitArmGeo = new THREE.BoxGeometry(0.46, 0.46, 0.24);
    const hitArmMat = new THREE.MeshBasicMaterial({ visible: false });
    const makeHitProxy = (action: RayActionName, x: number, y: number) => {
      const m = new THREE.Mesh(hitArmGeo, hitArmMat);
      m.position.set(x, y, 0.04);
      m.userData.rayAction = action;
      dpadPivot.add(m);
    };
    makeHitProxy('up', 0, 0.42);
    makeHitProxy('down', 0, -0.42);
    makeHitProxy('left', -0.42, 0);
    makeHitProxy('right', 0.42, 0);

    // (9) Candy A / B / X Action Buttons on Right Wing
    const socketGeo = new THREE.CylinderGeometry(0.31, 0.33, 0.05, 28);
    const capGeo = new THREE.CylinderGeometry(0.255, 0.275, 0.16, 28);

    const buildButton = (
      action: RayActionName,
      mat: THREE.Material,
      x: number,
      y: number,
      scale = 1,
    ) => {
      const socket = new THREE.Mesh(socketGeo, btnSocketMat);
      socket.rotation.x = Math.PI / 2;
      socket.position.set(x, y, 0.42);
      socket.scale.setScalar(scale);
      consolePivot.add(socket);

      const cap = new THREE.Mesh(capGeo, mat);
      cap.rotation.x = Math.PI / 2;
      cap.position.set(x, y, 0.48);
      cap.scale.setScalar(scale);
      cap.castShadow = true;
      cap.userData.rayAction = action;
      consolePivot.add(cap);
      return cap;
    };

    const btnXMesh = buildButton('dashX', btnXMat, 3.16, 0.72, 0.9);
    const btnBMesh = buildButton('slashB', btnBMat, 2.86, -0.14, 1.0);
    const btnAMesh = buildButton('jumpA', btnAMat, 3.56, 0.14, 1.0);

    // Acoustic Speaker Slits
    const slitGeo = new RoundedBoxGeometry(0.11, 0.44, 0.04, 2, 0.03);
    for (let i = 0; i < 4; i++) {
      const slit = new THREE.Mesh(slitGeo, btnSocketMat);
      slit.position.set(2.96 + i * 0.22, -1.24, 0.42);
      slit.rotation.z = -0.22;
      consolePivot.add(slit);
    }

    // (10) Top Cartridge Bay Shroud
    const slotShroudGeo = new RoundedBoxGeometry(2.44, 0.28, 0.56, 3, 0.06);
    const slotShroud = new THREE.Mesh(slotShroudGeo, bezelMat);
    slotShroud.position.set(0, 2.22, -0.02);
    slotShroud.userData.rayAction = 'cartridge';
    consolePivot.add(slotShroud);

    // (11) Composite 3D Game Cartridge (Shell + Sticker Art + PCB + 9 Gold Pins)
    const cartridgePivot = new THREE.Group();
    cartridgePivot.position.set(0, 1.62, -0.02);
    consolePivot.add(cartridgePivot);

    const cartShellMat = new THREE.MeshStandardNodeMaterial({
      color: propsRef.current.activeCartMeta.shellBg,
      roughness: 0.46,
      metalness: 0.08,
    });
    const cartBodyGeo = new RoundedBoxGeometry(2.14, 1.62, 0.32, 4, 0.06);
    const cartBodyMesh = new THREE.Mesh(cartBodyGeo, cartShellMat);
    cartBodyMesh.castShadow = true;
    cartBodyMesh.userData.rayAction = 'cartridge';
    cartridgePivot.add(cartBodyMesh);

    const cartLipGeo = new RoundedBoxGeometry(2.22, 0.18, 0.36, 3, 0.05);
    const cartLipMesh = new THREE.Mesh(cartLipGeo, cartShellMat);
    cartLipMesh.position.set(0, 0.78, 0);
    cartLipMesh.userData.rayAction = 'cartridge';
    cartridgePivot.add(cartLipMesh);

    const stickerGeo = new THREE.PlaneGeometry(1.74, 1.08);
    const stickerMat = new THREE.MeshStandardNodeMaterial({
      map: stickerTex,
      roughness: 0.22,
      metalness: 0.04,
    });
    const stickerMesh = new THREE.Mesh(stickerGeo, stickerMat);
    stickerMesh.position.set(0, 0.04, 0.164);
    stickerMesh.userData.rayAction = 'cartridge';
    cartridgePivot.add(stickerMesh);

    // Dark green PCB edge + 9 brushed metallic gold finger contacts
    const pcbGeo = new THREE.BoxGeometry(1.66, 0.22, 0.08);
    const pcbMat = new THREE.MeshStandardNodeMaterial({
      color: 0x064e3b,
      roughness: 0.55,
      metalness: 0.15,
    });
    const pcbMesh = new THREE.Mesh(pcbGeo, pcbMat);
    pcbMesh.position.set(0, -0.84, 0);
    cartridgePivot.add(pcbMesh);

    const pinGeo = new THREE.BoxGeometry(0.11, 0.16, 0.095);
    const pinMat = new THREE.MeshStandardNodeMaterial({
      color: 0xfacc15,
      metalness: 0.95,
      roughness: 0.16,
    });
    for (let i = 0; i < 9; i++) {
      const pin = new THREE.Mesh(pinGeo, pinMat);
      pin.position.set(-0.68 + i * 0.17, -0.86, 0);
      cartridgePivot.add(pin);
    }

    stickerUpdateFnRef.current = (meta: CartridgeMeta) => {
      paintCartridgeStickerCanvas(stickerCanvas, meta);
      stickerTex.needsUpdate = true;
      cartShellMat.color.set(meta.shellBg);
    };

    // Collect raycast targets (only interactive controls)
    const rayTargets: THREE.Object3D[] = [];
    consolePivot.traverse((obj) => {
      if (obj.userData?.rayAction) {
        rayTargets.push(obj);
      }
    });

    // 6. Initialize WebGPURenderer (automatic WebGL2 fallback in r187)
    const renderer = new THREE.WebGPURenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFShadowMap;

    const domEl = renderer.domElement;
    domEl.style.width = '100%';
    domEl.style.height = '100%';
    domEl.style.display = 'block';
    domEl.style.touchAction = 'none';
    container.appendChild(domEl);

    // Multi-touch 3D Raycaster Pointer Handlers
    const pointerActionMap = new Map<number, RayActionName>();

    const onPointerDown = (e: PointerEvent) => {
      const rect = domEl.getBoundingClientRect();
      _ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      _ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      _raycaster.setFromCamera(_ndc, camera);
      const hits = _raycaster.intersectObjects(rayTargets, false);
      if (hits.length > 0) {
        const action = hits[0].object.userData?.rayAction as RayActionName | undefined;
        if (action) {
          e.preventDefault();
          try {
            domEl.setPointerCapture?.(e.pointerId);
          } catch {
            // ignore
          }
          pointerActionMap.set(e.pointerId, action);
          onRayActionRef.current(action, true, e.pointerId);
        }
      }
    };

    const onPointerUpOrCancel = (e: PointerEvent) => {
      const action = pointerActionMap.get(e.pointerId);
      if (action) {
        pointerActionMap.delete(e.pointerId);
        onRayActionRef.current(action, false, e.pointerId);
      }
    };

    domEl.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointerup', onPointerUpOrCancel);
    window.addEventListener('pointercancel', onPointerUpOrCancel);

    const handleResize = () => {
      if (!container || disposed) return;
      const w = Math.max(320, container.clientWidth);
      const h = Math.max(240, container.clientHeight);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);
    window.addEventListener('resize', handleResize);

    // Animation loop state
    let lastTs = performance.now();
    let frameInFlight = false;

    const startLoop = async () => {
      try {
        await renderer.init();
        if (disposed) return;

        // Studio environment reflections after renderer.init()
        const pmrem = new THREE.PMREMGenerator(renderer);
        const envScene = new RoomEnvironment();
        const envRT = pmrem.fromScene(envScene, 0.04);
        scene.environment = envRT.texture;
        pmrem.dispose();

        const backendTag =
          (renderer.backend as { isWebGPUBackend?: boolean } | undefined)?.isWebGPUBackend
            ? 'WebGPU'
            : 'WebGL2';
        onBackendReadyRef.current?.(backendTag);

        // Listen for WebGPU device loss if applicable
        const backendDevice = (renderer.backend as { device?: GPUDevice } | undefined)?.device;
        backendDevice?.lost?.then(() => {
          if (!disposed) {
            onBackendReadyRef.current?.('Fallback');
          }
        });

        let lastSkinId = '';

        const tick = (now: number) => {
          if (disposed) return;
          rafId = requestAnimationFrame(tick);

          const dt = Math.min(0.05, Math.max(0.001, (now - lastTs) / 1000));
          lastTs = now;

          const cur = propsRef.current;

          // Sync live 2D pixel engine canvas into TSL texture
          screenTex.needsUpdate = true;

          // Smoothly decay TSL boot flash uniform
          bootFlashLevelRef.current = THREE.MathUtils.damp(
            bootFlashLevelRef.current,
            0,
            7.5,
            dt,
          );
          uBootFlash.value = bootFlashLevelRef.current;

          // Sync Shell Skin Colors cleanly without recreating materials
          const skinSig = `${cur.skin.outerShell}:${cur.skin.innerDeck}:${cur.skin.btnA}`;
          if (skinSig !== lastSkinId) {
            lastSkinId = skinSig;
            outerShellMat.color.set(cur.skin.outerShell);
            innerDeckMat.color.set(cur.skin.innerDeck);
            bumperMat.color.set(cur.skin.bumper);
            dpadMat.color.set(cur.skin.dpad);
            btnAMat.color.set(cur.skin.btnA);
            btnBMat.color.set(cur.skin.btnB);
            btnXMat.color.set(cur.skin.btnX);
          }

          // Sync Power LED Color
          if (cur.ledState === 'error') {
            ledMat.color.setHex(0xef4444);
            ledMat.emissive.setHex(0xef4444);
          } else if (cur.ledState === 'paused' || cur.cameraPhase !== 'play') {
            ledMat.color.setHex(0xf59e0b);
            ledMat.emissive.setHex(0xf59e0b);
          } else {
            ledMat.color.setHex(0x10b981);
            ledMat.emissive.setHex(0x10b981);
          }

          // Physical 3D Button & D-Pad Spring Travel
          const dpadRx = (cur.pressedUi.up ? -0.18 : 0) + (cur.pressedUi.down ? 0.18 : 0);
          const dpadRy = (cur.pressedUi.left ? -0.18 : 0) + (cur.pressedUi.right ? 0.18 : 0);
          dpadPivot.rotation.x = THREE.MathUtils.damp(dpadPivot.rotation.x, dpadRx, 26, dt);
          dpadPivot.rotation.y = THREE.MathUtils.damp(dpadPivot.rotation.y, dpadRy, 26, dt);

          btnAMesh.position.z = THREE.MathUtils.damp(
            btnAMesh.position.z,
            cur.pressedUi.jumpA ? 0.41 : 0.48,
            28,
            dt,
          );
          btnBMesh.position.z = THREE.MathUtils.damp(
            btnBMesh.position.z,
            cur.pressedUi.slashB ? 0.41 : 0.48,
            28,
            dt,
          );
          btnXMesh.position.z = THREE.MathUtils.damp(
            btnXMesh.position.z,
            cur.pressedUi.dashX ? 0.41 : 0.48,
            28,
            dt,
          );
          bumperR.position.y = THREE.MathUtils.damp(
            bumperR.position.y,
            cur.pressedUi.dashX ? 2.17 : 2.22,
            26,
            dt,
          );

          // Camera Choreography & Cartridge Eject/Insert Rig
          const aspect = camera.aspect || 1.6;
          const fitZ = Math.max(6.8, 12.6 / Math.max(0.55, aspect));

          if (cur.cameraPhase === 'tray-open') {
            _camTargetPos.set(0.35, 2.75, Math.max(5.2, fitZ * 0.62));
            _lookAtTarget.set(0, 2.25, 0);
            cartridgePivot.position.y = THREE.MathUtils.damp(cartridgePivot.position.y, 3.05, 10, dt);
            cartridgePivot.rotation.x = THREE.MathUtils.damp(cartridgePivot.rotation.x, 0.14, 10, dt);
            consolePivot.rotation.x = THREE.MathUtils.damp(consolePivot.rotation.x, -0.12, 8, dt);
            consolePivot.rotation.y = THREE.MathUtils.damp(consolePivot.rotation.y, 0.08, 8, dt);
          } else if (cur.cameraPhase === 'inserting') {
            _camTargetPos.set(0.12, 2.0, Math.max(5.5, fitZ * 0.68));
            _lookAtTarget.set(0, 1.7, 0);
            cartridgePivot.position.y = THREE.MathUtils.damp(cartridgePivot.position.y, 1.56, 20, dt);
            cartridgePivot.rotation.x = THREE.MathUtils.damp(cartridgePivot.rotation.x, 0, 20, dt);
            consolePivot.rotation.x = THREE.MathUtils.damp(consolePivot.rotation.x, -0.04, 12, dt);
            consolePivot.rotation.y = THREE.MathUtils.damp(consolePivot.rotation.y, 0, 12, dt);
          } else {
            _camTargetPos.set(0, 0.15, fitZ);
            _lookAtTarget.set(0, 0.08, 0);
            cartridgePivot.position.y = THREE.MathUtils.damp(cartridgePivot.position.y, 1.62, 14, dt);
            cartridgePivot.rotation.x = THREE.MathUtils.damp(cartridgePivot.rotation.x, 0, 14, dt);
            const targetRx = cur.parallaxEnabled ? THREE.MathUtils.degToRad(cur.tiltTarget.rx) : 0;
            const targetRy = cur.parallaxEnabled ? THREE.MathUtils.degToRad(cur.tiltTarget.ry) : 0;
            consolePivot.rotation.x = THREE.MathUtils.damp(consolePivot.rotation.x, targetRx, 9, dt);
            consolePivot.rotation.y = THREE.MathUtils.damp(consolePivot.rotation.y, targetRy, 9, dt);
          }

          camera.position.x = THREE.MathUtils.damp(camera.position.x, _camTargetPos.x, 8, dt);
          camera.position.y = THREE.MathUtils.damp(camera.position.y, _camTargetPos.y, 8, dt);
          camera.position.z = THREE.MathUtils.damp(camera.position.z, _camTargetPos.z, 8, dt);

          _lookAtCurrent.x = THREE.MathUtils.damp(_lookAtCurrent.x, _lookAtTarget.x, 8, dt);
          _lookAtCurrent.y = THREE.MathUtils.damp(_lookAtCurrent.y, _lookAtTarget.y, 8, dt);
          _lookAtCurrent.z = THREE.MathUtils.damp(_lookAtCurrent.z, _lookAtTarget.z, 8, dt);
          camera.lookAt(_lookAtCurrent);

          if (!frameInFlight) {
            frameInFlight = true;
            try {
              renderer.render(scene, camera);
            } finally {
              frameInFlight = false;
            }
          }
        };

        rafId = requestAnimationFrame(tick);
      } catch {
        if (!disposed) {
          onBackendReadyRef.current?.('Fallback');
        }
      }
    };

    void startLoop();

    return () => {
      disposed = true;
      cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
      window.removeEventListener('resize', handleResize);
      domEl.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointerup', onPointerUpOrCancel);
      window.removeEventListener('pointercancel', onPointerUpOrCancel);

      scene.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) {
          const m = obj as THREE.Mesh;
          m.geometry?.dispose();
          if (Array.isArray(m.material)) {
            m.material.forEach((mat) => mat.dispose());
          } else {
            m.material?.dispose();
          }
        }
      });

      screenTex.dispose();
      stickerTex.dispose();
      shadowDiscTex.dispose();
      scene.environment?.dispose();
      renderer.dispose();
      if (domEl.parentNode === container) {
        container.removeChild(domEl);
      }
    };
  }, [gameCanvas]);

  return (
    <div
      ref={mountRef}
      className="w-full h-full relative overflow-hidden"
      aria-label="Three.js WebGPU 3D 掌機舞台"
    />
  );
}
