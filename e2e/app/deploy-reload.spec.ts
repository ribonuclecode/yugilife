import { expect, test } from "@playwright/test"

import type { Page } from "@playwright/test"

async function openWithDeployedPage(page: Page, deployedPage: (html: string) => string) {
  let pageLoads = 0
  let deployChecks = 0
  page.on("load", () => {
    if (page.url() !== "about:blank") pageLoads++
  })
  await page.route("/", async (route) => {
    if (route.request().isNavigationRequest()) return route.continue()
    const response = await route.fetch()
    await route.fulfill({ response, body: deployedPage(await response.text()) })
    deployChecks++
  })
  await page.goto("/")
  return { deployChecks: () => deployChecks, pageLoads: () => pageLoads }
}

async function failChunkLoad(page: Page) {
  await page.evaluate(() =>
    window.dispatchEvent(new Event("vite:preloadError", { cancelable: true })),
  )
}

test("keeps the page when a chunk fails but the running build is still deployed", async ({
  page,
}) => {
  const counts = await openWithDeployedPage(page, (html) => html)

  await failChunkLoad(page)
  await expect.poll(counts.deployChecks).toBe(1)
  await page.waitForLoadState("networkidle")
  expect(counts.pageLoads()).toBe(1)
})

test("reloads once onto a new deploy when the running build is gone", async ({ page }) => {
  const counts = await openWithDeployedPage(page, (html) =>
    html.replace(/index-[\w-]+\.js/, "index-redeployed.js"),
  )

  await failChunkLoad(page)
  await expect.poll(counts.pageLoads).toBe(2)

  await failChunkLoad(page)
  await expect.poll(counts.deployChecks).toBe(2)
  await page.waitForLoadState("networkidle")
  expect(counts.pageLoads()).toBe(2)
})
