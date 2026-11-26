import './style.css';
import { createStage } from './stage.js';
import { colors, createOrder, defaultDesign, frames, maxQuantity, unitPrice } from './order.js';

const byId = id => document.getElementById(id);
const content = byId('custom-content');
const actions = byId('custom-actions');
const steps = byId('steps');
const stageVisual = byId('stage-visual');
const viewToggle = byId('view-toggle');
const motionToggle = byId('motion-toggle');
const dialog = byId('payment-dialog');
const confirmPayment = byId('confirm-payment');
const stage = createStage(byId('render-host'), updateRobotState);
const photoStage = byId('photo-stage');
const stepLabels = ['镜框', '颜色', 'Logo', '数量'];
const money = value => '¥' + value.toLocaleString('zh-CN');
const pad = value => String(value).padStart(2, '0');
const heading = (title, helper) => '<h3 tabindex="-1">' + title + '</h3><p class="helper">' + helper + '</p>';

const production = {
  waiting: { tag: 'ORDER QUEUED', title: '等待机器人出仓', detail: '开门出仓后开始出票', screen: 'QUEUED' },
  ticket: { tag: 'ORDER RECEIVED', title: '工坊收到订单', detail: '打印小票，机器人取单', screen: 'ORDER IN' },
  making: { tag: 'FABRICATION', title: '眼镜制作中', detail: '机器人加工当前眼镜', screen: 'MAKING' },
  packing: { tag: 'PACKING', title: '成品装盒与出料', detail: '机器人放入眼镜，合盖后送上带', screen: 'PACKING' },
  complete: { tag: 'ORDER COMPLETE', title: '全部眼镜已出料', detail: '可以重新查看并保存成品图', screen: 'COMPLETE' },
};

const fabrication = {
  loading: ['STOCK DRAWER', '拉开底部抽屉，夹起方形板材', 'LOADING'],
  cutting: ['FRAME CUTTING', '切出订单指定的镜框轮廓', 'CUTTING'],
  temples: ['TEMPLE FORMING', '用余料分别加工两根镜腿', 'TEMPLES'],
  assembly: ['ASSEMBLY', '把左、右镜腿装到镜框上', 'ASSEMBLY'],
  color: ['SPRAY FINISH', '喷涂镜框和镜腿，原料色逐步变为订单颜色', 'COLOR'],
  marking: ['TEMPLE MARKING', '印制镜腿 Logo', 'MARKING'],
  inspection: ['QUALITY CHECK', '机器人举起眼镜，转动检查', 'QA CHECK'],
  packing: ['PACKING', '折叠镜腿、放入盒内并合盖', 'PACKING'],
  conveyor: ['OUTFEED', '闭合的盒子经传送带送出', 'OUTFEED'],
};

let design = { ...defaultDesign };
let logoImage;
let logoLoading = false;
let logoError = '';
let logoRequest = 0;
let quantityValid = true;
let phase = 'design';
let step = 0;
let visited = 0;
let display = 'workshop';
let paused = false;
let playbackRate = 1;
let order;
let pendingOrder;
let confirmedImage;
let currentCue;
let currentFabrication;
let progressNodes;
let shownCompleted;

if (stage.enabled) {
  stageVisual.dataset.scene = 'webgl';
  byId('scene-poster').hidden = true;
} else {
  stageVisual.dataset.scene = 'fallback';
  byId('render-label').textContent = '工坊预览';
}

function updateRobotState(state, seconds, changed) {
  const label = byId('robot-state');
  const states = {
    ready: '机器人待命', working: '机器人工作中', returning: '机器人正在回仓',
    charging: '充电中 · ' + seconds + ' 秒', waking: '机器人正在出仓',
  };
  label.dataset.status = state;
  label.textContent = states[state];
  if (changed && state !== 'working') byId('announcement').textContent = label.textContent;
}

function setCaption(kicker, title, detail, status, info) {
  byId('stage-kicker').textContent = kicker;
  byId('stage-title').textContent = title;
  byId('stage-detail').textContent = detail;
  byId('stage-status').textContent = status;
  byId('stage-meta').textContent = info;
}

