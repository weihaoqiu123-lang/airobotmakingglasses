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
export const productionSeconds = 60;
export const rechargeSeconds = 10;

export const productionCues = {
  ticket: 0,
  making: 10,
  packing: 45,
  complete: productionSeconds,
};

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

export function stageAt(seconds) {
  if (seconds >= productionCues.complete) return 'complete';
  if (seconds >= productionCues.packing) return 'packing';
  if (seconds >= productionCues.making) return 'making';
  return 'ticket';
}

export const fabricationCues = {
  loading: 10,
  cutting: 15,
  color: 24,
  marking: 34,
  inspection: 41,
};

export function fabricationAt(seconds) {
  if (seconds >= productionCues.packing) return 'packing';
  if (seconds >= fabricationCues.inspection) return 'inspection';
  if (seconds >= fabricationCues.marking) return 'marking';
  if (seconds >= fabricationCues.color) return 'color';
  if (seconds >= fabricationCues.cutting) return 'cutting';
  if (seconds >= fabricationCues.loading) return 'loading';
  return 'blank';
}
