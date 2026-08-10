// Stylized low-poly 3D avatar in Three.js — modeled after the portrait:
// charcoal suit, light-blue shirt, full beard, rectangular glasses.
// Head follows the pointer; the whole body dances in Zero Bullshit mode.

import * as THREE from 'three';

const stage = document.getElementById('stage');
if (stage) init(stage);

function init(stage) {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(33, 1, 0.1, 50);
  camera.position.set(0, 2.1, 7.2);
  camera.lookAt(0, 1.55, 0);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  stage.prepend(renderer.domElement);

  // ── lights ──
  scene.add(new THREE.HemisphereLight(0xfff6e8, 0x8a8271, 1.15));
  const key = new THREE.DirectionalLight(0xffffff, 1.6);
  key.position.set(3, 5, 4);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xe6432d, 1.1);
  rim.position.set(-4, 3, -3);
  scene.add(rim);

  // ── materials ──
  const M = (color, opts = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.05, flatShading: true, ...opts });
  const suit = M(0x2b2f36);
  const suitDark = M(0x22252b);
  const shirt = M(0xbdd9f2);
  const skin = M(0xa9744f);
  const hair = M(0x181410, { roughness: 0.95 });
  const dark = M(0x101010);
  const white = M(0xf5f2ea, { roughness: 0.4 });
  const frame = M(0x3a2c1c, { roughness: 0.4, metalness: 0.3 });
  const belt = M(0x1c1a17);

  const box = (w, h, d, mat) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  const sph = (r, mat, ws = 12, hs = 10) => new THREE.Mesh(new THREE.SphereGeometry(r, ws, hs), mat);
  const cyl = (rt, rb, h, mat, seg = 10) => new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);

  const character = new THREE.Group();
  scene.add(character);

  // ── legs ──
  const mkLeg = (side) => {
    const g = new THREE.Group();
    g.position.set(0.22 * side, 1.05, 0);
    const upper = cyl(0.16, 0.14, 0.55, suitDark);
    upper.position.y = -0.28;
    const lower = cyl(0.13, 0.11, 0.5, suitDark);
    lower.position.y = -0.78;
    const shoe = box(0.24, 0.12, 0.42, dark);
    shoe.position.set(0, -1.06, 0.08);
    g.add(upper, lower, shoe);
    return g;
  };
  const legL = mkLeg(-1), legR = mkLeg(1);
  character.add(legL, legR);

  // ── torso ──
  const torso = new THREE.Group();
  torso.position.y = 1.08;
  character.add(torso);

  const jacket = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.45, 1.05, 8), suit);
  jacket.position.y = 0.55;
  const beltMesh = cyl(0.42, 0.42, 0.1, belt, 8);
  beltMesh.position.y = 0.02;
  // shirt wedge visible between the lapels
  const shirtV = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.95, 3), shirt);
  shirtV.position.set(0, 0.56, 0.26);
  shirtV.rotation.y = Math.PI;
  // lapels
  const lapelL = box(0.16, 0.75, 0.05, suitDark);
  lapelL.position.set(-0.17, 0.62, 0.36);
  lapelL.rotation.z = 0.22;
  const lapelR = lapelL.clone();
  lapelR.position.x = 0.17;
  lapelR.rotation.z = -0.22;
  // buttons
  const btn1 = sph(0.025, white, 8, 6); btn1.position.set(0, 0.32, 0.42);
  const btn2 = btn1.clone(); btn2.position.y = 0.18;
  torso.add(jacket, beltMesh, shirtV, lapelL, lapelR, btn1, btn2);

  // ── arms ──
  const mkArm = (side) => {
    const shoulder = new THREE.Group();
    shoulder.position.set(0.44 * side, 1.05, 0);
    const upper = cyl(0.11, 0.1, 0.55, suit);
    upper.position.y = -0.3;
    const elbow = new THREE.Group();
    elbow.position.y = -0.58;
    const fore = cyl(0.09, 0.08, 0.5, suit);
    fore.position.y = -0.27;
    const hand = sph(0.1, skin, 10, 8);
    hand.position.y = -0.55;
    elbow.add(fore, hand);
    shoulder.add(upper, elbow);
    shoulder.userData.elbow = elbow;
    return shoulder;
  };
  const armL = mkArm(-1), armR = mkArm(1);
  torso.add(armL, armR);

  // ── head ──
  const neck = cyl(0.12, 0.14, 0.18, skin, 8);
  neck.position.y = 1.18;
  torso.add(neck);

  const head = new THREE.Group();
  head.position.y = 1.55;
  torso.add(head);

  const skull = sph(0.42, skin, 14, 12);
  skull.scale.set(0.92, 1.05, 0.95);
  // hair: a slightly bigger upper cap, pushed back so the forehead shows
  const hairCap = new THREE.Mesh(new THREE.SphereGeometry(0.44, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.4), hair);
  hairCap.scale.set(0.95, 1.02, 0.98);
  hairCap.position.set(0, 0.12, -0.08);
  // beard: a lower-jaw shell only — cheeks and nose stay skin
  const beard = new THREE.Mesh(new THREE.SphereGeometry(0.41, 14, 10, 0, Math.PI * 2, Math.PI * 0.62, Math.PI * 0.38), hair);
  beard.scale.set(0.88, 1.05, 0.9);
  beard.position.set(0, -0.08, 0.09);
  // moustache hint above the beard line
  const stache = box(0.2, 0.05, 0.06, hair);
  stache.position.set(0, -0.14, 0.38);
  // ears
  const earL = sph(0.07, skin, 8, 6); earL.position.set(-0.39, 0, 0);
  const earR = earL.clone(); earR.position.x = 0.39;
  // nose
  const nose = box(0.09, 0.14, 0.1, skin);
  nose.position.set(0, -0.02, 0.4);
  // eyes
  const mkEye = (side) => {
    const g = new THREE.Group();
    g.position.set(0.15 * side, 0.1, 0.34);
    const ball = sph(0.06, white, 8, 6);
    const pupil = sph(0.028, dark, 6, 5);
    pupil.position.z = 0.045;
    g.add(ball, pupil);
    return g;
  };
  const eyeL = mkEye(-1), eyeR = mkEye(1);
  // brows
  const browL = box(0.14, 0.03, 0.04, hair);
  browL.position.set(-0.15, 0.22, 0.36);
  browL.rotation.z = 0.08;
  const browR = browL.clone(); browR.position.x = 0.15; browR.rotation.z = -0.08;
  // glasses: two rounded-rect frames + bridge + temples
  const mkFrame = (side) => {
    const f = new THREE.Mesh(new THREE.TorusGeometry(0.105, 0.016, 6, 14), frame);
    f.position.set(0.15 * side, 0.1, 0.4);
    f.scale.set(1.25, 1, 1);
    return f;
  };
  const frameL = mkFrame(-1), frameR = mkFrame(1);
  const bridge = box(0.09, 0.02, 0.02, frame);
  bridge.position.set(0, 0.12, 0.41);
  const templeL = box(0.02, 0.02, 0.3, frame);
  templeL.position.set(-0.3, 0.11, 0.25);
  templeL.rotation.y = 0.25;
  const templeR = templeL.clone(); templeR.position.x = 0.3; templeR.rotation.y = -0.25;

  head.add(skull, hairCap, beard, stache, earL, earR, nose, eyeL, eyeR, browL, browR, frameL, frameR, bridge, templeL, templeR);

  // ground shadow blob
  const blob = new THREE.Mesh(
    new THREE.CircleGeometry(0.75, 24),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.14 })
  );
  blob.rotation.x = -Math.PI / 2;
  blob.position.y = 0.01;
  scene.add(blob);

  // ── pointer tracking ──
  const target = new THREE.Vector2(0, 0);
  addEventListener('pointermove', (e) => {
    target.x = (e.clientX / innerWidth) * 2 - 1;
    target.y = (e.clientY / innerHeight) * 2 - 1;
  }, { passive: true });

  // ── dance state (driven by Zero Bullshit mode) ──
  let danceTarget = 'zb' in document.documentElement.dataset ? 1 : 0;
  let dance = danceTarget;
  addEventListener('zbchange', (e) => { danceTarget = e.detail.on ? 1 : 0; });

  const hintEl = document.getElementById('stageHint');
  if (hintEl) {
    const bn = document.documentElement.lang === 'bn';
    hintEl.textContent = bn ? 'কার্সর নাড়ান — ও তাকিয়ে আছে' : 'move your cursor — he’s watching';
  }

  // rim light picks up the accent color of the active theme
  function syncRim() {
    const c = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
    try { rim.color.set(c); } catch { /* keep previous */ }
  }
  syncRim();
  addEventListener('zbchange', syncRim);

  // ── resize ──
  function resize() {
    const w = stage.clientWidth, h = stage.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(stage);
  resize();

  // ── blink ──
  let nextBlink = 2;
  let blinkT = -1;

  // ── animation loop ──
  const BPM = 96;
  const clock = new THREE.Clock();
  let elapsed = 0;

  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.05);
    elapsed += dt;
    dance += (danceTarget - dance) * Math.min(1, dt * 3);

    const t = elapsed;
    const beat = (t * BPM) / 60; // beats elapsed

    // pointer follow (head + slight body turn), eased
    const hx = THREE.MathUtils.clamp(target.x, -1, 1);
    const hy = THREE.MathUtils.clamp(target.y, -1, 1);
    head.rotation.y += ((hx * 0.55) - head.rotation.y) * Math.min(1, dt * 6);
    head.rotation.x += ((hy * 0.32) - head.rotation.x) * Math.min(1, dt * 6);
    character.rotation.y += ((hx * 0.18) - character.rotation.y) * Math.min(1, dt * 3);

    // idle: breathing + micro-sway
    const idle = 1 - dance;
    torso.scale.y = 1 + Math.sin(t * 1.6) * 0.012 * idle;
    torso.rotation.z = Math.sin(t * 0.8) * 0.02 * idle;
    armL.rotation.z = 0.12 + Math.sin(t * 1.6) * 0.03 * idle;
    armR.rotation.z = -0.12 - Math.sin(t * 1.6 + 1) * 0.03 * idle;

    // dance: bounce, twist, alternating arm pumps, head nod — on the beat
    if (dance > 0.01 && !reduced) {
      const bounce = Math.abs(Math.sin(beat * Math.PI)) * 0.16 * dance;
      character.position.y = bounce;
      character.rotation.z = Math.sin(beat * Math.PI) * 0.06 * dance;
      torso.rotation.y = Math.sin(beat * Math.PI * 0.5) * 0.35 * dance;
      const swing = Math.sin(beat * Math.PI);
      armL.rotation.x = (-0.6 + swing * 0.9) * dance;
      armR.rotation.x = (-0.6 - swing * 0.9) * dance;
      armL.rotation.z = (0.5 + Math.abs(swing) * 0.3) * dance + 0.12 * idle;
      armR.rotation.z = -(0.5 + Math.abs(swing) * 0.3) * dance - 0.12 * idle;
      armL.userData.elbow.rotation.x = (-1.1 + swing * 0.5) * dance;
      armR.userData.elbow.rotation.x = (-1.1 - swing * 0.5) * dance;
      legL.rotation.x = swing * 0.25 * dance;
      legR.rotation.x = -swing * 0.25 * dance;
      head.rotation.x += Math.sin(beat * Math.PI * 2) * 0.08 * dance;
    } else {
      character.position.y *= 0.9;
      torso.rotation.y *= 0.92;
      armL.rotation.x *= 0.9;
      armR.rotation.x *= 0.9;
      armL.userData.elbow.rotation.x *= 0.9;
      armR.userData.elbow.rotation.x *= 0.9;
      legL.rotation.x *= 0.9;
      legR.rotation.x *= 0.9;
      character.rotation.z *= 0.92;
    }

    // blink
    nextBlink -= dt;
    if (nextBlink <= 0) { blinkT = 0; nextBlink = 2.4 + Math.random() * 3; }
    if (blinkT >= 0) {
      blinkT += dt;
      const p = blinkT / 0.16;
      const s = p < 1 ? Math.max(0.08, Math.abs(1 - 2 * Math.min(p, 1))) : 1;
      eyeL.scale.y = eyeR.scale.y = s;
      if (p >= 1) { blinkT = -1; eyeL.scale.y = eyeR.scale.y = 1; }
    }

    blob.scale.setScalar(1 - character.position.y * 0.35);
    renderer.render(scene, camera);
  });
}