function describeDesign() {
  const title = [frames[design.frame].name, colors[design.color].name, design.quantity + ' 副'].join(' · ');
  if (display === 'product') {
    setCaption('LIVE MODEL', '你的眼镜预览', stage.enabled ? '左右拖动查看镜框与镜腿' : '查看当前设计图', '镜框 · 配色 · 镜腿', title);
  } else if (display === 'photo') {
    setCaption('PRODUCT IMAGE', stage.enabled ? '写实商品图' : '二维成品图', '根据当前选配生成的效果图', '成品预览', title);
  } else if (step === 0 && visited === 0 && design.frame === defaultDesign.frame) {
    setCaption('WORKSHOP', '工坊待机中', '原材料板存放在机台底部抽屉', '工坊就绪', '等待定制');
  } else {
    const titles = ['镜框样式已更新', '镜框配色已更新', '正在定制镜腿标识', '机器已读取数量'];
    setCaption('WORKSHOP', titles[step], '提交订单后开始制作', '已同步设计', title);
  }
}

function selectView(view) {
  display = view;
  stageVisual.dataset.view = view;
  byId('render-label').textContent = view === 'photo' ? (stage.enabled ? '写实渲染' : '二维预览') :
    stage.enabled ? '实时 3D' : '工坊预览';
  stage.setView(view);
  photoStage.hidden = view !== 'photo';
  if (view === 'photo') photoStage.src = confirmedImage;
  viewToggle.setAttribute('aria-pressed', String(view !== 'workshop'));
  viewToggle.textContent = view === 'workshop' ? '眼镜预览' : '返回工坊';
  refreshPreview();
  if (phase === 'design' || phase === 'review') describeDesign();
  if (phase === 'done' && view !== 'workshop') {
    const title = view === 'photo' ? (stage.enabled ? '写实商品图' : '二维成品图') : '你的成品眼镜';
    const detail = view === 'product' && stage.enabled ? '左右拖动查看成品' : '根据本单选配生成';
    setCaption('PRODUCT PREVIEW', title, detail, production.complete.title, order.id);
  } else if (phase === 'done') {
    showCue('complete');
  }
}

viewToggle.addEventListener('click', () => selectView(display === 'workshop' ? 'product' : 'workshop'));

function setPaused(value) {
  paused = value;
  stage.pause(paused);
  motionToggle.setAttribute('aria-pressed', String(paused));
  motionToggle.setAttribute('aria-label', paused ? '播放动画' : '暂停动画');
}

motionToggle.addEventListener('click', () => setPaused(!paused));

function renderSteps() {
  byId('step-counter').textContent = phase === 'design' ? pad(step + 1) + ' / 04' :
    { review: '确认设计', production: '制作中', done: '已装盒' }[phase];
  steps.innerHTML = stepLabels.map((label, index) => {
    const current = phase === 'design' && index === step;
    const didFinish = phase !== 'design' || index < step;
    const disabled = phase === 'production' || phase === 'done' || index > visited;
    return '<button type="button" class="step' + (didFinish ? ' done' : '') +
      '" data-step="' + index + '"' + (current ? ' aria-current="step"' : '') +
      (disabled ? ' disabled' : '') + '><b>' + pad(index + 1) + '</b><span>' + label + '</span></button>';
  }).join('');
}

function button(id, text, kind = 'primary') {
  return '<button type="button" id="' + id + '" class="button ' + kind + '">' + text + '</button>';
}

