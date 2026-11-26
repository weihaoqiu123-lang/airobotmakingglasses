import * as T from 'three';
import { gsap } from 'gsap';
import { box, disposeModel, drawFlatPreview, makeGlasses } from './glasses.js';
import { buildWorkshop, dockPoint, home } from './workshop.js';
import { createRobotMotion, resetMaterial, runChoreography, walk } from './choreography.js';
import { createPhotoStudio } from './photo.js';
import { defaultDesign, productionSeconds, rechargeSeconds } from './order.js';

function rendererFor(host) {
  const attributes = { alpha: false, antialias: true, preserveDrawingBuffer: true };
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('webgl2', attributes);
  if (!context) return null;
  const renderer = new T.WebGLRenderer({ canvas, context, ...attributes });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFShadowMap;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.04;
  host.append(canvas);
  return renderer;
}

function viewCamera(position, target) {
  const camera = new T.OrthographicCamera(-4, 4, 2, -2, .12, 55);
  camera.position.set(...position);
  camera.lookAt(...target);
  return camera;
}

function fitCamera(camera, aspect, width, height) {
  const fullHeight = Math.max(height, width / aspect);
  const fullWidth = aspect * fullHeight;
  camera.left = -fullWidth / 2;
  camera.right = fullWidth / 2;
  camera.top = fullHeight / 2;
  camera.bottom = -fullHeight / 2;
  camera.updateProjectionMatrix();
}

