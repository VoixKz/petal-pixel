const { chromium } = require(process.argv[2] + '/node_modules/@playwright/test');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await page.goto('http://localhost:8080/');
  await page.waitForTimeout(800);
  await page.evaluate(() => {
    document.body.innerHTML = `<div style="position:fixed;inset:0;background:#141412 url(/flowers/cover.webp) center/cover;font-family:'Hanken Grotesk Variable',sans-serif">
      <div style="position:absolute;left:52px;bottom:48px;color:#fff;font-size:84px;font-weight:500;letter-spacing:-0.045em;line-height:.98">Every name<br>is a flower.</div>
      <div style="position:absolute;left:54px;top:48px;color:#d6d6d0;font-size:28px;font-weight:500;letter-spacing:-0.03em">Petal Pixel</div>
    </div>`;
  });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: process.argv[2] + '/public/og-cover.png' });
  await browser.close();
})().catch((e) => { console.error(String(e).slice(0, 300)); process.exit(1); });
