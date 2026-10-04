const databaseName = "yugilife-template-cache"
const databaseVersion = 2

export const templateStore = "templates"
export const preparedTextureStore = "prepared-textures"

export function openTemplateDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is unavailable in this browser."))
      return
    }
    const request = indexedDB.open(databaseName, databaseVersion)
    request.addEventListener("upgradeneeded", () => {
      const database = request.result
      if (!database.objectStoreNames.contains(templateStore)) {
        database.createObjectStore(templateStore, { keyPath: "id" })
      }
      if (!database.objectStoreNames.contains(preparedTextureStore)) {
        database.createObjectStore(preparedTextureStore, { keyPath: "id" })
      }
    })
    request.addEventListener("success", () => resolve(request.result))
    request.addEventListener("error", () =>
      reject(request.error ?? new Error("Unable to open the template cache")),
    )
  })
}
