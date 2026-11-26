import { Color, Vector3 } from 'three';
import { colors, fabricationCues as cue } from './order.js';
import { home } from './workshop.js';

const neutral = new Color('#87949d');
const parkedHand = [.83, .78, .45];

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
        targetPosition.copy(grip.target.position).add(grip.offset);
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
    .to(actors.robot.rotation, { y: turn, duration: .34, ease: 'sine.inOut' }, time)
    .to(motion.gait, { weight: 1, duration: .2 }, time)
    .to(motion.gait, { phase: '+=' + (Math.max(2, Math.round(duration * 2.8)) * Math.PI), duration, ease: 'none' }, time)
    .to(actors.robot.position, { x: to[0], y: to[1], z: to[2], duration, ease: 'power1.inOut' }, time)
    .to(motion.gait, { weight: 0, duration: .25 }, time + duration - .25);
}

export function resetMaterial(model, billet) {
  const { acetate, glass, logoMaterials } = model.userData;
  acetate.color.copy(neutral);
  acetate.roughness = .68;
  glass.opacity = 0;
  logoMaterials.forEach(material => { material.opacity = 0; });
  billet.visible = true;
  billet.position.set(.24, 1.182, 1.29);
  billet.rotation.set(0, 0, 0);
  billet.scale.setScalar(1);
}

