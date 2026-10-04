import { requestResult, transactionComplete } from "@/lib/indexed-db"
import { isRecord } from "@/lib/utils"

import { openTemplateDatabase, preparedTextureStore } from "./template-database"

import type { PreparedTexturePayload, TemplateId } from "yugilife-core"

export interface StoredPreparedTextureRecord {
  id: TemplateId
  payloads: readonly PreparedTexturePayload[]
  sizeBytes: number
  storedAt: number
  version: string
}

const memoryRecords = new Map<TemplateId, StoredPreparedTextureRecord>()

function isPayload(value: unknown): value is PreparedTexturePayload {
  if (!isRecord(value)) return false
  return (
    typeof value.key === "string" &&
    value.key.length > 0 &&
    Number.isInteger(value.width) &&
    Number(value.width) > 0 &&
    Number.isInteger(value.height) &&
    Number(value.height) > 0 &&
    value.color instanceof Blob &&
    (value.alpha === undefined || value.alpha instanceof Blob)
  )
}

function isStoredRecord(value: unknown): value is StoredPreparedTextureRecord {
  if (!isRecord(value)) return false
  return (
    typeof value.id === "string" &&
    typeof value.version === "string" &&
    value.version.length > 0 &&
    Number.isFinite(value.storedAt) &&
    Number.isFinite(value.sizeBytes) &&
    Array.isArray(value.payloads) &&
    value.payloads.every(isPayload)
  )
}

export function preparedTextureSize(payloads: readonly PreparedTexturePayload[]) {
  return payloads.reduce((total, { alpha, color }) => total + color.size + (alpha?.size ?? 0), 0)
}

export async function readPreparedTextures(id: TemplateId, version: string) {
  const fromMemory = memoryRecords.get(id)
  if (fromMemory) return fromMemory.version === version ? fromMemory.payloads : undefined
  try {
    const database = await openTemplateDatabase()
    try {
      const transaction = database.transaction(preparedTextureStore, "readonly")
      const record: unknown = await requestResult(
        transaction.objectStore(preparedTextureStore).get(id) as IDBRequest<unknown>,
      )
      await transactionComplete(transaction)
      if (!isStoredRecord(record) || record.version !== version) return undefined
      memoryRecords.set(id, record)
      return record.payloads
    } finally {
      database.close()
    }
  } catch {
    return undefined
  }
}

export async function storePreparedTextures(
  id: TemplateId,
  version: string,
  payloads: readonly PreparedTexturePayload[],
) {
  const record: StoredPreparedTextureRecord = {
    id,
    payloads,
    sizeBytes: preparedTextureSize(payloads),
    storedAt: Date.now(),
    version,
  }
  memoryRecords.set(id, record)
  const database = await openTemplateDatabase()
  try {
    const transaction = database.transaction(preparedTextureStore, "readwrite")
    transaction.objectStore(preparedTextureStore).put(record)
    await transactionComplete(transaction)
  } finally {
    database.close()
  }
  return record
}

export async function deletePreparedTextures(id: TemplateId) {
  memoryRecords.delete(id)
  if (typeof indexedDB === "undefined") return
  try {
    const database = await openTemplateDatabase()
    try {
      const transaction = database.transaction(preparedTextureStore, "readwrite")
      transaction.objectStore(preparedTextureStore).delete(id)
      await transactionComplete(transaction)
    } finally {
      database.close()
    }
  } catch {
    // Orphaned textures are never drawn: every read checks the current template version first.
  }
}

export async function preparedTextureCacheBytes() {
  try {
    const database = await openTemplateDatabase()
    try {
      const transaction = database.transaction(preparedTextureStore, "readonly")
      const records: unknown = await requestResult(
        transaction.objectStore(preparedTextureStore).getAll() as IDBRequest<unknown>,
      )
      await transactionComplete(transaction)
      if (!Array.isArray(records)) return 0
      return records.filter(isStoredRecord).reduce((total, record) => total + record.sizeBytes, 0)
    } finally {
      database.close()
    }
  } catch {
    return [...memoryRecords.values()].reduce((total, record) => total + record.sizeBytes, 0)
  }
}