function renderDesign() {
  switch (step) {
    case 0:
      content.innerHTML = heading('选择镜框', '从三种轮廓中选择你的款式。') +
        '<div class="frame-grid" aria-label="镜框">' + Object.entries(frames).map(([key, frame]) =>
          '<button type="button" class="frame-card ' + key + '" data-frame="' + key + '" aria-pressed="' +
          (design.frame === key) + '"><span class="frame-icon" aria-hidden="true"><i></i><i></i></span><b>' +
          frame.name + '</b><small>' + frame.detail + '</small></button>',
        ).join('') + '</div>';
      break;
    case 1:
      content.innerHTML = heading('选择颜色', '你选的颜色会实时更新到镜框和镜腿。') +
        '<div class="color-grid" aria-label="镜框颜色">' + Object.entries(colors).map(([key, color]) =>
          '<button type="button" class="color-card" data-color="' + key + '" aria-pressed="' +
          (design.color === key) + '"><i aria-hidden="true" style="--swatch:' + color.hex + '"></i>' +
          color.name + '</button>',
        ).join('') + '</div>';
      break;
    case 2:
      content.innerHTML = heading('添加镜腿 Logo', '上传你的标识，也可以保留素面镜腿。') +
        '<label class="upload-zone"><input class="sr-only" id="logo-input" type="file" accept="image/png,image/jpeg,image/webp" aria-describedby="upload-help logo-error">' +
        (design.logo ? '<img alt="" id="logo-thumbnail">' : '<span class="upload-icon" aria-hidden="true">＋</span>') +
        '<strong id="upload-title"></strong><small id="upload-help">PNG、JPG 或 WebP，最大 5 MB</small></label>' +
        '<div class="upload-tools"><button type="button" class="text-button" id="sample-logo">试用示例 Logo</button>' +
        (design.logo ? '<button type="button" class="text-button" id="remove-logo">移除 Logo</button>' : '') + '</div>' +
        '<p id="logo-error" class="inline-error" role="status"></p>';
      byId('upload-title').textContent = logoLoading ? '正在读取 Logo…' :
        design.logoName || '上传 Logo';
      if (design.logo) byId('logo-thumbnail').src = design.logo;
      byId('logo-error').textContent = logoError;
      break;
    case 3:
      content.innerHTML = heading('选择数量', '同一套设计可定制 1–99 副。') +
        '<div class="quantity-control"><button id="quantity-down" type="button" aria-label="减少数量">−</button>' +
        '<input id="quantity-input" aria-label="眼镜数量" type="number" inputmode="numeric" min="1" max="99" step="1" value="' +
        design.quantity + '"><button id="quantity-up" type="button" aria-label="增加数量">＋</button></div>' +
        '<p class="quantity-total"><span>单价 ' + money(unitPrice) + ' / 副</span><strong id="quantity-total"></strong></p>' +
        '<p id="quantity-error" class="inline-error" role="status"></p>';
      break;
  }
  actions.innerHTML = (step > 0 ? button('back', '上一步', 'secondary') : '') +
    button('next', ['下一步 · 选择颜色', '下一步 · 添加 Logo', '下一步 · 选择数量', '生成成品图'][step]) +
    '<p class="custom-note">' + (step === 0 ? '演示单价 ' + money(unitPrice) + ' / 副' : '你的设计会实时同步至工坊') + '</p>';
  byId('next').disabled = logoLoading;
  if (step === 3) updateQuantityUI();
}

function designSummary() {
  return '<p class="summary-line"><span>镜框 / 颜色</span><strong>' +
    frames[design.frame].name + ' · ' + colors[design.color].name + '</strong></p>' +
    '<p class="summary-line"><span>镜腿 Logo / 数量</span><strong id="order-selection"></strong></p>' +
    '<p class="summary-line"><span>演示合计</span><strong>' + money(unitPrice * design.quantity) + '</strong></p>';
}

function previewMarkup() {
  const photoLabel = stage.enabled ? '写实商品图' : '二维成品图';
  const modelLabel = stage.enabled ? '实时 3D' : '设计预览';
  return '<div class="preview-tabs" role="group" aria-label="成品视图">' +
    '<button type="button" data-preview="photo" aria-pressed="false">' + photoLabel + '</button>' +
    '<button type="button" data-preview="product" aria-pressed="false">' + modelLabel + '</button>' +
    '</div><img id="product-image" class="product-image" alt="所选款式、颜色及镜腿标识的成品预览">';
}

function refreshPreview() {
  const thumbnail = byId('product-image');
  if (!thumbnail) return;
  for (const button of content.querySelectorAll('[data-preview]')) {
    button.setAttribute('aria-pressed', String(button.dataset.preview === display));
  }
  thumbnail.src = display === 'product' ? stage.capture('product') : confirmedImage;
}

function renderReview() {
  content.innerHTML = heading('确认你的设计', '检查外观和选配，随后进入模拟支付。') + previewMarkup() + designSummary();
  refreshPreview();
  byId('order-selection').textContent = (design.logoName || '无 Logo') + ' · ' + design.quantity + ' 副';
  actions.innerHTML = button('back', '返回修改', 'secondary') + button('pay', '前往模拟支付') +
    '<a id="download-preview" class="custom-note text-button" download="form-optics-preview.png">下载成品图</a>';
  byId('download-preview').href = confirmedImage;
}