function createProductStage() {
  const scene = new T.Scene();
  scene.background = new T.Color('#0d162d');
  scene.fog = new T.Fog('#0f1930', 8, 28);
  const camera = viewCamera([4.75, 2.62, 5.4], [0, -.11, -.45]);
  const key = new T.DirectionalLight('#e8faff', 3);
  key.position.set(-3, 6, 5);
  const rim = new T.DirectionalLight('#ff7ac4', 2.15);
  rim.position.set(4, 2, -4);
  scene.add(key, rim, new T.HemisphereLight('#b9f9ff', '#7e4483', 1.5));
  const mat = new T.MeshStandardMaterial({ color: '#273953', roughness: .45 });
  const floor = new T.Mesh(new T.PlaneGeometry(100, 100), mat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -.79;
  scene.add(floor);
  box(scene, [2.69, .23, 1.87], [0, -.65, -.43], mat, .092);
  box(scene, [2.68, .019, 1.86], [0, -.69, -.43], new T.MeshBasicMaterial({color: '#4cfff1'}), .009);
  const pivot = new T.Group();
  pivot.position.z = -.44;
  const cradle = new T.Group();
  cradle.position.z = .44;
  pivot.add(cradle);
  scene.add(pivot);
  return { scene, camera, pivot, cradle };
}

function idleAnimation(actors, motion) {
  const idle = gsap.timeline({ repeat: -1, paused: true });
  const head = actors.head.rotation;
  const hand = motion.baseHand;
  idle.to(head, { y: .37, x: -.07, duration: 1.16, ease: 'sine.inOut' })
    .to(hand, { x: .93, y: 1.14, z: .59, duration: .96 }, .35)
    .to(head, { y: -.27, x: .08, duration: 1.25, ease: 'sine.inOut' }, 1.3)
    .to(hand, { x: .86, y: .79, z: .44, duration: 1.12 }, 1.65)
    .to(actors.armLeft.hand, { y: .91, z: .34, duration: .69, repeat: 1, yoyo: true }, 2.3)
    .call(actors.faceStyle, [9], 2.7)
    .call(actors.faceStyle, [80], 2.86)
    .to(head, { y: 0, x: 0, duration: 1.05 }, 3.34);
  return idle;
}

export function createStage(host, onRobotState) {
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const renderer = rendererFor(host);
  const workshop = renderer ? new T.Scene() : null;
  const actors = workshop ? buildWorkshop(workshop) : null;
  const motion = actors ? createRobotMotion(actors) : null;
  const product = workshop ? new T.Group() : null;
  const workshopCamera = workshop ? viewCamera([4.8, 4.25, 12.3], [-.35, 1.48, .16]) : null;
  const framing = { x: -.35, y: 1.48, z: .16, zoom: 1 };
  const preview = renderer ? createProductStage() : null;
  const idle = actors ? idleAnimation(actors, motion) : null;
  let design;
  let image;
  let panel = 'workshop';
  let playhead;
  let paused = false;
  let active = true;
  let flatImage;
  let captures = {};
  let photoStudio;
  let previewMotion;
  let robotTravel;
  let chargeTimer;
  let robotState = 'ready';
  let pointer;

  function notify(state, remaining) {
    const changed = robotState !== state;
    robotState = state;
    onRobotState?.(state, remaining, changed);
  }

  function render() {
    if (!renderer || panel === 'photo') return;
    if (panel === 'product') {
      renderer.render(preview.scene, preview.camera);
      return;
    }
    motion.apply();
    if (workshopCamera.zoom !== framing.zoom) {
      workshopCamera.zoom = framing.zoom;
      workshopCamera.updateProjectionMatrix();
    }
    workshopCamera.lookAt(framing.x, framing.y, framing.z);
    renderer.render(workshop, workshopCamera);
  }

  function tick() {
    const moving = panel === 'product' ? previewMotion?.isActive() :
      idle?.isActive() || playhead?.isActive() || robotTravel?.isActive();
    if (active && moving && !paused && !reducedMotion.matches) render();
  }

  function resize() {
    const width = Math.max(1, host.clientWidth);
    const height = Math.max(1, host.clientHeight);
    renderer.setSize(width, height, false);
    const aspect = width / height;
    fitCamera(workshopCamera, aspect, 9.72, 4.82);
    fitCamera(preview.camera, aspect, 3.35, 2.02);
    render();
  }

  function resetProduct() {
    if (!product) return;
    product.visible = false;
    product.position.set(.32, 1.25, .25);
    product.rotation.set(.015, -.15, 0);
    product.scale.setScalar(.68);
    const model = product.children[0];
    if (model) {
      model.userData.temples.forEach(temple => { temple.rotation.y = 0; });
      resetMaterial(model, actors.billet);
    }
  }

  function setDesign(next, logoImage) {
    const frameChanged = design && next.frame !== design.frame;
    const colorChanged = design && next.color !== design.color;
    const logoChanged = design && next.logo !== design.logo;
    const quantityChanged = design && next.quantity !== design.quantity;
    const modelChanged = !design || frameChanged || colorChanged || logoChanged;
    actors?.screenPaint(quantityChanged ? 'QTY SET' : 'READY', next);
    design = { ...next };
    image = logoImage;
    if (modelChanged) {
      captures = {};
      if (renderer) {
        for (const group of [product, preview.cradle]) {
          for (const previous of [...group.children]) {
            group.remove(previous);
            disposeModel(previous);
          }
          group.add(makeGlasses(design, image));
        }
        resetProduct();
        if (!paused && !reducedMotion.matches && (frameChanged || colorChanged || logoChanged)) {
          previewMotion?.kill();
          const angle = logoChanged ? -.29 : frameChanged ? .24 : -.16;
          previewMotion = gsap.fromTo(preview.pivot.rotation, { y: angle }, {
            y: 0, duration: .85, ease: 'power2.out', onComplete: render,
          });
        }
      }
    }
    if (flatImage && panel === 'product') flatImage.src = capture('product');
    render();
  }

  function capture(view = 'photo') {
    if (captures[view]) return captures[view];
    if (!renderer) {
      const flat = drawFlatPreview(design, image);
      captures = { photo: flat, product: flat };
      return flat;
    }
    if (view === 'photo') {
      photoStudio ??= createPhotoStudio(renderer);
      captures.photo = photoStudio.capture(design, image);
    } else {
      renderer.setSize(940, 550, false);
      fitCamera(preview.camera, 940 / 550, 3.06, 1.92);
      const angle = preview.pivot.rotation.y;
      preview.pivot.rotation.y = 0;
      renderer.render(preview.scene, preview.camera);
      captures.product = renderer.domElement.toDataURL('image/png');
      preview.pivot.rotation.y = angle;
    }
    resize();
    return captures[view];
  }

  function setView(view) {
    panel = view;
    host.dataset.orbit = String(Boolean(renderer && view === 'product'));
    if (renderer) renderer.domElement.hidden = view === 'photo';
    else {
      if (!flatImage && view === 'product') {
        flatImage = document.createElement('img');
        flatImage.className = 'fallback-product';
        flatImage.alt = '';
        host.append(flatImage);
      }
      if (flatImage) {
        flatImage.hidden = view !== 'product';
        if (view === 'product') flatImage.src = capture('product');
      }
    }
    updateMotion();
  }

  function updateMotion() {
    idle?.paused(robotState !== 'ready' || paused || !active || reducedMotion.matches || panel !== 'workshop');
    if (previewMotion?.progress() < 1) {
      if (reducedMotion.matches) previewMotion.progress(1);
      else previewMotion.paused(paused || !active || panel !== 'product');
    }
    if (playhead?.progress() < 1) playhead.paused(paused);
    render();
  }

  function reset() {
    if (playhead) playhead.kill();
    playhead = null;
    previewMotion?.kill();
    if (actors) {
      actors.ticket.visible = false;
      actors.ticket.rotation.set(0, 0, 0);
      actors.beamMaterial.color.set('#74fff1');
      actors.beamMaterial.opacity = 0;
      actors.light.intensity = 0;
      actors.lever.rotation.x = 0;
      actors.lid.rotation.x = -1.26;
      actors.gantry.position.set(-.23, 2.42, .052);
      preview.pivot.rotation.y = 0;
      Object.assign(framing, { x: -.35, y: 1.48, z: .16, zoom: 1 });
      resetProduct();
    }
    updateMotion();
  }

  function cancelCharging() {
    clearInterval(chargeTimer);
    chargeTimer = undefined;
    robotTravel?.kill();
    robotTravel = undefined;
    actors?.chargeLevel(0, false);
  }

  function readyAfterCharge() {
    clearInterval(chargeTimer);
    chargeTimer = undefined;
    notify('waking');
    actors?.chargeLevel(1, false);
    actors?.faceStyle(80);
    if (!actors) {
      notify('ready');
      return;
    }
    robotTravel = gsap.timeline({ onComplete() {
      notify('ready');
      render();
      updateMotion();
    } });
    walk(robotTravel, actors, motion, [-3.84, .17, .57], 0, 0, .74);
    walk(robotTravel, actors, motion, home, 1.14, .76, 1.04);
    robotTravel.to(actors.robot.rotation, { y: .02, duration: .35 }, 1.8);
  }

  function charge() {
    notify('charging', rechargeSeconds);
    actors?.faceStyle(11);
    actors?.chargeLevel(0, true);
    if (motion) {
      motion.baseHand.set(.61, .81, .28);
      actors.armLeft.hand.set(-.61, .81, .28);
    }
    render();
    const deadline = Date.now() + rechargeSeconds * 1000;
    let previous = rechargeSeconds;
    chargeTimer = setInterval(() => {
      const seconds = Math.max(0, (deadline - Date.now()) / 1000);
      const remaining = Math.ceil(seconds);
      if (remaining !== previous) {
        previous = remaining;
        notify('charging', remaining);
        actors?.chargeLevel(1 - seconds / rechargeSeconds, true);
        render();
      }
      if (seconds === 0) readyAfterCharge();
    }, 100);
  }

  function returnToDock() {
    notify('returning');
    if (!actors) {
      robotTravel = gsap.delayedCall(3.6, charge);
      return;
    }
    motion.clear();
    robotTravel = gsap.timeline({ onComplete: charge });
    walk(robotTravel, actors, motion, [1.74, .17, 1.71], -.75, 0, .52);
    walk(robotTravel, actors, motion, [-3.84, .17, 1.64], -1.51, .53, 3.00);
    walk(robotTravel, actors, motion, dockPoint, -Math.PI + .05, 3.54, 1.22);
    robotTravel.to(actors.robot.rotation, { y: .03, duration: .49 }, 4.78)
      .to(actors.head.rotation, { y: .02, x: .15, duration: .51 }, 4.78);
  }

  function start(order, callbacks) {
    const interrupted = robotState === 'charging' || robotState === 'returning' || robotState === 'waking';
    cancelCharging();
    reset();
    idle?.pause(0, true);
    motion?.clear();
    actors?.faceStyle(80);
    notify(interrupted ? 'waking' : 'working');
    actors?.screenPaint('ORDER IN', order.design, order);
    const clock = { seconds: 0 };
    let renderedSlice = -1;
    playhead = gsap.timeline({
      paused: true,
      onUpdate: () => {
        callbacks.update(clock.seconds);
        const slice = Math.floor(clock.seconds / 4);
        if (reducedMotion.matches && slice !== renderedSlice) {
          renderedSlice = slice;
          render();
        }
      },
      onComplete() {
        callbacks.complete();
        returnToDock();
      },
    });
    playhead.to(clock, { seconds: productionSeconds, ease: 'none', duration: productionSeconds }, 0);
    if (interrupted) playhead.call(() => notify('working'), [], 2.8);
    if (actors) runChoreography(playhead, actors, motion, product, order, framing);
    updateMotion();
  }

  function status(mode, order) {
    actors?.screenPaint(mode, order.design, order);
    render();
  }

  if (renderer) {
    workshop.add(product);
    gsap.ticker.add(tick);
    new ResizeObserver(resize).observe(host);
    new IntersectionObserver(([entry]) => {
      active = entry.isIntersecting;
      updateMotion();
    }).observe(host);
    reducedMotion.addEventListener('change', updateMotion);
    host.addEventListener('pointerdown', event => {
      if (panel !== 'product' || event.button !== 0) return;
      previewMotion?.kill();
      host.setPointerCapture(event.pointerId);
      pointer = { id: event.pointerId, start: event.clientX, angle: preview.pivot.rotation.y };
    });
    host.addEventListener('pointermove', event => {
      if (pointer?.id !== event.pointerId || panel !== 'product') return;
      preview.pivot.rotation.y = pointer.angle + (event.clientX - pointer.start) * .012;
      render();
    });
    host.addEventListener('lostpointercapture', () => { pointer = null; });
    resize();
    updateMotion();
  }
  setDesign(defaultDesign);

  return {
    enabled: Boolean(renderer), setDesign, setView, capture, start, status, reset,
    pause(value) { paused = value; updateMotion(); },
    speed(value) { playhead?.timeScale(value); },
  };
}
