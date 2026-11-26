export const frames = {
  square: { name: '方框', detail: '利落直线', english: 'SQUARE' },
  round: { name: '圆框', detail: '柔和弧线', english: 'ROUND' },
  oval: { name: '椭圆框', detail: '低调复古', english: 'OVAL' },
};

export const colors = {
  carbon: { name: '曜石黑', hex: '#282c25', english: 'CARBON' },
  forest: { name: '苔藓绿', hex: '#465a37', english: 'MOSS' },
  amber: { name: '琥珀棕', hex: '#9e5432', english: 'AMBER' },
  ivory: { name: '暖象牙', hex: '#ded3ad', english: 'IVORY' },
  iris: { name: '雾紫', hex: '#8c80a7', english: 'IRIS' },
};

export const defaultDesign = Object.freeze({
  frame: 'square', color: 'carbon', logo: '', logoName: '', quantity: 1,
});

export const unitPrice = 299;
export const maxQuantity = 99;
export const rechargeSeconds = 10;
export const pairSeconds = 36;

export function createOrder(design, id) {
  if (!Object.hasOwn(frames, design.frame) || !Object.hasOwn(colors, design.color) ||
      !Number.isInteger(design.quantity) || design.quantity < 1 || design.quantity > maxQuantity) {
    throw new RangeError('Invalid eyewear design');
  }
  return Object.freeze({
    id,
    design: Object.freeze({ ...design }),
    total: design.quantity * unitPrice,
  });
}

export function receiptFor(quantity) {
  const extra = Math.max(0, quantity - 5);
  return {
    length: (100 + extra * 2) / 100,
    seconds: (180 + extra * 4) / 100,
    reaction: quantity > 50 ? 3 : quantity > 20 ? 2 : quantity > 5 ? 1 : 0,
  };
}

export function receiptTiming(quantity) {
  const spec = receiptFor(quantity);
  const printAt = .38;
  const readAt = printAt + spec.seconds + 1.57;
  const insertAt = readAt + (spec.reaction ? .62 + spec.reaction * .31 : .72);
  return { ...spec, printAt, readAt, insertAt, duration: insertAt + 2.28 };
}

export function recordDispatch(completed, quantity) {
  return Math.min(completed + 1, quantity);
}

export function pairRate(quantity, completed, override) {
  return override ?? (quantity > 5 && completed > 0 ? 4 : 1);
}

export const pairCues = Object.freeze({
  loading: 0, cutting: 6, temples: 10, assembly: 15.2, color: 20,
  marking: 26.4, inspection: 28, packing: 30, conveyor: 34,
});

const pairPhases = Object.entries(pairCues);

export function pairPhaseAt(seconds) {
  return pairPhases.findLast(([, start]) => seconds >= start)?.[0] ?? 'loading';
}
