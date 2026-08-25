const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', error => console.log('PAGE ERROR:', error.message, error.stack));
  
  // Need to start the dev server first to get the URL
  // Or just build and preview?
  // Since dev server runs on 3000
  
  await page.goto('http://localhost:3000');
  
  console.log('Waiting for load...');
  await page.waitForTimeout(2000); // give it some time
  
  // Click on "案例分析" (Case Analysis)
  console.log('Clicking 案例分析...');
  const tabs = await page.$$('button');
  for (let tab of tabs) {
    const text = await page.evaluate(el => el.textContent, tab);
    if (text && text.includes('案例分析')) {
      await tab.click();
      break;
    }
  }
  
  await page.waitForTimeout(1000);
  
  console.log('Clicking 首页...');
  for (let tab of tabs) {
    const text = await page.evaluate(el => el.textContent, tab);
    if (text && text.includes('案例库')) {
      await tab.click();
      break;
    }
  }
  await page.waitForTimeout(1000);
  
  console.log('Clicking 查看详情...');
  const detailButtons = await page.$$('button');
  for (let btn of detailButtons) {
    const text = await page.evaluate(el => el.textContent, btn);
    if (text && text.includes('详情')) {
      await btn.click();
      break;
    }
  }
  await page.waitForTimeout(1000);

  await browser.close();
})();
