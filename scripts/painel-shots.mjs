// Bancada local, sem downloads nem acesso externo. Usa Chromium previamente instalado.
import { chromium } from 'playwright-core';
import { mkdir, writeFile } from 'node:fs/promises';
const output = process.env.HABBLAUD_SHOTS_DIR || 'entregas/habblaud_trabalho/capturas';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true,
  executablePath: process.env.HABBLAUD_CHROMIUM,
  args: ['--no-sandbox'],
});
const results = [];
for (const width of [1440, 412]) {
  const context = await browser.newContext({ viewport: { width, height: width === 1440 ? 1000 : 915 }, locale: 'pt-BR' });
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    return ['data:','blob:'].includes(url.protocol) || url.origin === 'http://127.0.0.1:18095' ? route.continue() : route.abort();
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:18095', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Painel', exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll('.cg-person').length === 8);
  for (const theme of ['cinza-lilas','verde-claro']) {
    if (theme === 'verde-claro') await page.getByRole('button', { name: 'Verde claro', exact: true }).click();
    await page.waitForTimeout(250);
    await page.locator('.cg-panel').evaluate(el => el.scrollTop = 0);
    await page.screenshot({ path: `${output}/painel-${theme}-${width}.png` });
    await page.locator('.cg-panel').evaluate(el => el.scrollTop = el.scrollHeight);
    await page.screenshot({ path: `${output}/painel-${theme}-${width}-detalhes.png` });
    await page.locator('.cg-panel').evaluate(el => el.scrollTop = 0);
    const measurement = await page.locator('.cg-panel').evaluate(el => ({ width: el.clientWidth, scrollWidth: el.scrollWidth, roster: el.querySelectorAll('.cg-person').length, cards: el.querySelectorAll('.cg-card').length }));
    if (measurement.scrollWidth > measurement.width) throw new Error(`Painel transborda em ${width}px`);
    const contrast = await page.evaluate(() => {
      const rgb = text => text.match(/[\d.]+/g).slice(0,3).map(Number).map(v => v/255).map(v => v<=.04045 ? v/12.92 : ((v+.055)/1.055)**2.4);
      const lum = text => { const c=rgb(text); return .2126*c[0]+.7152*c[1]+.0722*c[2]; };
      const background = lum(getComputedStyle(document.querySelector('.cg-panel')).backgroundColor);
      return [...document.querySelectorAll('.cg-panel button,.cg-panel-button,.cg-theme-button')].map(el => {
        const foreground = lum(getComputedStyle(el).color);
        return (Math.max(background,foreground)+.05)/(Math.min(background,foreground)+.05);
      });
    });
    if (contrast.some(value => value < 4.5)) throw new Error(`Contraste de botão abaixo de AA em ${theme}: ${contrast}`);
    measurement.buttonContrast = contrast.map(value => Math.round(value*100)/100);
    results.push({ viewport: width, theme, ...measurement, errors });
  }
  await page.getByRole('button', { name: 'Voltar ao escritório', exact: true }).click();
  await page.goto('http://127.0.0.1:18095/?mock=1&seed=42&sessions=4', { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${output}/escritorio-demo-${width}.png` });
  await context.close();
}
await browser.close();
await writeFile(`${output}/verificacao.json`, JSON.stringify(results, null, 2)+'\n');
console.log(JSON.stringify(results));
if (results.some(r => r.errors.length)) process.exitCode = 1;