function renderProduction() {
  content.innerHTML = heading('制作进行中', '订单 ' + order.id + ' · ' + order.design.quantity + ' 副') +
    '<ol class="production-list">' + [
      ['ticket', '出单与取票'], ['making', '取料 · 切框 · 镜腿组装 · 上色'], ['packing', '装盒 · 合盖 · 出料'],
    ].map(([key, label]) => '<li data-cue="' + key + '">' + label + '</li>').join('') + '</ol>' +
    '<div class="progress-row"><progress id="production-progress" max="' + order.design.quantity +
    '" value="0" aria-label="制作进度"></progress></div>' +
    '<p class="production-count" id="production-count">制作进度 0 / ' + order.design.quantity + '</p>';
  actions.innerHTML = button('speed', '4 倍速观看', 'secondary') +
    '<p class="custom-note" id="production-note">每盒完全离开出料口后，计为完成一副</p>';
  progressNodes = {
    bar: byId('production-progress'),
    count: byId('production-count'),
    cues: [...content.querySelectorAll('[data-cue]')],
  };
}

function renderComplete() {
  content.innerHTML = heading('制作演示完成', '订单 ' + order.id + ' · 所有眼镜已装盒出料。') +
    '<p class="production-count" id="production-count">制作进度 ' + order.design.quantity + ' / ' +
    order.design.quantity + '</p>' + previewMarkup() + designSummary();
  refreshPreview();
  byId('order-selection').textContent = (design.logoName || '无 Logo') + ' · ' + design.quantity + ' 副';
  actions.innerHTML = '<a id="download-preview" class="button secondary" download="form-optics-' +
    order.id + '.png">下载成品图</a>' + button('restart', '再设计一副');
  byId('download-preview').href = confirmedImage;
}

function render(focus = false) {
  renderSteps();
  if (phase === 'design') renderDesign();
  if (phase === 'review') renderReview();
  if (phase === 'production') renderProduction();
  if (phase === 'done') renderComplete();
  viewToggle.hidden = phase === 'production';
  if (focus) content.querySelector('h3').focus({ preventScroll: true });
}

function goTo(index) {
  if (phase === 'production' || phase === 'done' || index > visited || index < 0) return;
  phase = 'design';
  step = index;
  quantityValid = true;
  selectView(index === 3 || index === 0 ? 'workshop' : 'product');
  render(true);
}

function changeChoice(key, value) {
  design[key] = value;
  for (const choice of content.querySelectorAll('[data-' + key + ']')) {
    choice.setAttribute('aria-pressed', String(choice.dataset[key] === value));
  }
  stage.setDesign(design, logoImage);
  selectView('product');
}

function updateQuantityUI() {
  const total = byId('quantity-total');
  if (!total) return;
  total.textContent = quantityValid ? money(design.quantity * unitPrice) : '—';
  byId('quantity-down').disabled = quantityValid && design.quantity <= 1;
  byId('quantity-up').disabled = quantityValid && design.quantity >= maxQuantity;
  byId('quantity-error').textContent = quantityValid ? '' : '请输入 1–99 之间的整数。';
  byId('quantity-input').setAttribute('aria-invalid', String(!quantityValid));
  byId('next').disabled = !quantityValid || logoLoading;
}

function setQuantity(number) {
  quantityValid = Number.isInteger(number) && number >= 1 && number <= maxQuantity;
  if (quantityValid) {
    design.quantity = number;
    stage.setDesign(design, logoImage);
    describeDesign();
  }
  updateQuantityUI();
}

async function decodeLogo(source) {
  const image = new Image();
  image.src = source;
  await image.decode();
  const canvas = document.createElement('canvas');
  const scale = Math.min(1, 1024 / Math.max(image.naturalWidth, image.naturalHeight));
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
  const png = canvas.toDataURL('image/png');
  return { png, image: canvas };
}

