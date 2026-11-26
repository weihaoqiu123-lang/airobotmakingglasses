import { Color, Vector3 } from 'three';
import { colors, pairCues as cue, receiptFor } from './order.js';
import { dockPoint, home } from './workshop.js';

const neutral = new Color('#87949d');
const parkedHand = [.83, .78, .45];
export const framingHome = { x: .04, y: 1.53, z: .20, zoom: 1 };
const stockClosed = -.16;
const stockOpen = 1.39;
const workPosition = [-1.09, .17, 1.51];
const jigPositions = [[-.98, .638, 1.17], [-.88, .638, 1.34]];

export function createRobotMotion(actors) {
  const baseHand = new Vector3(...parkedHand);
  const targetPosition = new Vector3();
  const grip = { weight: 0, target: null, offset: new Vector3() };
  const gait = { phase: 0, weight: 0 };
  return {
    baseHand, gait, grip,
    clear() {
      baseHand.set(...parkedHand);
      grip.weight = 0;
      grip.target = null;
      gait.weight = 0;
      actors.armLeft.hand.set(-.83, .78, .22);
    },
    apply() {
      actors.legs.forEach((leg, index) => {
        const swing = Math.sin(gait.phase + index * Math.PI);
        leg.position.z = swing * .205 * gait.weight;
        leg.position.y = Math.max(0, swing) * .13 * gait.weight;
        leg.rotation.x = swing * .14 * gait.weight;
      });
      const hand = actors.armRight.hand.copy(baseHand);
      if (grip.target && grip.weight) {
        grip.target.getWorldPosition(targetPosition).add(grip.offset);
        actors.robot.worldToLocal(targetPosition);
        hand.lerp(targetPosition, grip.weight);
      } else {
        hand.z += Math.sin(gait.phase) * .15 * gait.weight;
      }
      actors.armRight.update();
      actors.armLeft.update();
    },
  };
}

export function walk(timeline, actors, motion, to, turn, time, duration) {
  timeline
    .to(actors.robot.rotation, { y: turn, duration: Math.min(.32, duration), ease: 'sine.inOut' }, time)
    .to(motion.gait, { weight: 1, duration: .18 }, time)
    .to(motion.gait, { phase: '+=' + (Math.max(2, Math.round(duration * 3.2)) * Math.PI), duration, ease: 'none' }, time)
    .to(actors.robot.position, { x: to[0], y: to[1], z: to[2], duration, ease: 'power1.inOut' }, time)
    .to(motion.gait, { weight: 0, duration: .21 }, time + duration - .21);
}

function gripAt(timeline, motion, target, start, offset, duration = .22) {
  timeline.call(() => {
    motion.grip.target = target;
    motion.grip.offset.set(...offset);
  }, [], start);
  timeline.to(motion.grip, { weight: 1, duration }, start);
}

function releaseAt(timeline, motion, time) {
  timeline.to(motion.grip, { weight: 0, duration: .19 }, time);
}

export function resetPair(actors, product, nextBox = false) {
  const model = product.children[0];
  if (!model) return;
  const { acetate, glass, logoMaterials, temples } = model.userData;
  model.userData.assemblyPoints ??= temples.map(temple => temple.position.clone());
  acetate.color.copy(neutral);
  acetate.roughness = .66;
  glass.opacity = 0;
  logoMaterials.forEach(material => { material.opacity = 0; });
  temples.forEach((temple, index) => {
    temple.position.copy(model.userData.assemblyPoints[index]);
    temple.rotation.set(0, 0, 0);
    temple.visible = false;
  });
  product.visible = false;
  product.position.set(.32, 1.49, .43);
  product.rotation.set(0, -.11, 0);
  product.scale.setScalar(.60);
  const { billet, drawer, scraps, gun, mist, carton, lid } = actors;
  drawer.position.z = stockClosed;
  billet.visible = true;
  billet.position.set(.32, .654, stockClosed);
  billet.rotation.set(0, 0, 0);
  billet.scale.setScalar(1);
  actors.cutScore.userData.material.opacity = 0;
  scraps.forEach((scrap, index) => {
    scrap.visible = false;
    scrap.position.set(.32, 1.24, index ? .88 : .10);
    scrap.rotation.set(0, 0, 0);
    scrap.scale.setScalar(1);
  });
  gun.position.copy(gun.userData.parked);
  gun.rotation.set(0, 0, 0);
  mist.opacity = 0;
  carton.visible = true;
  carton.position.x = nextBox ? 2.2 : 0;
  lid.rotation.x = nextBox ? 0 : -1.35;
  actors.lever.rotation.x = 0;
  actors.gantry.position.set(-.23, 2.42, .052);
  actors.beamMaterial.color.set('#74fff1');
  actors.beamMaterial.opacity = 0;
  actors.light.intensity = 0;
}

