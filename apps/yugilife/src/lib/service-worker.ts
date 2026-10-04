const updateCheckMs = 30 * 60 * 1000
const reloadGuardMs = 10_000
const reloadKey = "yugilife-chunk-reload"

async function isRedeployed() {
  const entry = document.querySelector<HTMLScriptElement>("script[type=module][src]")
  if (!entry) return false
  const response = await fetch(import.meta.env.BASE_URL, { cache: "no-store" })
  return response.ok && !(await response.text()).includes(new URL(entry.src).pathname)
}

async function reloadIfRedeployed() {
  try {
    if (!(await isRedeployed())) return
    const last = Number(sessionStorage.getItem(reloadKey) ?? 0)
    if (Date.now() - last < reloadGuardMs) return
    sessionStorage.setItem(reloadKey, String(Date.now()))
  } catch {
    return
  }
  window.location.reload()
}

export function registerServiceWorker() {
  if (!import.meta.env.PROD) return

  window.addEventListener("vite:preloadError", () => void reloadIfRedeployed())

  if (!("serviceWorker" in navigator)) return
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`, {
        scope: import.meta.env.BASE_URL,
        updateViaCache: "none",
      })
      .then((registration) => {
        const check = () => void registration.update().catch(() => undefined)
        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState === "visible") check()
        })
        window.setInterval(check, updateCheckMs)
      })
      .catch(() => undefined)
  })
}
