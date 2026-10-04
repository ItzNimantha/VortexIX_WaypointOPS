import { test, expect } from '@playwright/test'

test.use({
  baseURL: 'http://localhost:3001',
  viewport: { width: 390, height: 844 },
  channel: 'chrome',
})

test.describe('Loader 390px Mobile Viewport Rendering & Zero Horizontal Overflow', () => {
  test.beforeEach(async ({ page }) => {
    // Authenticate as Loader
    await page.goto('/login')
    await page.fill('input[name="email"]', 'loader@waypoint.com')
    await page.fill('input[name="password"]', 'password123')
    await page.click('button[type="submit"]')
    await page.waitForURL('**/loader/queue')
  })

  test('Loader Queue (/loader/queue) renders with scrollWidth <= 390 and zero overflow', async ({ page }) => {
    await page.goto('/loader/queue')
    await page.waitForSelector('h1:has-text("Loading Queue")', { state: 'visible' })

    const metrics = await page.evaluate(() => {
      const doc = document.documentElement
      return {
        docScrollWidth: doc.scrollWidth,
        docClientWidth: doc.clientWidth,
        bodyScrollWidth: document.body.scrollWidth,
        bodyClientWidth: document.body.clientWidth,
        windowInnerWidth: window.innerWidth,
      }
    })

    console.log('[E2E Viewport] /loader/queue metrics:', metrics)
    expect(metrics.docScrollWidth).toBeLessThanOrEqual(390)
    expect(metrics.bodyScrollWidth).toBeLessThanOrEqual(390)
    expect(metrics.docClientWidth).toBe(390)
  })

  test('Loader Active Trip (/loader/loading/[id]) & Modal render with scrollWidth <= 390', async ({ page }) => {
    await page.goto('/loader/queue')
    await page.waitForSelector('h1:has-text("Loading Queue")', { state: 'visible' })

    // Find first trip and click Start Loading
    const startLoadingBtn = page.locator('text=Start Loading').first()
    await expect(startLoadingBtn).toBeVisible()
    await startLoadingBtn.click()

    await page.waitForURL('**/loader/loading/*')
    await page.waitForSelector('text=REVERSE LOAD SEQUENCE', { state: 'visible' })

    // Verify initial manifest view
    const initialMetrics = await page.evaluate(() => {
      const doc = document.documentElement
      return {
        docScrollWidth: doc.scrollWidth,
        bodyScrollWidth: document.body.scrollWidth,
      }
    })
    console.log('[E2E Viewport] /loader/loading/[id] initial metrics:', initialMetrics)
    expect(initialMetrics.docScrollWidth).toBeLessThanOrEqual(390)
    expect(initialMetrics.bodyScrollWidth).toBeLessThanOrEqual(390)

    // Verify fixed action bar width
    const bottomBar = page.locator('button:has-text("Proceed to Driver Sign-off")')
    await expect(bottomBar).toBeVisible()
    const barBox = await bottomBar.boundingBox()
    expect(barBox).not.toBeNull()
    if (barBox) {
      expect(barBox.width).toBeLessThanOrEqual(390)
    }

    // Test Shortfall Modal
    const flagBtn = page.locator('text=Flag Missing or Damaged Item').first()
    await expect(flagBtn).toBeVisible()
    await flagBtn.click()

    await page.waitForSelector('h3:has-text("Report Shortfall")', { state: 'visible' })

    const modalMetrics = await page.evaluate(() => {
      const doc = document.documentElement
      return {
        docScrollWidth: doc.scrollWidth,
        bodyScrollWidth: document.body.scrollWidth,
      }
    })
    console.log('[E2E Viewport] /loader/loading modal open metrics:', modalMetrics)
    expect(modalMetrics.docScrollWidth).toBeLessThanOrEqual(390)
    expect(modalMetrics.bodyScrollWidth).toBeLessThanOrEqual(390)

    // Close modal
    await page.click('button:has-text("Cancel")')
    await expect(page.locator('h3:has-text("Report Shortfall")')).toBeHidden()

    // Load all crates
    const loadAllButtons = await page.$$('text=Load All')
    for (const btn of loadAllButtons) {
      await btn.click()
    }

    // Verify proceed button is enabled
    await expect(bottomBar).toBeEnabled()

    const loadedMetrics = await page.evaluate(() => ({
      docScrollWidth: document.documentElement.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
    }))
    expect(loadedMetrics.docScrollWidth).toBeLessThanOrEqual(390)
  })

  test('Loader Sign-Off (/loader/sign-off/[id]) renders with scrollWidth <= 390 and signature canvas within bounds', async ({ page }) => {
    // Navigate from queue to loading to sign-off
    await page.goto('/loader/queue')
    await page.waitForSelector('text=Start Loading', { state: 'visible' })
    await page.locator('text=Start Loading').first().click()
    await page.waitForURL('**/loader/loading/*')
    await page.waitForSelector('text=REVERSE LOAD SEQUENCE', { state: 'visible' })
    await page.waitForSelector('text=Load All', { state: 'visible' })

    const loadAllButtons = await page.$$('text=Load All')
    for (const btn of loadAllButtons) {
      await btn.click()
    }

    const proceedBtn = page.locator('button:has-text("Proceed to Driver Sign-off")')
    await expect(proceedBtn).toBeEnabled()
    await proceedBtn.click()
    await page.waitForURL('**/loader/sign-off/*')
    await page.waitForSelector('h1:has-text("Driver Sign-off")', { state: 'visible' })

    const signOffMetrics = await page.evaluate(() => ({
      docScrollWidth: document.documentElement.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
    }))
    console.log('[E2E Viewport] /loader/sign-off metrics:', signOffMetrics)
    expect(signOffMetrics.docScrollWidth).toBeLessThanOrEqual(390)
    expect(signOffMetrics.bodyScrollWidth).toBeLessThanOrEqual(390)

    // Verify canvas dimensions
    const canvas = page.locator('canvas')
    await expect(canvas).toBeVisible()
    const canvasBox = await canvas.boundingBox()
    expect(canvasBox).not.toBeNull()
    if (canvasBox) {
      expect(canvasBox.width).toBeLessThanOrEqual(390)
    }

    // Test Auto-Sign
    await page.click('text=Auto-Sign')
    await expect(page.locator('text=Signature captured and timestamped')).toBeVisible()

    const afterSignMetrics = await page.evaluate(() => ({
      docScrollWidth: document.documentElement.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
    }))
    expect(afterSignMetrics.docScrollWidth).toBeLessThanOrEqual(390)
  })

  test('Loader Secondary Screens (/vehicles, /summary, /updates, /profile) render with scrollWidth <= 390', async ({ page }) => {
    const screens = [
      { path: '/loader/vehicles', heading: 'Depot Fleet' },
      { path: '/loader/summary', heading: 'Shift Summary' },
      { path: '/loader/updates', heading: 'Updates' },
      { path: '/loader/profile', heading: 'Profile' },
    ]

    for (const s of screens) {
      await page.goto(s.path)
      await page.waitForSelector(`h1:has-text("${s.heading}")`, { state: 'visible' })

      const metrics = await page.evaluate(() => ({
        docScrollWidth: document.documentElement.scrollWidth,
        bodyScrollWidth: document.body.scrollWidth,
      }))
      console.log(`[E2E Viewport] ${s.path} metrics:`, metrics)
      expect(metrics.docScrollWidth).toBeLessThanOrEqual(390)
      expect(metrics.bodyScrollWidth).toBeLessThanOrEqual(390)
    }
  })

  test('Exhaustive DOM Element Boundary Scan on 390px Viewport', async ({ page }) => {
    const routes = [
      '/loader/queue',
      '/loader/vehicles',
      '/loader/summary',
      '/loader/updates',
      '/loader/profile',
    ]

    for (const route of routes) {
      await page.goto(route)
      await page.waitForLoadState('networkidle')

      const overflowingElements = await page.evaluate(() => {
        const viewportWidth = 390
        const badElements: Array<{ tag: string, className: string, right: number, width: number }> = []
        const all = document.querySelectorAll('*')
        all.forEach(el => {
          const rect = el.getBoundingClientRect()
          // Check if element spills beyond 390px (with 1px sub-pixel tolerance)
          if (rect.right > viewportWidth + 1 && rect.width > 0) {
            // Check if it's clipped by an overflow hidden ancestor
            let parent: HTMLElement | null = el as HTMLElement
            let isClipped = false
            while (parent && parent !== document.documentElement) {
              const style = window.getComputedStyle(parent)
              if (style.overflowX === 'hidden' || style.overflow === 'hidden') {
                const parentRect = parent.getBoundingClientRect()
                if (parentRect.right <= viewportWidth + 1) {
                  isClipped = true
                  break
                }
              }
              parent = parent.parentElement
            }
            if (!isClipped) {
              badElements.push({
                tag: el.tagName,
                className: el.className?.toString() || '',
                right: rect.right,
                width: rect.width,
              })
            }
          }
        })
        return badElements
      })

      console.log(`[DOM Scan] Route ${route} unclipped overflow count:`, overflowingElements.length)
      expect(overflowingElements).toEqual([])
    }
  })
})
