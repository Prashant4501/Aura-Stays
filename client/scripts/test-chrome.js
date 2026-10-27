import puppeteer from 'puppeteer-core';

async function testChrome() {
  console.log('Testing Chrome launch...');
  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--window-size=1440,900'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle2' });
  const title = await page.title();
  console.log('Page Title:', title);
  await browser.close();
  console.log('Chrome launch successful!');
}

testChrome().catch(console.error);