function sampleLogo() {
  const canvas = document.createElement('canvas');
  canvas.width = 400;
  canvas.height = 110;
  const ctx = canvas.getContext('2d');
  ctx.lineWidth = 8;
  ctx.font = '900 72px Arial';
  ctx.strokeStyle = '#2d3424';
  ctx.strokeText('✦ FORM', 6, 79);
  ctx.fillStyle = '#e4ff88';
  ctx.fillText('✦ FORM', 6, 79);
  return canvas.toDataURL('image/png');
}

function redrawLogo(focusId) {
  if (phase !== 'design' || step !== 2) return;
  renderDesign();
  if (focusId) byId(focusId)?.focus({ preventScroll: true });
}

async function useLogo(source, name, request, focusId) {
  try {
    const result = await decodeLogo(source);
    if (request !== logoRequest) return;
    logoImage = result.image;
    design.logo = result.png;
    design.logoName = name;
    logoError = '';
    stage.setDesign(design, logoImage);
    if (phase === 'design' && step === 2) selectView('product');
  } catch {
    if (request === logoRequest) logoError = '无法读取这张图片，请换一张。';
  } finally {
    if (request === logoRequest) {
      logoLoading = false;
      redrawLogo(focusId);
      if (phase === 'design' && step !== 2) {
        byId('next').disabled = step === 3 && !quantityValid;
      }
    }
  }
}

function uploadLogo(file) {
  if (!file) return;
  const request = ++logoRequest;
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) {
    logoLoading = false;
    logoError = '请选择 5 MB 以内的 PNG、JPG 或 WebP 图片。';
    redrawLogo('logo-input');
    return;
  }
  logoLoading = true;
  logoError = '';
  redrawLogo();
  const source = URL.createObjectURL(file);
  void useLogo(source, file.name, request, 'logo-input').finally(() => URL.revokeObjectURL(source));
}

function openReview() {
  if (!quantityValid || logoLoading) return;
  confirmedImage = stage.capture('photo');
  phase = 'review';
  selectView('photo');
  render(true);
}

function showCue(cue, detailCue, snapshot) {
  const item = production[cue];
  const info = order.id + ' · ' + order.design.quantity + ' 副';
  const [tag, hint, screen] = fabrication[detailCue] ?? [item.tag, item.detail, item.screen];
  const ticketDetail = {
    print: '打印小票 · ' + (snapshot?.receipt?.seconds ?? 1.8).toFixed(2) + ' 秒',
    take: '机器人取走小票',
    read: '机器人读到订单数量 ' + order.design.quantity + ' 副',
    insert: '机器人将小票插入机器',
  };
  const detail = cue === 'ticket' ? ticketDetail[snapshot?.part ?? 'print'] :
    detailCue === 'marking' && !order.design.logo ? '检查镜腿表面，保留素面外观' : hint;
  stage.status(screen, order);
  setCaption(tag, item.title, detail, item.title, info);
  byId('announcement').textContent = item.title;
}

function syncProgress(snapshot) {
  const { phase: detail, completed, total, rate, part, receipt } = snapshot;
  const cue = ['loading','cutting','temples','assembly','color','marking','inspection'].includes(detail) ? 'making' :
    detail === 'packing' || detail === 'conveyor' ? 'packing' : detail;
  if (part) stageVisual.dataset.receipt = part;
  else delete stageVisual.dataset.receipt;
  if (receipt) {
    stageVisual.dataset.ticketLength = receipt.length;
    stageVisual.dataset.ticketSeconds = receipt.seconds;
    stageVisual.dataset.reaction = receipt.reaction;
  }
  if (cue !== currentCue || detail !== currentFabrication) {
    currentFabrication = detail;
    stageVisual.dataset.fabrication = detail;
    showCue(cue, detail, snapshot);
  } else if (cue === 'ticket') {
    showCue(cue, detail, snapshot);
  }
  if (cue !== currentCue) {
    currentCue = cue;
    const activeIndex = progressNodes.cues.findIndex(node => node.dataset.cue === cue);
    progressNodes.cues.forEach((node, index) => {
      node.dataset.state = cue === 'complete' || index < activeIndex ? 'done' : index === activeIndex ? 'current' : 'waiting';
    });
  }
  if (completed !== shownCompleted) {
    shownCompleted = completed;
    progressNodes.bar.value = completed;
    progressNodes.count.textContent = '制作进度 ' + completed + ' / ' + total;
  }
  playbackRate = rate;
  byId('speed').textContent = rate === 4 ? '恢复原速' : '4 倍速观看';
  byId('production-note').textContent = rate === 4 ? '正在以 4 倍速播放逐副制作' : '每盒完全离开出料口后，计为完成一副';
}

