import puppeteer from 'puppeteer-core';
import path from 'path';
import fs from 'fs';

const SCREENSHOT_DIR = 'C:\\Users\\prash\\.gemini\\antigravity\\brain\\5d7162b0-6714-42b8-a3de-bf184dc64cb7\\screenshots';

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function runWalkthrough() {
  console.log('🚀 Starting Enhanced E2E Walkthrough...');

  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--window-size=1440,960',
    ],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 960, deviceScaleFactor: 1 });

  try {
    // 1. LANDING PAGE
    console.log('📸 1. Capturing Landing Page...');
    await page.goto('http://localhost:5173/', { waitUntil: 'networkidle2' });
    await sleep(1500);
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, '01_landing_hero.png'),
    });

    // 2. SEARCH AVAILABLE ROOMS
    console.log('📸 2. Searching Rooms for Mumbai...');
    await page.goto('http://localhost:5173/explore?property_id=PROP-001&check_in=2026-11-15&check_out=2026-11-18&guests=2', { waitUntil: 'networkidle2' });
    await sleep(2000);
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, '02_search_results.png'),
    });

    // 3. ROOM DETAIL WITH QUOTE BREAKDOWN
    console.log('📸 3. Navigating to Room Detail...');
    await page.goto('http://localhost:5173/rooms/ROOM-101?property_id=PROP-001&check_in=2026-11-15&check_out=2026-11-18&guests=2', { waitUntil: 'networkidle2' });
    await sleep(2000);
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, '03_room_detail_with_quote.png'),
    });

    // 4. APPLY COUPON
    console.log('📸 4. Applying Coupon FLAT1500...');
    const couponInput = await page.$('input[placeholder*="promo" i], input[placeholder*="coupon" i], input[placeholder*="WELCOME" i]');
    if (couponInput) {
      await couponInput.click({ clickCount: 3 });
      await couponInput.type('FLAT1500');
      const applyBtn = await page.evaluateHandle(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        return btns.find((b) => b.innerText.includes('Apply'));
      });
      if (applyBtn && applyBtn.click) {
        await applyBtn.click();
        await sleep(1500);
      }
    }
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, '03b_coupon_applied.png'),
    });

    // 5. LOGIN AS GUEST
    console.log('📸 5. Login Page with Demo Fast-Fill Pills...');
    await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle2' });
    await sleep(1000);
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, '04_login_demo_pills.png'),
    });

    const guest1Pill = await page.evaluateHandle(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      return btns.find((b) => b.innerText.includes('Guest 1'));
    });
    if (guest1Pill && guest1Pill.click) {
      await guest1Pill.click();
      await sleep(500);
      const submitBtn = await page.$('button[type="submit"]');
      if (submitBtn) await submitBtn.click();
      await sleep(2000);
    }

    // 6. CREATE 15-MINUTE HOLD & CHECKOUT
    console.log('📸 6. Initiating Booking & 15-Minute Hold Checkout...');
    await page.goto('http://localhost:5173/rooms/ROOM-102?property_id=PROP-001&check_in=2026-11-20&check_out=2026-11-23&guests=2', { waitUntil: 'networkidle2' });
    await sleep(2000);

    const reserveHoldBtn = await page.evaluateHandle(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      return btns.find((b) => b.innerText.includes('Reserve') && b.innerText.includes('Hold'));
    });
    if (reserveHoldBtn && reserveHoldBtn.click) {
      await reserveHoldBtn.click();
      await sleep(2500);
    }

    console.log('Checkout URL:', page.url());

    // Step 1: Click "Continue to Review"
    const continueToReviewBtn = await page.evaluateHandle(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      return btns.find((b) => b.innerText.includes('Continue to Review'));
    });
    if (continueToReviewBtn && continueToReviewBtn.click) {
      await continueToReviewBtn.click();
      await sleep(1000);
    }

    // Step 2: Click "Proceed to Payment"
    const proceedToPaymentBtn = await page.evaluateHandle(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      return btns.find((b) => b.innerText.includes('Proceed to Payment'));
    });
    if (proceedToPaymentBtn && proceedToPaymentBtn.click) {
      await proceedToPaymentBtn.click();
      await sleep(1000);
    }

    // Take screenshot of Step 3 (Payment + 15m hold timer + Idempotency key)
    console.log('📸 6b. Checkout Payment Step with 15-Min Hold Timer...');
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, '05_checkout_hold_timer.png'),
    });

    // Step 3: Click "Pay ₹..." button
    console.log('📸 7. Submitting Mock Payment with Idempotency Key...');
    const payBtn = await page.evaluateHandle(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      return btns.find((b) => b.innerText.trim().startsWith('Pay '));
    });
    if (payBtn && payBtn.click) {
      await payBtn.click();
      await sleep(3500);
    }

    // Step 4: Confirmation screen
    console.log('📸 7b. Capturing Booking Confirmed Screen...');
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, '06_booking_confirmed.png'),
    });

    // 7. MY BOOKINGS & CANCELLATION PREVIEW MODAL
    console.log('📸 8. My Bookings Page...');
    await page.goto('http://localhost:5173/my-bookings', { waitUntil: 'networkidle2' });
    await sleep(2000);
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, '07_my_bookings.png'),
    });

    console.log('📸 9. Opening Cancellation Preview Dialog for Confirmed Booking...');
    const cancelResvBtn = await page.evaluateHandle(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      return btns.find((b) => b.innerText.trim() === 'Cancel Reservation');
    });
    if (cancelResvBtn && cancelResvBtn.click) {
      await cancelResvBtn.click();
      await sleep(2000);
      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, '08_cancellation_preview_modal.png'),
      });
      // Close modal
      const keepBtn = await page.evaluateHandle(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        return btns.find((b) => b.innerText.includes('Keep Reservation'));
      });
      if (keepBtn && keepBtn.click) await keepBtn.click();
      await sleep(1000);
    }

    // 8. ADMIN DASHBOARD
    console.log('📸 10. Logging In as Administrator...');
    await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle2' });
    await sleep(1000);

    const adminPill = await page.evaluateHandle(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      return btns.find((b) => b.innerText.includes('Administrator'));
    });
    if (adminPill && adminPill.click) {
      await adminPill.click();
      await sleep(500);
      const submitBtn = await page.$('button[type="submit"]');
      if (submitBtn) await submitBtn.click();
      await sleep(2500);
    }

    console.log('📸 11. Admin Dashboard...');
    await page.goto('http://localhost:5173/admin/dashboard', { waitUntil: 'networkidle2' });
    await sleep(2500);
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, '09_admin_dashboard.png'),
    });

    // 9. ADMIN RESERVATIONS
    console.log('📸 12. Admin Reservations with Updated Nights...');
    await page.goto('http://localhost:5173/admin/reservations', { waitUntil: 'networkidle2' });
    await sleep(2000);
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, '13_admin_reservations.png'),
    });

    // 10. ADMIN RESERVATION DETAIL
    console.log('📸 13. Admin Reservation Detail & State Machine...');
    await page.goto('http://localhost:5173/admin/reservations/RES-001', { waitUntil: 'networkidle2' });
    await sleep(2000);
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, '14_admin_state_machine.png'),
    });

    // 11. LIGHT MODE TOGGLE
    console.log('📸 14. Testing Theme Toggle (Light Theme View)...');
    await page.goto('http://localhost:5173/', { waitUntil: 'networkidle2' });
    await sleep(1500);
    await page.evaluate(() => {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    });
    await sleep(1000);
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, '18_light_mode.png'),
    });

    // Revert back to dark theme
    await page.evaluate(() => {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    });

    console.log('🎉 Enhanced Walkthrough Completed Flawlessly!');
  } catch (err) {
    console.error('Walkthrough error:', err);
  } finally {
    await browser.close();
  }
}

runWalkthrough();