export function receiptTiming(quantity) {
  const spec = receiptFor(quantity);
  const printAt = .38;
  const readAt = printAt + spec.seconds + .96;
  const insertAt = readAt + (spec.reaction ? .48 + spec.reaction * .31 : .62);
  return { ...spec, printAt, readAt, insertAt, duration: insertAt + 1.60 };
}

export function animateReceipt(timeline, actors, motion, order, timing) {
  const { ticket, robot, head, reaction } = actors;
  const { printAt, readAt, insertAt, length, seconds, reaction: surprise } = timing;
  actors.printTicket(order, timing);
  reaction.visible = false;
  ticket.position.set(-1.04, 1.276, 1.169);
  ticket.rotation.set(0, 0, 0);
  ticket.scale.set(1, .012, 1);
  const distance = Math.hypot(robot.position.x - home[0], robot.position.z - home[2]);
  if (distance > .11) walk(timeline, actors, motion, home, .05, 0, .62);
  timeline.set(ticket, {visible: true}, printAt)
    .to(ticket.scale, {y:length, duration:seconds, ease:'none'}, printAt)
    .to(head.rotation, {y:.39, x:.14, duration:.47}, printAt + .12);
  const takeAt = printAt + seconds;
  gripAt(timeline, motion, ticket, takeAt, [-.16, -.07, .092], .34);
  timeline.to(ticket.position, {x:-1.59, y:2.06, z:1.31, duration:.62, ease:'power1.inOut'}, takeAt + .34);
  if (surprise) {
    timeline.call(() => actors.faceStyle(86 + surprise * 15, true), [], readAt)
      .set(reaction, {visible:true}, readAt)
      .fromTo(reaction.scale, {x:.1,y:.1,z:.1}, {x:.72+surprise*.24,y:.72+surprise*.24,z:.72+surprise*.24,duration:.31,ease:'back.out(2)'}, readAt)
      .to(head.rotation, {y:surprise > 1 ? -.15 : .23,x:-.13,duration:.38}, readAt)
      .set(reaction,{visible:false},insertAt)
      .call(() => actors.faceStyle(80), [], insertAt);
  } else {
    timeline.to(head.rotation, {x:.31,duration:.24,yoyo:true,repeat:1}, readAt);
  }
  timeline.to(head.rotation,{y:.42,x:.02,duration:.35},insertAt)
    .to(ticket.position,{x:-.75,y:2.47,z:.672,duration:.69,ease:'power2.inOut'},insertAt)
    .to(ticket.rotation,{x:-.48,duration:.49},insertAt + .33)
    .to(ticket.scale,{y:.012,duration:.45,ease:'power2.in'},insertAt + .70)
    .set(ticket,{visible:false},insertAt + 1.15);
  releaseAt(timeline, motion, insertAt + 1.20);
}

