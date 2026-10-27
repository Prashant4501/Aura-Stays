import puppeteer from 'puppeteer-core';
import path from 'path';

const SCREENSHOT_DIR = 'C:\\Users\\prash\\.gemini\\antigravity\\brain\\5d7162b0-6714-42b8-a3de-bf184dc64cb7\\screenshots';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function captureCancellation() {
  console.log('Capturing My Bookings and Cancellation Preview...');
  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--window-size=1440,960'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 960, deviceScaleFactor: 1 });

  try {
    // 1. Login as Guest 1
    await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle2' });
    await sleep(1000);
    const guest1Pill = await page.evaluateHandle(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      return btns.find((b) => b.innerText.includes('Guest 1'));
    });
    if (guest1Pill && guest1Pill.click) {
      await guest1Pill.click();
      await sleep(300);
      const submitBtn = await page.$('button[type="submit"]');
      if (submitBtn) await submitBtn.click();
      await sleep(2000);
    }

    // 2. Navigate to /my-bookings
    await page.goto('http://localhost:5173/my-bookings', { waitUntil: 'networkidle2' });
    await sleep(2500);

    // Screenshot of My Bookings
    console.log('📸 Saving 07_my_bookings.png...');
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, '07_my_bookings.png'),
    });

    // 3. Find and click "Cancel Reservation" button on the card (class includes text-destructive)
    console.log('Clicking Cancel Reservation on card...');
    const cancelBtn = await page.evaluateHandle(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      return btns.find((b) => b.innerText.includes('Cancel Reservation'));
    });

    if (cancelBtn && cancelBtn.click) {
      await cancelBtn.click();
      console.log('Waiting for cancellation preview to load from server...');
      await sleep(2500);

      console.log('📸 Saving 08_cancellation_preview_modal.png...');
      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, '08_cancellation_preview_modal.png'),
      });
    } else {
      console.log('Cancel button not found!');
    }
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await browser.close();
  }
}

captureCancellation();
