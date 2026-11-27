import { MathUtils, Vector3 } from 'three';

export const upperArmLength = .62;
export const forearmLength = .65;
const minReach = .09;
const maxReach = upperArmLength + forearmLength - .025;

export function createArmSolver(shoulder, side) {
  const reach = new Vector3();
  const pole = new Vector3();
  const elbow = new Vector3();
  const wrist = new Vector3();
  const result = { elbow, wrist };
  return (target, fold) => {
    reach.subVectors(target, shoulder);
    const requested = reach.length();
    if (requested < 1e-6) reach.set(0, -1, 0);
    else reach.divideScalar(requested);
    const distance = MathUtils.clamp(requested, minReach, maxReach);
    wrist.copy(shoulder).addScaledVector(reach, distance);

    const tuck = MathUtils.clamp(fold, 0, 1);
    pole.set(side * MathUtils.lerp(1, .075, tuck), -.34, MathUtils.lerp(.34, 1, tuck));
    pole.addScaledVector(reach, -pole.dot(reach));
    if (pole.lengthSq() < 1e-7) {
      pole.set(0, 1, 0).addScaledVector(reach, -reach.y);
    }
    pole.normalize();
    const along = (upperArmLength ** 2 - forearmLength ** 2 + distance ** 2) / (2 * distance);
    const height = Math.sqrt(Math.max(0, upperArmLength ** 2 - along ** 2));
    elbow.copy(shoulder).addScaledVector(reach, along).addScaledVector(pole, height);
    return result;
  };
}
