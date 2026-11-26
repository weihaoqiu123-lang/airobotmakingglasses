import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const url = process.argv[2] ?? 'http://127.0.0.1:5173/';
const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
});

async function open(options) {
  const page = await browser.newPage(options);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'warning' && message.text().startsWith('Invalid property')) {
      errors.push(message.text());
    }
  });
  await page.goto(url);
  await page.locator('#stage-visual[data-scene=webgl]').waitFor();
  return { page, errors };
}

async function moveThroughDesign(page, { withLogo = false } = {}) {
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
  await quantity.fill('3');
  await page.locator('#next').click();
  await page.getByRole('heading', { name: '确认你的设计' }).waitFor();
  assert.match(await page.locator('#order-selection').textContent(),
    withLogo ? /optics-logo\.png · 3 副/ : /无 Logo · 3 副/);
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
  assert.equal(await page.locator('#payment-total').textContent(), '¥897');
  await page.getByRole('button', { name: '取消' }).click();
  assert.equal(await page.locator('#stage-title').textContent(), '写实商品图');
  await submit(page);
  assert.match(await page.locator('#stage-meta').textContent(), /^FO-[A-F0-9]{6} · 3 副$/);
  assert.equal(await page.locator('#stage-title').textContent(), '工坊收到订单');
  assert.equal(await page.locator('#stage-visual').getAttribute('data-fabrication'), 'blank');
  await page.getByRole('button', { name: '4 倍速观看' }).click();
  for (const cue of ['loading', 'cutting', 'color', 'marking', 'inspection', 'packing']) {
    await page.locator('[data-fabrication=' + cue + ']').waitFor({ timeout: 45000 });
  }
  await page.getByRole('heading', { name: '制作演示完成' }).waitFor({ timeout: 25000 });
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
  console.log('Mobile: completed the production run without a logo and woke the charging robot with a new order.');
} finally {
  await browser.close();
}
