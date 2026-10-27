import puppeteer from 'puppeteer-core';

async function debugMyBookings() {
  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();
  page.on('console', (msg) => console.log('PAGE LOG:', msg.type(), msg.text()));
  page.on('pageerror', (err) => console.log('PAGE ERROR:', err));

  // Login
  await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle2' });
  const guest1Pill = await page.evaluateHandle(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    return btns.find((b) => b.innerText.includes('Guest 1'));
  });
  await guest1Pill.click();
  const submitBtn = await page.$('button[type="submit"]');
  await submitBtn.click();
  await new Promise((r) => setTimeout(r, 2000));

  console.log('Navigating to /my-bookings...');
  await page.goto('http://localhost:5173/my-bookings', { waitUntil: 'networkidle2' });
  await new Promise((r) => setTimeout(r, 2000));

  const bodyHtml = await page.evaluate(() => document.body.innerHTML);
  console.log('BODY HTML (first 500 chars):', bodyHtml.slice(0, 500));
  await browser.close();
}

debugMyBookings();
