import {
  assertChromiumInstalled,
  BrowserHost,
  getPlaywrightVersion,
  readCoreVersion,
} from "../runtime/browser-host.js"
import { cliVersion } from "../version.js"

export async function runDoctor(signal?: AbortSignal) {
  const executablePath = await assertChromiumInstalled()

  const host = new BrowserHost()
  try {
    await host.start(signal)
    const smoke = await host.smoke(signal)
    return [
      `YugiLife CLI ${cliVersion}`,
      `YugiLife Core ${await readCoreVersion()}`,
      "",
      `Node.js       ${process.version}`,
      `Platform      ${process.platform} ${process.arch}`,
      `Chromium      installed (${executablePath})`,
      `Playwright    ${getPlaywrightVersion()}`,
      `Renderer      ready (${smoke.dimensions.width}x${smoke.dimensions.height} smoke card)`,
      "",
    ].join("\n")
  } finally {
    await host.close()
  }
}