export function runChoreography(timeline, actors, motion, product, order, framing) {
  const { robot, ticket, head, gantry, beamMaterial: beam, lid, billet, lever } = actors;
  const hand = motion.baseHand;
  const { acetate, glass, logoMaterials, temples: [leftTemple, rightTemple] } = product.children[0].userData;
  const finish = new Color(colors[order.design.color].hex);
  const needsWalk = Math.hypot(robot.position.x - home[0], robot.position.z - home[2]) > .09;
  const insideDock = robot.position.x < -3.4 && robot.position.z < .3;
  if (insideDock) {
    walk(timeline, actors, motion, [robot.position.x, .17, .54], 0, 0, .78);
    walk(timeline, actors, motion, home, Math.PI / 2, .79, 1.91);
  } else if (needsWalk) {
    walk(timeline, actors, motion, home, Math.PI / 2, 0, 2.7);
  }

  function attach(target, time, offset) {
    timeline.call(() => {
      motion.grip.target = target;
      motion.grip.offset.set(...offset);
    }, [], time);
    timeline.to(motion.grip, { weight: 1, duration: .36 }, time);
  }
  function release(time) {
    timeline.to(motion.grip, { weight: 0, duration: .3 }, time);
  }

  actors.printTicket(order);
  timeline
    .to(robot.rotation, { y: .08, duration: .4 }, needsWalk ? 2.7 : 0)
    .set(ticket, { visible: true }, .64)
    .fromTo(ticket.position, { x: -1.04, y: 1.17, z: .862 }, { y: 1.292, duration: 1.8 }, .64)
    .fromTo(ticket.scale, { y: .04 }, { y: 1, duration: 1.8 }, .64)
    .to(head.rotation, { y: .46, x: .15, duration: .85 }, 2.7)
    .to(hand, { x: 1.26, y: 1.27, z: .8, duration: .9 }, 3.05)
    .to(hand, { x: 1.12, y: 1.58, z: .86, duration: .7 }, 4)
    .to(ticket.position, { x: -1.19, y: 1.74, z: .89, duration: .7 }, 4)
    .to(head.rotation, { x: .28, duration: .24, yoyo: true, repeat: 3 }, 4.86)
    .to(hand, { x: 1.52, y: 2.14, z: .61, duration: .9 }, 6.48)
    .to(ticket.position, { x: -.75, y: 2.31, z: .65, duration: .9 }, 6.48)
    .to(ticket.rotation, { x: -.68, duration: .68 }, 7.15)
    .to(ticket.scale, { y: .06, duration: .55 }, 7.85)
    .set(ticket, { visible: false }, 8.45);

  walk(timeline, actors, motion, [-1.15, .17, 1.3], 1.25, 8.52, 2.12);
  attach(billet, 10.9, [-.47, .025, .03]);
  timeline
    .to(head.rotation, { x: .24, y: -.15, duration: .7 }, 10.7)
    .to(billet.position, { x: .27, y: 1.46, z: 1.26, duration: .65 }, 11.3)
    .to(billet.position, { x: .32, y: 1.22, z: .35, duration: 1.86, ease: 'power2.inOut' }, 12)
    .to(hand, { x: .56, y: 1.85, z: .64, duration: .6 }, 13.8)
    .to(framing, { x: .12, y: 1.54, z: .38, zoom: 1.16, duration: 1.35, ease: 'power2.inOut' }, 14.2);
  release(13.95);
  timeline
    .to(lever.rotation, { x: .55, duration: .36, yoyo: true, repeat: 1 }, 14.1)
    .to(hand, { x: .5, y: 1.72, z: .74, duration: .36, yoyo: true, repeat: 1 }, 14.1)
    .to(beam, { opacity: .71, duration: .44 }, cue.cutting)
    .to(actors.light, { intensity: 5.5, duration: .44 }, cue.cutting)
    .to(gantry.position, { x: .36, duration: 1.2, repeat: 20, yoyo: true, ease: 'sine.inOut' }, cue.cutting)
    .to(billet.scale, { x: .43, y: .12, z: .51, duration: 2.55, ease: 'power2.in' }, 17)
    .set(product, { visible: true }, 18.4)
    .fromTo(product.scale, { x: .29, y: .16, z: .39 }, { x: .68, y: .68, z: .68, duration: 4.1, ease: 'power2.out' }, 18.4)
    .to(product.position, { y: 1.50, duration: 2.5 }, 18.6)
    .set(billet, { visible: false }, 19.55)
    .to(head.rotation, { x: .32, y: .14, duration: 1.4, repeat: 3, yoyo: true, ease: 'sine.inOut' }, 16)
    .to(actors.armLeft.hand, { x: -.61, y: 1.3, z: .68, duration: 1.2, repeat: 4, yoyo: true }, 17)
    .to(beam, { opacity: .46, duration: .55, repeat: 22, yoyo: true, ease: 'sine.inOut' }, 18)
    .to(hand, { x: .43, y: 1.75, z: .79, duration: .66, repeat: 3, yoyo: true }, cue.color)
    .to(acetate.color, { r: finish.r, g: finish.g, b: finish.b, duration: 6.5, ease: 'power1.inOut' }, cue.color)
    .to(acetate, { roughness: .23, duration: 6.5 }, cue.color)
    .to(product.rotation, { y: -.52, duration: 2.3, yoyo: true, repeat: 2, ease: 'sine.inOut' }, cue.color)
    .to(glass, { opacity: .22, duration: 2.6 }, 31)
    .set(beam.color, { r: 1, g: .11, b: .52 }, cue.marking)
    .to(product.rotation, { y: -.59, duration: 2 }, cue.marking);

  if (logoMaterials.length) {
    timeline.to(logoMaterials, { opacity: 1, duration: 3.1 }, 35);
  }
  timeline
    .to(hand, { x: .6, y: 1.42, z: .83, duration: .85, repeat: 3, yoyo: true }, cue.marking)
    .to(beam, { opacity: 0, duration: .92 }, 41.3)
    .to(actors.light, { intensity: 0, duration: .92 }, 41.3)
    .to(gantry.position, { x: -.23, y: 2.42, duration: 1.15 }, 42)
    .to(product.position, { y: 1.56, z: 1.2, duration: 2.4, ease: 'power2.inOut' }, 41.7)
    .to(head.rotation, { y: -.07, x: .34, duration: 1.1 }, 43.5);
  attach(product, 44.3, [-.38, .015, -.018]);
  timeline
    .to(product.position, { x: .19, y: 1.96, z: 1.39, duration: 1.64, ease: 'power2.inOut' }, 45.25)
    .to(product.rotation, { y: -.64, x: .14, duration: 1.25 }, 45.28)
    .to(head.rotation, { x: .08, duration: .85 }, 46.2)
    .to(framing, { x: .54, y: 1.57, z: 1.02, zoom: 1.23, duration: 1.3 }, 45.7);

  walk(timeline, actors, motion, [1.9, .17, 1.38], 1.29, 48.4, 4.25);
  timeline
    .to(product.position, { x: 2.89, y: 1.85, z: .77, duration: 4.25, ease: 'power1.inOut' }, 48.4)
    .to(framing, { x: 1.34, y: 1.52, z: .44, zoom: 1.08, duration: 3.15, ease: 'sine.inOut' }, 48.6)
    .to(leftTemple.rotation, { y: -1.39, duration: 1.4 }, 51.1)
    .to(rightTemple.rotation, { y: 1.51, duration: 1.4 }, 51.3)
    .to(product.rotation, { y: 0, x: -Math.PI / 2, duration: 1.7 }, 51.7)
    .to(product.scale, { x: .47, y: .47, z: .47, duration: 1.6 }, 51.9)
    .to(product.position, { y: 1.479, z: .655, duration: 1.53, ease: 'power2.inOut' }, 53.55);
  release(55.16);
  timeline
    .to(hand, { x: .48, y: 1.73, z: .83, duration: .57 }, 55.12)
    .to(lid.rotation, { x: 0, duration: 1.4, ease: 'power2.inOut' }, 55.85)
    .to(hand, { y: 1.41, z: .88, duration: 1.4 }, 55.85)
    .set(product, { visible: false }, 57.25)
    .to(hand, { x: .83, y: .78, z: .45, duration: .82 }, 57.3)
    .to(head.rotation, { y: -.27, x: -.04, duration: 1.1 }, 57.65)
    .to(framing, { x: -.35, y: 1.48, z: .16, zoom: 1, duration: 2.15 }, 57.7);
}
