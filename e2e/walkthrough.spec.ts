import { test, expect } from '@playwright/test'

test.use({
  channel: 'chrome',
})

test.describe('Waypoint OPS Full Walkthrough', () => {
  test('Store Manager -> Dispatcher -> Loader -> Driver -> Store Manager', async ({ page, context }) => {
    const baseURL = process.env.PLAYWRIGHT_TEST_BASE_URL || 'http://localhost:3001'

    // 1. Store Manager Flow: Place Order
    await page.goto(`${baseURL}/login`)
    await page.fill('input[name="email"]', 'store@waypoint.com')
    await page.fill('input[name="password"]', 'password123')
    await page.click('button[type="submit"]')
    await page.waitForURL('**/store')

    // Navigate to New Order
    await page.click('text=New Order')
    await page.waitForURL('**/store/new-order')
    await page.waitForSelector('button:has-text("+")', { state: 'visible' })

    // Add items (Dry & Chilled)
    const plusButtons = await page.$$('button:has-text("+")')
    if (plusButtons.length > 0) {
      await plusButtons[0].click()
      if (plusButtons.length > 1) {
        await plusButtons[1].click()
      }
    }

    const submitOrderBtn = page.locator('button:has-text("Review & Submit")')
    await expect(submitOrderBtn).toBeEnabled()
    await submitOrderBtn.click()
    await page.waitForURL('**/store/orders')
    await page.waitForSelector('h1:has-text("Store Orders")', { state: 'visible' })

    // 2. Dispatcher Flow: Plan & Allocate & Publish
    await context.clearCookies()
    await page.goto(`${baseURL}/login`)
    await page.fill('input[name="email"]', 'dispatch@waypoint.com')
    await page.fill('input[name="password"]', 'password123')
    await page.click('button[type="submit"]')
    await page.waitForURL('**/dispatcher/queue')

    await page.click('text=Plan & Allocate')
    await page.waitForURL('**/dispatcher/plan')

    // Trigger Auto-Allocate
    await page.click('text=Auto-Allocate')
    const publishBtn = page.locator('button:has-text("Publish Plan")')
    await expect(publishBtn).toBeEnabled({ timeout: 15000 })
    await publishBtn.click()
    await page.waitForSelector('text=Published', { state: 'visible', timeout: 15000 })

    // 3. Loader Flow: Reverse Load & Sign-Off
    await context.clearCookies()
    await page.goto(`${baseURL}/login`)
    await page.fill('input[name="email"]', 'loader@waypoint.com')
    await page.fill('input[name="password"]', 'password123')
    await page.click('button[type="submit"]')
    await page.waitForURL('**/loader/queue')

    // Start loading ready vehicle (prefer VEH001 assigned to driver)
    await page.waitForSelector('text=Start Loading', { state: 'visible' })
    const veh001Btn = page.locator('div:has-text("VEH001")').locator('button:has-text("Start Loading")').first()
    if (await veh001Btn.isVisible()) {
      await veh001Btn.click()
    } else {
      await page.locator('text=Start Loading').first().click()
    }
    await page.waitForURL('**/loader/loading/*')
    await page.waitForSelector('text=REVERSE LOAD SEQUENCE', { state: 'visible' })
    await page.waitForSelector('text=Load All', { state: 'visible' })

    // Click Load All for all stops
    const loadButtons = await page.$$('text=Load All')
    for (const btn of loadButtons) {
      await btn.click()
    }

    // Proceed to Driver Sign-off
    const proceedBtn = page.locator('button:has-text("Proceed to Driver Sign-off")')
    await expect(proceedBtn).toBeEnabled()
    await proceedBtn.click()
    await page.waitForURL('**/loader/sign-off/*')
    await page.waitForSelector('h1:has-text("Driver Sign-off")', { state: 'visible' })

    // Driver sign-off via signature canvas
    await page.waitForSelector('.cursor-crosshair', { state: 'visible' })
    await page.click('.cursor-crosshair')
    await page.click('text=Confirm & Mark Ready')
    await page.waitForURL('**/loader/queue')

    // 4. Driver Flow: Route Execution & Proof of Delivery
    await context.clearCookies()
    await page.goto(`${baseURL}/login`)
    await page.fill('input[name="email"]', 'driver@waypoint.com')
    await page.fill('input[name="password"]', 'password123')
    await page.click('button[type="submit"]')
    await page.waitForURL('**/driver')
    await page.waitForSelector('text=Route Overview', { state: 'visible' })

    // Start Route if not already in transit
    const startRouteBtn = page.locator('button:has-text("Start Route")')
    if (await startRouteBtn.isVisible()) {
      await startRouteBtn.click()
    }

    // Start Stop
    await page.waitForSelector('button:has-text("Start Stop")', { state: 'visible', timeout: 10000 })
    await page.locator('button:has-text("Start Stop")').first().click()
    await page.waitForURL('**/driver/stop/*')

    // Capture Signature & Photo
    await page.waitForSelector('.cursor-crosshair', { state: 'visible' })
    await page.click('.cursor-crosshair')

    const photoBtn = page.locator('button:has-text("Take Photo")')
    if (await photoBtn.isVisible()) {
      await photoBtn.click()
    }

    // Complete Delivery
    const completeDeliveryBtn = page.locator('button:has-text("Complete Delivery")')
    await expect(completeDeliveryBtn).toBeEnabled()
    await completeDeliveryBtn.click()
    await page.waitForURL('**/driver')

    // 5. Store Manager Flow: Confirm Receipt
    await context.clearCookies()
    await page.goto(`${baseURL}/login`)
    await page.fill('input[name="email"]', 'store@waypoint.com')
    await page.fill('input[name="password"]', 'password123')
    await page.click('button[type="submit"]')
    await page.waitForURL('**/store')

    // Navigate to Store Orders
    await page.goto(`${baseURL}/store/orders`)
    await page.waitForSelector('h1:has-text("Store Orders")', { state: 'visible' })

    // Look for Confirm Receipt link or navigate to /store/confirm-receipt
    const confirmReceiptLink = page.locator('text=Confirm Receipt →').first()
    if (await confirmReceiptLink.isVisible()) {
      await confirmReceiptLink.click()
    } else {
      await page.goto(`${baseURL}/store/confirm-receipt`)
    }

    await page.waitForURL('**/store/confirm-receipt*')
    const confirmBtn = page.locator('button:has-text("Confirm All Received")')
    await expect(confirmBtn).toBeEnabled({ timeout: 15000 })
    await confirmBtn.click()
    await page.waitForSelector('text=Receipt Confirmed!', { state: 'visible', timeout: 15000 })
  })
})
