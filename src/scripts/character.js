// Stylized 3D avatar in Three.js — modeled after the portrait: charcoal suit,
// light-blue shirt, full beard, rectangular glasses, hands in pockets.
// Head follows the pointer; the whole body dances in Zero Bullshit mode.

import * as THREE from 'three';

const stage = document.getElementById('stage');
if (stage) init(stage);

function init(stage) {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  camera.position.set(0.4, 2.0, 7.6);
  camera.lookAt(0, 1.5, 0);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  stage.prepend(renderer.domElement);

  // ── lights ──
  scene.add(new THREE.HemisphereLight(0xfff4e4, 0x6e6a5c, 1.05));
  const key = new THREE.DirectionalLight(0xffffff, 1.9);
  key.position.set(3, 6, 4);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.left = -3; key.shadow.camera.right = 3;
  key.shadow.camera.top = 5; key.shadow.camera.bottom = -1;
  key.shadow.radius = 6;
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xcfe4ff, 0.5);
  fill.position.set(-3, 2, 3);
  scene.add(fill);
  const rim = new THREE.DirectionalLight(0xe6432d, 0.9);
  rim.position.set(-4, 3, -4);
  scene.add(rim);

  // ── materials (smooth, soft) ──
  const M = (color, rough = 0.75, opts = {}) =>
    new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0.04, ...opts });
  const suit = M(0x2c313a, 0.82);
  const suitDark = M(0x232730, 0.85);
  const trouser = M(0x262b33, 0.85);
  const shirt = M(0xc4ddf2, 0.7);
  const skin = M(0xa9744f, 0.55);
  const skinDark = M(0x96613f, 0.6);
  const hair = M(0x171310, 0.95);
  const dark = M(0x121212, 0.5);
  const white = M(0xf7f4ec, 0.35);
  const iris = M(0x3a2415, 0.4);
  const frameMat = M(0x40301e, 0.35, { metalness: 0.35 });
  const belt = M(0x1a1815, 0.6);

  const shadowed = (mesh) => { mesh.castShadow = true; return mesh; };
  const box = (w, h, d, mat) => shadowed(new THREE.Mesh(new THREE.BoxGeometry(w, h, d, 2, 2, 2), mat));
  const sph = (r, mat, ws = 24, hs = 18) => shadowed(new THREE.Mesh(new THREE.SphereGeometry(r, ws, hs), mat));
  const cap = (r, len, mat) => shadowed(new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 6, 16), mat));
  const cyl = (rt, rb, h, mat, seg = 20) => shadowed(new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat));

  const character = new THREE.Group();
  scene.add(character);

  // ── legs ──
  const mkLeg = (side) => {
    const g = new THREE.Group();
    g.position.set(0.2 * side, 1.06, 0);
    const upper = cap(0.15, 0.42, trouser); upper.position.y = -0.3;
    const lower = cap(0.12, 0.4, trouser); lower.position.y = -0.76;
    const shoe = cap(0.11, 0.2, dark);
    shoe.rotation.x = Math.PI / 2;
    shoe.position.set(0, -1.04, 0.1);
    g.add(upper, lower, shoe);
    return g;
  };
  const legL = mkLeg(-1), legR = mkLeg(1);
  character.add(legL, legR);

  // ── torso ──
  const torso = new THREE.Group();
  torso.position.y = 1.08;
  character.add(torso);

  const jacket = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.44, 1.02, 22, 4), suit));
  jacket.position.y = 0.55;
  const shoulders = shadowed(new THREE.Mesh(
    new THREE.SphereGeometry(0.345, 22, 14, 0, Math.PI * 2, 0, Math.PI * 0.5), suit));
  shoulders.position.y = 1.02;
  shoulders.scale.set(1.15, 0.5, 0.95);
  const beltMesh = cyl(0.42, 0.42, 0.09, belt);
  beltMesh.position.y = 0.03;
  const buckle = box(0.09, 0.06, 0.02, white);
  buckle.position.set(0, 0.03, 0.42);
  // shirt wedge between the lapels
  const shirtV = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.19, 0.95, 3), shirt));
  shirtV.position.set(0, 0.56, 0.25);
  shirtV.rotation.y = Math.PI;
  // lapels
  const lapelL = box(0.15, 0.72, 0.04, suitDark);
  lapelL.position.set(-0.16, 0.62, 0.35);
  lapelL.rotation.z = 0.24;
  const lapelR = lapelL.clone();
  lapelR.position.x = 0.16; lapelR.rotation.z = -0.24;
  // buttons
  const btn1 = sph(0.023, white, 12, 8); btn1.position.set(0, 0.3, 0.415);
  const btn2 = btn1.clone(); btn2.position.y = 0.16;
  torso.add(jacket, shoulders, beltMesh, buckle, shirtV, lapelL, lapelR, btn1, btn2);

  // ── arms ──
  const mkArm = (side) => {
    const shoulder = new THREE.Group();
    shoulder.position.set(0.43 * side, 1.0, 0);
    const upper = cap(0.105, 0.4, suit); upper.position.y = -0.29;
    const elbow = new THREE.Group();
    elbow.position.y = -0.56;
    const fore = cap(0.09, 0.36, suit); fore.position.y = -0.24;
    const cuff = cyl(0.095, 0.095, 0.05, shirt); cuff.position.y = -0.44;
    const hand = sph(0.095, skin, 16, 12); hand.position.y = -0.52;
    elbow.add(fore, cuff, hand);
    shoulder.add(upper, elbow);
    shoulder.userData.elbow = elbow;
    return shoulder;
  };
  const armL = mkArm(-1), armR = mkArm(1);
  torso.add(armL, armR);

  // ── head ──
  const neck = cyl(0.11, 0.14, 0.2, skin);
  neck.position.y = 1.16;
  torso.add(neck);

  const head = new THREE.Group();
  head.position.y = 1.52;
  torso.add(head);

  const skull = sph(0.42, skin);
  skull.scale.set(0.9, 1.06, 0.94);
  // hair: back-swept cap plus a short front quiff, like the portrait
  const hairCap = shadowed(new THREE.Mesh(
    new THREE.SphereGeometry(0.44, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.42), hair));
  hairCap.scale.set(0.94, 1.0, 0.97);
  hairCap.position.set(0, 0.11, -0.07);
  const quiff = sph(0.16, hair, 16, 12);
  quiff.scale.set(1.5, 0.5, 0.9);
  quiff.position.set(0, 0.4, 0.16);
  quiff.rotation.x = -0.3;
  const sideburnL = box(0.05, 0.18, 0.1, hair);
  sideburnL.position.set(-0.36, -0.02, 0.08);
  const sideburnR = sideburnL.clone(); sideburnR.position.x = 0.36;
  // full beard on the jaw, cheeks and nose left clear
  const beard = shadowed(new THREE.Mesh(
    new THREE.SphereGeometry(0.415, 24, 16, 0, Math.PI * 2, Math.PI * 0.58, Math.PI * 0.42), hair));
  beard.scale.set(0.9, 1.12, 0.92);
  beard.position.set(0, -0.06, 0.07);
  const stache = shadowed(new THREE.Mesh(new THREE.CapsuleGeometry(0.035, 0.13, 4, 10), hair));
  stache.rotation.z = Math.PI / 2;
  stache.position.set(0, -0.155, 0.37);
  // ears
  const earL = sph(0.06, skinDark, 12, 10); earL.position.set(-0.38, 0.02, 0); earL.scale.set(0.5, 1, 0.8);
  const earR = earL.clone(); earR.position.x = 0.38;
  // nose
  const nose = shadowed(new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.08, 4, 10), skinDark));
  nose.position.set(0, -0.01, 0.4);
  // eyes: white + brown iris + pupil, lids blink by scaling
  const mkEye = (side) => {
    const g = new THREE.Group();
    g.position.set(0.14 * side, 0.1, 0.33);
    const ball = sph(0.058, white, 14, 10);
    ball.scale.set(1.15, 1, 0.7);
    const ir = sph(0.028, iris, 12, 8); ir.position.z = 0.038;
    const pupil = sph(0.014, dark, 8, 6); pupil.position.z = 0.06;
    g.add(ball, ir, pupil);
    return g;
  };
  const eyeL = mkEye(-1), eyeR = mkEye(1);
  // brows
  const browL = shadowed(new THREE.Mesh(new THREE.CapsuleGeometry(0.02, 0.1, 4, 8), hair));
  browL.rotation.z = Math.PI / 2 + 0.12;
  browL.position.set(-0.14, 0.21, 0.36);
  const browR = browL.clone(); browR.position.x = 0.14; browR.rotation.z = Math.PI / 2 - 0.12;
  // rectangular glasses
  const mkFrame = (side) => {
    const f = shadowed(new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.012, 10, 24), frameMat));
    f.position.set(0.145 * side, 0.1, 0.39);
    f.scale.set(1.35, 1.05, 1);
    return f;
  };
  const frameL = mkFrame(-1), frameR = mkFrame(1);
  const bridge = box(0.08, 0.015, 0.015, frameMat);
  bridge.position.set(0, 0.13, 0.4);
  const templeL = box(0.015, 0.015, 0.3, frameMat);
  templeL.position.set(-0.31, 0.12, 0.24);
  templeL.rotation.y = 0.22;
  const templeR = templeL.clone(); templeR.position.x = 0.31; templeR.rotation.y = -0.22;

  head.add(skull, hairCap, quiff, sideburnL, sideburnR, beard, stache,
    earL, earR, nose, eyeL, eyeR, browL, browR, frameL, frameR, bridge, templeL, templeR);

  // ── ground: soft real shadow + faint blob ──
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(8, 8),
    new THREE.ShadowMaterial({ opacity: 0.16 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = 0;
  ground.receiveShadow = true;
  scene.add(ground);

  // ── input: cursor on desktop, touch + auto-look on phones ──
  const coarse = matchMedia('(pointer: coarse)').matches;
  const target = new THREE.Vector2(0, 0);

  if (!coarse) {
    addEventListener('pointermove', (e) => {
      target.x = (e.clientX / innerWidth) * 2 - 1;
      target.y = (e.clientY / innerHeight) * 2 - 1;
    }, { passive: true });
  }

  // ── dance state: Zero Bullshit mode, or a tap-triggered burst on touch ──
  let zbDance = 'zb' in document.documentElement.dataset ? 1 : 0;
  let burstUntil = 0;
  let dance = zbDance;
  addEventListener('zbchange', (e) => { zbDance = e.detail.on ? 1 : 0; });

  const bn = document.documentElement.lang === 'bn';
  const hintEl = document.getElementById('stageHint');
  let touchDragging = false;

  if (coarse) {
    // Touch: drag the character to turn him, tap to make him dance.
    stage.style.touchAction = 'pan-y';
    stage.style.cursor = 'pointer';
    let moved = false, startX = 0, startY = 0, baseX = 0, baseY = 0;

    stage.addEventListener('pointerdown', (e) => {
      touchDragging = true; moved = false;
      startX = e.clientX; startY = e.clientY;
      baseX = target.x; baseY = target.y;
      stage.setPointerCapture(e.pointerId);
    });
    stage.addEventListener('pointermove', (e) => {
      if (!touchDragging) return;
      const dx = (e.clientX - startX) / stage.clientWidth;
      const dy = (e.clientY - startY) / stage.clientHeight;
      if (Math.abs(e.clientX - startX) > 6 || Math.abs(e.clientY - startY) > 6) moved = true;
      target.x = THREE.MathUtils.clamp(baseX + dx * 2.4, -1, 1);
      target.y = THREE.MathUtils.clamp(baseY + dy * 2.4, -1, 1);
    });
    const endDrag = () => {
      if (touchDragging && !moved) {
        burstUntil = performance.now() + 6000; // tap → short dance
        if (hintEl) hintEl.textContent = bn ? 'এই তো নাচ!' : 'there you go';
      }
      touchDragging = false;
    };
    stage.addEventListener('pointerup', endDrag);
    stage.addEventListener('pointercancel', () => { touchDragging = false; });

    if (hintEl) hintEl.textContent = bn ? 'ট্যাপ করুন — ও নাচবে · টেনে ঘোরান' : 'tap him to dance · drag to turn';
  } else if (hintEl) {
    hintEl.textContent = bn ? 'কার্সর নাড়ান — ও তাকিয়ে আছে' : 'move your cursor — he’s watching';
  }

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

  // ── idle pose: hands in pockets, like the portrait ──
  // {shoulder x/z, elbow x} per side; dance overrides blend on top.
  const POCKET = { shX: -0.1, shZL: 0.1, elX: -0.45 };

  let nextBlink = 2;
  let blinkT = -1;

  const BPM = 96;
  const clock = new THREE.Clock();
  let elapsed = 0;
  const lerp = THREE.MathUtils.lerp;

  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.05);
    elapsed += dt;
    const danceTarget = Math.max(zbDance, performance.now() < burstUntil ? 1 : 0);
    dance += (danceTarget - dance) * Math.min(1, dt * 3);

    const t = elapsed;
    const beat = (t * BPM) / 60;

    // On touch devices with no cursor, he glances around on his own.
    if (coarse && !touchDragging) {
      target.x += ((Math.sin(t * 0.42) * 0.75) - target.x) * Math.min(1, dt * 0.9);
      target.y += ((Math.sin(t * 0.31) * 0.35) - target.y) * Math.min(1, dt * 0.9);
    }

    // pointer follow (head + slight body turn), eased
    const hx = THREE.MathUtils.clamp(target.x, -1, 1);
    const hy = THREE.MathUtils.clamp(target.y, -1, 1);
    head.rotation.y += ((hx * 0.55) - head.rotation.y) * Math.min(1, dt * 6);
    head.rotation.x += ((hy * 0.3) - head.rotation.x) * Math.min(1, dt * 6);
    character.rotation.y += ((hx * 0.16) - character.rotation.y) * Math.min(1, dt * 3);

    // eyes glance slightly ahead of the head turn
    const glance = hx * 0.02;
    eyeL.position.x = -0.14 + glance;
    eyeR.position.x = 0.14 + glance;

    // idle: breathing, slow weight shift, hands resting in pockets
    const breathe = Math.sin(t * 1.5) * 0.012;
    const shift = Math.sin(t * 0.5) * 0.03;
    torso.scale.y = 1 + breathe * (1 - dance);
    torso.rotation.z = shift * (1 - dance);

    // dance oscillators
    const swing = Math.sin(beat * Math.PI);
    const canDance = dance > 0.01 && !reduced;
    const d = canDance ? dance : 0;

    // arms: blend pocket pose → dance pumps
    armL.rotation.x = lerp(POCKET.shX, -0.7 + swing * 1.0, d);
    armR.rotation.x = lerp(POCKET.shX, -0.7 - swing * 1.0, d);
    armL.rotation.z = lerp(POCKET.shZL + breathe, 0.55 + Math.abs(swing) * 0.35, d);
    armR.rotation.z = lerp(-POCKET.shZL - breathe, -0.55 - Math.abs(swing) * 0.35, d);
    armL.userData.elbow.rotation.x = lerp(POCKET.elX, -1.2 + swing * 0.5, d);
    armR.userData.elbow.rotation.x = lerp(POCKET.elX, -1.2 - swing * 0.5, d);

    // body: bounce, twist, leg kicks on the beat
    character.position.y = Math.abs(Math.sin(beat * Math.PI)) * 0.17 * d;
    character.rotation.z = Math.sin(beat * Math.PI) * 0.06 * d;
    torso.rotation.y = Math.sin(beat * Math.PI * 0.5) * 0.38 * d;
    legL.rotation.x = swing * 0.28 * d;
    legR.rotation.x = -swing * 0.28 * d;
    if (canDance) head.rotation.x += Math.sin(beat * Math.PI * 2) * 0.08 * d;

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

    renderer.render(scene, camera);
  });
}