export function animatePair(timeline, actors, motion, product, order, frame, nextBox) {
  const { head, drawer, billet, scraps, lever, gantry, light, beamMaterial: beam, gun, mist, carton, lidGrip, lid, rollers } = actors;
  const model = product.children[0];
  const { acetate, glass, logoMaterials, temples, assemblyPoints } = model.userData;
  const finish = new Color(colors[order.design.color].hex);
  const hand = motion.baseHand;
  if (nextBox) {
    timeline.to(carton.position,{x:0,duration:1.10,ease:'power1.out'},.02)
      .to(lid.rotation,{x:-1.35,duration:.56},1.13);
  }
  walk(timeline, actors, motion, workPosition, 1.08, 0, 1.45);
  timeline.to(frame,{x:-.14,y:1.30,z:.66,zoom:1.12,duration:1.1},.25)
    .to(head.rotation,{x:.39,y:-.10,duration:.42},1.31);
  gripAt(timeline, motion, drawer, 1.45, [-.37,.088,.866]);
  timeline.to(drawer.position,{z:stockOpen,duration:1.15,ease:'power2.inOut'},1.71)
    .to(billet.position,{z:stockOpen,duration:1.15,ease:'power2.inOut'},1.71);
  releaseAt(timeline, motion, 2.88);
  gripAt(timeline, motion, billet, 3.16, [-.56,.10,.16]);
  timeline.to(billet.position,{y:1.53,duration:.60,ease:'power2.inOut'},3.42)
    .to(billet.position,{z:.44,duration:.69,ease:'power2.inOut'},4.02)
    .to(billet.position,{y:1.23,duration:.35,ease:'power1.in'},4.71);
  releaseAt(timeline, motion, 5.07);
  gripAt(timeline, motion, drawer, 5.29, [-.37,.088,.866], .13);
  timeline.to(drawer.position,{z:stockClosed,duration:.56,ease:'power2.inOut'},5.43);
  releaseAt(timeline, motion, 5.99);

  gripAt(timeline, motion, lever, cue.cutting + .21, [0,.25,.085], .18);
  timeline.to(lever.rotation,{x:.35,duration:.24,yoyo:true,repeat:1},cue.cutting+.41)
    .to(frame,{x:.18,y:1.52,z:.42,zoom:1.24,duration:.96},6.32)
    .to(beam,{opacity:.81,duration:.24},6.82)
    .to(light,{intensity:5.4,duration:.28},6.82)
    .to(gantry.position,{x:.30,duration:.52,repeat:4,yoyo:true,ease:'sine.inOut'},6.95)
    .to(actors.cutScore.userData.material,{opacity:1,duration:.77},7.25)
    .to(billet.scale,{y:.2,duration:.82},7.82)
    .set(product,{visible:true},8.64)
    .set(scraps,{visible:true},8.64)
    .set(billet,{visible:false},8.64)
    .fromTo(product.rotation,{x:-1.13},{x:0,duration:1.05,ease:'power1.inOut'},8.68)
    .fromTo(product.position,{y:1.26},{y:1.47,duration:1.02,ease:'power1.out'},8.68)
    .to(beam,{opacity:0,duration:.30},9.62)
    .to(light,{intensity:0,duration:.30},9.62);
  releaseAt(timeline, motion, 7.14);

  timeline.to(head.rotation,{y:-.23,x:.40,duration:.54},cue.temples);
  for (let i = 0; i < temples.length; i++) {
    const start = cue.temples + i * 1.65;
    const raw = scraps[i];
    const temple = temples[i];
    const [x,y,z] = jigPositions[i];
    gripAt(timeline, motion, raw, start, [-.29,.07,.07]);
    timeline.to(raw.position,{y:1.50,duration:.23},start+.22)
      .to(raw.position,{x,y:y+.09,z,duration:.56,ease:'power1.inOut'},start+.45)
      .to(raw.scale,{x:.74,z:.55,duration:.38},start+1.01)
      .set(raw,{visible:false},start+1.39)
      .call(() => {
        temple.position.copy(product.worldToLocal(new Vector3(x-.18,y+.09,z)));
        temple.rotation.set(0,-Math.PI/2,0);
        temple.visible = true;
      },[],start+1.39);
    releaseAt(timeline,motion,start+1.41);
  }

  timeline.to(head.rotation,{y:.09,x:.16,duration:.37},cue.assembly);
  temples.forEach((temple,index) => {
    const start = cue.assembly + index * 1.42;
    gripAt(timeline,motion,temple,start,[-.10,.07,.08]);
    timeline.to(temple.position,{y:assemblyPoints[index].y+.25,duration:.31},start+.24)
      .to(temple.position,{x:assemblyPoints[index].x,z:assemblyPoints[index].z,duration:.56,ease:'power2.inOut'},start+.55)
      .to(temple.rotation,{y:0,duration:.57},start+.55)
      .to(temple.position,{y:assemblyPoints[index].y,duration:.20},start+1.10);
    releaseAt(timeline,motion,start+1.31);
  });

  gripAt(timeline,motion,gun,cue.color,[-.09,-.04,.015]);
  timeline.to(gun.position,{x:-.49,y:1.60,z:.55,duration:.68,ease:'power2.out'},17.3)
    .set(mist.color,{r:finish.r+.16,g:finish.g+.16,b:finish.b+.16},17.85)
    .to(mist,{opacity:.62,duration:.23},17.94)
    .to(gun.position,{y:1.37,z:.71,duration:.57,yoyo:true,repeat:2,ease:'sine.inOut'},18.12)
    .to(acetate.color,{r:finish.r,g:finish.g,b:finish.b,duration:1.77,ease:'power1.inOut'},18.02)
    .to(acetate,{roughness:.23,duration:1.56},18.08)
    .to(glass,{opacity:.22,duration:.67},19.36)
    .to(mist,{opacity:0,duration:.26},19.86)
    .to(gun.position,{x:gun.userData.parked.x,y:gun.userData.parked.y,z:gun.userData.parked.z,duration:.53,ease:'power1.inOut'},20.10);
  releaseAt(timeline,motion,20.64);
  if (logoMaterials.length) {
    timeline.set(beam.color,{r:1,g:.11,b:.52},cue.marking)
      .to(beam,{opacity:.45,duration:.44,yoyo:true,repeat:1},20.83)
      .to(logoMaterials,{opacity:1,duration:.77},20.99);
  }
  gripAt(timeline,motion,product,cue.inspection,[-.35,.044,.028]);
  timeline.to(product.position,{x:.08,y:1.80,z:1.43,duration:.67,ease:'power2.out'},22.25)
    .to(product.rotation,{y:-.56,x:.11,duration:.90},22.63)
    .to(head.rotation,{y:.02,x:-.17,duration:.46},22.88)
    .to(frame,{x:.56,y:1.52,z:.85,zoom:1.19,duration:1.06},23.06);

  walk(timeline,actors,motion,[1.91,.17,1.43],1.21,cue.packing,1.95);
  timeline.to(product.position,{x:2.89,y:1.85,z:.77,duration:1.95,ease:'power1.inOut'},cue.packing)
    .to(frame,{x:1.48,y:1.48,z:.45,zoom:1.07,duration:1.8},24.12)
    .to(temples[0].rotation,{y:-1.39,duration:.62},25.35)
    .to(temples[1].rotation,{y:1.51,duration:.65},25.52)
    .to(product.rotation,{y:0,x:-Math.PI/2,duration:.58},25.70)
    .to(product.scale,{x:.42,y:.42,z:.42,duration:.52},25.72)
    .to(product.position,{y:1.48,z:.655,duration:.45,ease:'power2.inOut'},26.14);
  releaseAt(timeline,motion,26.63);
  gripAt(timeline,motion,lidGrip,26.91,[-.03,.085,.058],.15);
  timeline.to(lid.rotation,{x:0,duration:.57,ease:'power2.inOut'},27.07)
    .set(product,{visible:false},27.65);
  releaseAt(timeline,motion,27.72);
  timeline.to(carton.position,{x:3.09,duration:1.91,ease:'sine.inOut'},cue.conveyor)
    .to(rollers.map(roll=>roll.rotation),{y:'-='+Math.PI*7.8,duration:1.91,ease:'sine.inOut'},cue.conveyor)
    .to(frame,{x:2.17,y:1.46,z:.49,zoom:1.06,duration:1.05},cue.conveyor)
    .set(carton,{visible:false},29.95);
}

export function dockApproach() {
  return [dockPoint[0], .17, .69];
}