function startProduction() {
  if (phase !== 'review' || !pendingOrder) return;
  order = pendingOrder;
  pendingOrder = null;
  dialog.close('confirmed');
  phase = 'production';
  currentCue = null;
  currentFabrication = null;
  shownCompleted = null;
  playbackRate = 1;
  setPaused(false);
  selectView('workshop');
  render(true);
  stage.start(order, {
    update: syncProgress,
    complete() {
      phase = 'done';
      render();
      content.querySelector('h3').focus({ preventScroll: true });
    },
  });
  if (matchMedia('(max-width: 820px)').matches) stageVisual.scrollIntoView({ block: 'start' });
}

function restart() {
  stage.reset();
  setPaused(false);
  logoRequest++;
  phase = 'design';
  step = 0;
  visited = 0;
  design = { ...defaultDesign };
  logoImage = undefined;
  logoLoading = false;
  logoError = '';
  quantityValid = true;
  order = undefined;
  confirmedImage = undefined;
  delete stageVisual.dataset.fabrication;
  for (const key of ['receipt', 'ticketLength', 'ticketSeconds', 'reaction']) delete stageVisual.dataset[key];
  stage.setDesign(design);
  selectView('workshop');
  render(true);
}

steps.addEventListener('click', event => {
  const option = event.target.closest('[data-step]');
  if (option) goTo(Number(option.dataset.step));
});

content.addEventListener('click', event => {
  const option = event.target.closest('button');
  if (!option) return;
  if (option.dataset.preview) selectView(option.dataset.preview);
  if (option.dataset.frame) changeChoice('frame', option.dataset.frame);
  if (option.dataset.color) changeChoice('color', option.dataset.color);
  if (option.id === 'sample-logo') {
    logoLoading = true;
    redrawLogo();
    void useLogo(sampleLogo(), 'FORM 示例', ++logoRequest, 'sample-logo');
  }
  if (option.id === 'remove-logo') {
    logoRequest++;
    logoImage = undefined;
    logoLoading = false;
    logoError = '';
    design.logo = '';
    design.logoName = '';
    stage.setDesign(design);
    describeDesign();
    redrawLogo('logo-input');
  }
  if (option.id === 'quantity-up' || option.id === 'quantity-down') {
    const value = design.quantity + (option.id === 'quantity-up' ? 1 : -1);
    const next = Math.min(maxQuantity, Math.max(1, value));
    byId('quantity-input').value = next;
    setQuantity(next);
  }
});

content.addEventListener('change', event => {
  if (event.target.id === 'logo-input') uploadLogo(event.target.files[0]);
});

content.addEventListener('input', event => {
  if (event.target.id === 'quantity-input') setQuantity(event.target.valueAsNumber);
});

actions.addEventListener('click', event => {
  switch (event.target.id) {
    case 'next':
      if (step === 3) openReview();
      else {
        visited = Math.max(visited, step + 1);
        goTo(step + 1);
      }
      break;
    case 'back':
      goTo(phase === 'review' ? 3 : step - 1);
      break;
    case 'pay': {
      const reference = crypto.randomUUID().slice(0, 6).toUpperCase();
      pendingOrder = createOrder(design, 'FO-' + reference);
      byId('payment-total').textContent = money(pendingOrder.total);
      dialog.showModal();
      confirmPayment.focus();
      break;
    }
    case 'speed':
      playbackRate = playbackRate === 4 ? 1 : 4;
      stage.speed(playbackRate);
      byId('speed').textContent = playbackRate === 4 ? '恢复原速' : '4 倍速观看';
      break;
    case 'restart':
      restart();
      break;
  }
});

byId('cancel-payment').addEventListener('click', () => dialog.close());
confirmPayment.addEventListener('click', startProduction);
dialog.addEventListener('close', () => {
  if (!dialog.open && phase === 'review') {
    pendingOrder = null;
    byId('pay')?.focus();
  }
});

render();
