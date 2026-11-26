import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { pairSeconds, receiptTiming } from '../src/order.js';

const url = process.argv[2] ?? 'http://127.0.0.1:5173/';
const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
});

async function open(options, virtualBatch = false) {
  const page = await browser.newPage(options);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'warning' && message.text().startsWith('Invalid property')) {
      errors.push(message.text());
    }
  });
  if (virtualBatch) {
    await page.clock.install();
    await page.addInitScript(() => {
      const getContext = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (kind, ...options) {
        return kind === 'webgl2' ? null : getContext.call(this, kind, ...options);
      };
    });
  }
  await page.goto(url);
  await page.locator('#stage-visual[data-scene=' + (virtualBatch ? 'fallback' : 'webgl') + ']').waitFor();
  return { page, errors };
}

async function moveThroughDesign(page, { withLogo = false, total = 1 } = {}) {
  await page.getByRole('button', { name: /圆框 柔和弧线/ }).click();
  await page.locator('#next').click();
  await page.getByRole('button', { name: '琥珀棕' }).click();
  await page.locator('#next').click();
  if (withLogo) {
    const logo = await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 130;
      canvas.height = 36;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff8ae';
      ctx.fillRect(0, 0, 130, 36);
      ctx.fillStyle = '#882119';
      ctx.font = 'bold 24px Arial';
      ctx.fillText('OPTICS', 16, 27);
      return canvas.toDataURL().split(',')[1];
    });
    await page.locator('#logo-input').setInputFiles({
      name: 'optics-logo.png', mimeType: 'image/png', buffer: Buffer.from(logo, 'base64'),
    });
    await page.getByText('optics-logo.png', { exact: true }).waitFor();
  }
  await page.locator('#next').click();
  const quantity = page.getByRole('spinbutton', { name: '眼镜数量' });
  await quantity.fill('100');
  assert(await page.locator('#next').isDisabled());
  await quantity.fill(String(total));
  await page.locator('#next').click();
  await page.getByRole('heading', { name: '确认你的设计' }).waitFor();
  assert.equal(await page.locator('#order-selection').textContent(),
    (withLogo ? 'optics-logo.png' : '无 Logo') + ' · ' + total + ' 副');
}

async function submit(page) {
  await page.locator('#pay').click();
  await page.getByRole('button', { name: '确认模拟支付' }).click();
}

async function checkout(page, earlyWake = false) {
  const preview = await page.locator('#product-image').getAttribute('src');
  assert.match(preview, /^data:image\/png;base64,/);
  assert.equal(await page.locator('#stage-visual').getAttribute('data-view'), 'photo');
  await page.getByRole('button', { name: '实时 3D', exact: true }).click();
  assert.equal(await page.locator('#render-host').getAttribute('data-orbit'), 'true');
  assert.notEqual(await page.locator('#product-image').getAttribute('src'), preview);
  await page.getByRole('button', { name: '写实商品图', exact: true }).click();
  assert.equal(await page.locator('#product-image').getAttribute('src'), preview);
  await page.locator('#pay').click();
  assert.equal(await page.locator('#payment-total').textContent(), '¥299');
  await page.getByRole('button', { name: '取消' }).click();
  assert.equal(await page.locator('#stage-title').textContent(), '写实商品图');
  await page.evaluate(() => {
    const stage = document.getElementById('stage-visual');
    const observations = [];
    new MutationObserver(() => {
      const phase = stage.dataset.fabrication;
      if (phase && observations.at(-1)?.phase !== phase) {
        observations.push({ phase, count: document.getElementById('production-count')?.textContent });
      }
    }).observe(stage, { attributes: true, attributeFilter: ['data-fabrication'] });
    window.fabricationObservations = observations;
  });
  await submit(page);
  await page.locator('[data-receipt=print]').waitFor();
  assert.match(await page.locator('#stage-meta').textContent(), /^FO-[A-F0-9]{6} · 1 副$/);
  assert.equal(await page.locator('#stage-title').textContent(), '工坊收到订单');
  assert.equal(await page.locator('#stage-visual').getAttribute('data-ticket-seconds'), '1.8');
  assert.equal(await page.locator('#production-count').textContent(), '制作进度 0 / 1');
  await page.getByRole('button', { name: '4 倍速观看' }).click();
  await page.getByRole('heading', { name: '制作演示完成' }).waitFor({ timeout: 25000 });
  const observations = await page.evaluate(() => window.fabricationObservations);
  assert.deepEqual(observations.map(event => event.phase), [
    'ticket', 'loading', 'cutting', 'temples', 'assembly', 'color', 'marking', 'inspection', 'packing', 'conveyor', 'complete',
  ]);
  assert.equal(observations.find(event => event.phase === 'conveyor').count, '制作进度 0 / 1');
  assert.equal(await page.locator('#production-count').textContent(), '制作进度 1 / 1');
  assert.equal(await page.locator('#product-image').getAttribute('src'), preview);
  assert.equal(await page.locator('#robot-state').getAttribute('data-status'), 'returning');
  const charging = page.locator('#robot-state[data-status=charging]');
  await charging.waitFor({ timeout: 30000 });
  if (earlyWake) {
    await page.getByRole('button', { name: '再设计一副' }).click();
    for (let step = 0; step < 4; step++) await page.locator('#next').click();
    assert.equal(await charging.isVisible(), true);
    await submit(page);
    await page.locator('#robot-state[data-status=waking]').waitFor();
    assert.equal(await page.locator('#stage-visual').getAttribute('data-fabrication'), 'waiting');
    await page.locator('#robot-state[data-status=working]').waitFor();
  } else {
    const since = Date.now();
    await page.locator('#robot-state[data-status=waking]').waitFor({ timeout: 14000 });
    assert.ok(Date.now() - since >= 9200, 'full charge takes approximately 10 seconds');
    await page.locator('#robot-state[data-status=ready]').waitFor();
    await page.getByRole('button', { name: '再设计一副' }).click();
    await page.getByRole('heading', { name: '选择镜框' }).waitFor();
  }
}

async function verifyLargeBatch() {
  const { page, errors } = await open({ reducedMotion: 'reduce' }, true);
  await moveThroughDesign(page, { total: 40 });
  await submit(page);
  await page.locator('[data-receipt=print]').waitFor();
  assert.equal(await page.locator('#stage-visual').getAttribute('data-ticket-length'), '1.7');
  assert.equal(await page.locator('#stage-visual').getAttribute('data-ticket-seconds'), '3.2');
  const tenthBox = receiptTiming(40).duration + pairSeconds + 9 * pairSeconds / 4;
  await page.clock.runFor(Math.round((tenthBox + .7) * 1000));
  assert.equal(await page.locator('#production-count').textContent(), '制作进度 10 / 40');
  assert.equal(await page.locator('#speed').textContent(), '恢复原速');
  await page.clock.runFor(Math.round((30 * pairSeconds / 4 + .6) * 1000));
  assert.equal(await page.locator('#production-count').textContent(), '制作进度 40 / 40');
  assert.equal(await page.locator('#robot-state').getAttribute('data-status'), 'returning');
  assert.deepEqual(errors, []);
  await page.close();
  console.log('40-pair order: quantity-based receipt, first pair at normal speed, 10 / 40, 40 / 40, and return to charge.');
}

try {
  const desktop = await open({ viewport: { width: 1440, height: 960 } });
  await moveThroughDesign(desktop.page, { withLogo: true });
  await checkout(desktop.page);
  assert.deepEqual(desktop.errors, []);
  await desktop.page.close();
  console.log('Desktop: switched photo and 3D, completed all fabrication steps, recharged for 10 seconds, then returned to standby.');

  const phone = await open({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
  assert.equal(await phone.page.evaluate(() => document.documentElement.scrollWidth), 390);
  await moveThroughDesign(phone.page);
  await checkout(phone.page, true);
  assert.deepEqual(phone.errors, []);
  await phone.page.close();
  console.log('Mobile: completed the production run without a logo and woke the charging robot with a new order.');
  await verifyLargeBatch();
} finally {
  await browser.close();
}
