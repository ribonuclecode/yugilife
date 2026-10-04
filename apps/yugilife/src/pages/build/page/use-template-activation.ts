import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { DEFAULT_TEMPLATE_ID, getOfficialTemplate, TEMPLATE_CATALOG } from "yugilife-templates"

import { errorMessage } from "@/lib/utils"

import { listInventoryCards } from "../../inventory/persistence/inventory-storage"
import { editorTemplateVersion } from "../editor/model/editor-config"
import {
  acquirePreparedTextures,
  preparedTexturesForBundle,
  preparedTexturesSettled,
} from "../templates/prepare-template-textures"
import {
  templateEditorCompatibility,
  validateTemplateBundle,
} from "../templates/template-document-io"
import {
  deleteStoredTemplate,
  getTemplateStorageMode,
  readStoredTemplate,
  readTemplateStorageSnapshot,
  storeTemplate,
  templateBundleMatchesVersion,
} from "../templates/template-storage"

import type {
  ActivePreparedTextures,
  TemplateActivationProgress,
} from "../templates/prepare-template-textures"
import type {
  OriginStorageEstimate,
  StoredTemplateRecord,
  TemplateStorageMode,
  TemplateStorageSnapshot,
} from "../templates/template-storage"
import type { CardTemplateBundle } from "yugilife-core"

export const editorTemplateCatalog = TEMPLATE_CATALOG.filter(({ id }) => id === DEFAULT_TEMPLATE_ID)

function assertEditorCompatible(bundle: CardTemplateBundle, subject: string) {
  const compatibility = templateEditorCompatibility(bundle.template, bundle.colorPresets)
  if (!compatibility.compatible) {
    throw new Error(
      `${subject} cannot drive the current card editor because ${compatibility.reason}.`,
    )
  }
}

function isMissingUserTemplate(templateId: string, templates: readonly StoredTemplateRecord[]) {
  return (
    templateId.startsWith("user/") &&
    !templates.some(({ id, source }) => id === templateId && source === "user")
  )
}

interface TemplateActivationInput {
  readonly inventoryBusy: boolean
  readonly setTemplateIdentity: (id: string, version: string) => void
  readonly storedTemplateId: string
}

export function useTemplateActivation({
  inventoryBusy,
  setTemplateIdentity,
  storedTemplateId,
}: TemplateActivationInput) {
  const [selectedTemplateIdOverride, setSelectedTemplateId] = useState<string>()
  const [templateBundle, setTemplateBundle] = useState<CardTemplateBundle>()
  const [activeTextures, setActiveTextures] = useState<ActivePreparedTextures>()
  const activeTexturesRef = useRef<ActivePreparedTextures | undefined>(undefined)
  const [templateLoadError, setTemplateLoadError] = useState<string>()
  const [templateLoadPaused, setTemplateLoadPaused] = useState(false)
  const [templateLoadProgress, setTemplateLoadProgress] = useState<TemplateActivationProgress>()
  const [templateLoading, setTemplateLoading] = useState(false)
  const templateLoadController = useRef<AbortController | undefined>(undefined)
  const automaticTemplateRestore = useRef<string | undefined>(undefined)
  const [storedTemplates, setStoredTemplates] = useState<readonly StoredTemplateRecord[]>([])
  const [templateStorageReady, setTemplateStorageReady] = useState(false)
  const [originStorage, setOriginStorage] = useState<OriginStorageEstimate>({})
  const [preparedTextureBytes, setPreparedTextureBytes] = useState(0)
  const [templateStorageMode, setTemplateStorageMode] =
    useState<TemplateStorageMode>(getTemplateStorageMode())
  const [templateStorageError, setTemplateStorageError] = useState<string>()

  const requestedTemplateId =
    selectedTemplateIdOverride ??
    (storedTemplateId.startsWith("user/") ? storedTemplateId : DEFAULT_TEMPLATE_ID)
  const selectedTemplateId =
    templateStorageReady && isMissingUserTemplate(requestedTemplateId, storedTemplates)
      ? DEFAULT_TEMPLATE_ID
      : requestedTemplateId
  const selectedOfficialTemplate = editorTemplateCatalog.find(({ id }) => id === selectedTemplateId)
  const storedTemplate = storedTemplates.find(({ id }) => id === selectedTemplateId)
  const selectedTemplateVersion = selectedOfficialTemplate?.version ?? storedTemplate?.version
  const selectedTemplateName =
    selectedOfficialTemplate?.name ?? storedTemplate?.bundle.manifest.name
  const selectedTemplateIsUser = storedTemplate?.source === "user"

  const applyStorageSnapshot = useCallback(
    (snapshot: TemplateStorageSnapshot) => {
      setStoredTemplates(snapshot.templates)
      setOriginStorage(snapshot.originStorage)
      setPreparedTextureBytes(snapshot.preparedTextureBytes)
      setTemplateStorageMode(snapshot.storageMode)
      setTemplateStorageReady(true)
      setTemplateStorageError(undefined)
      if (isMissingUserTemplate(storedTemplateId, snapshot.templates)) {
        setTemplateIdentity(DEFAULT_TEMPLATE_ID, editorTemplateVersion)
      }
    },
    [setTemplateIdentity, storedTemplateId],
  )

  const reportStorageError = useCallback((error: unknown) => {
    setTemplateStorageReady(true)
    setTemplateStorageError(errorMessage(error))
  }, [])

  const refreshTemplateStorage = useCallback(async () => {
    try {
      applyStorageSnapshot(await readTemplateStorageSnapshot())
    } catch (error: unknown) {
      reportStorageError(error)
    }
  }, [applyStorageSnapshot, reportStorageError])

  useEffect(() => {
    let cancelled = false
    void readTemplateStorageSnapshot().then(
      (snapshot) => {
        if (!cancelled) applyStorageSnapshot(snapshot)
      },
      (error: unknown) => {
        if (!cancelled) reportStorageError(error)
      },
    )
    return () => {
      cancelled = true
    }
  }, [applyStorageSnapshot, reportStorageError])

  const activate = useCallback(
    (bundle: CardTemplateBundle, sizeBytes?: number) => {
      if (sizeBytes !== undefined) {
        setTemplateLoadProgress({ loaded: sizeBytes, phase: "ready", total: sizeBytes })
      }
      setTemplateBundle(bundle)
      setTemplateIdentity(bundle.manifest.id, bundle.manifest.version)
    },
    [setTemplateIdentity],
  )

  const loadSelectedTemplate = useCallback(
    async ({ cachedOnly = false }: { cachedOnly?: boolean } = {}) => {
      templateLoadController.current?.abort()
      const controller = new AbortController()
      const aborted = () => controller.signal.aborted
      templateLoadController.current = controller
      setTemplateBundle(undefined)
      setTemplateLoadError(undefined)
      setTemplateLoadPaused(false)
      setTemplateLoadProgress({ loaded: 0, phase: "downloading" })
      setTemplateLoading(true)

      try {
        let cachedTemplate: StoredTemplateRecord | undefined
        try {
          cachedTemplate = await readStoredTemplate(selectedTemplateId)
        } catch (error: unknown) {
          if (!aborted()) setTemplateStorageError(errorMessage(error))
        }
        setTemplateStorageMode(getTemplateStorageMode())

        let cachedBundle: CardTemplateBundle | undefined
        if (cachedTemplate) {
          try {
            cachedBundle = validateTemplateBundle(cachedTemplate.bundle, {
              requireUserId: cachedTemplate.source === "user",
            })
          } catch (error) {
            if (cachedTemplate.source === "user") throw error
            cachedTemplate = undefined
          }
        }

        if (cachedTemplate?.source === "user") {
          if (!cachedBundle) throw new Error("The stored user template has no bundle.")
          assertEditorCompatible(cachedBundle, "This template is stored safely but")
          if (!aborted()) activate(cachedBundle, cachedTemplate.sizeBytes)
          return
        }
        if (cachedOnly && !cachedTemplate) {
          setTemplateLoadProgress(undefined)
          return
        }

        const officialTemplate = getOfficialTemplate(selectedTemplateId)
        const cacheIsCurrent = cachedTemplate?.version === officialTemplate.version
        if (cachedOnly && !cacheIsCurrent) {
          setTemplateLoadProgress(undefined)
          return
        }
        if (!aborted() && cacheIsCurrent && cachedTemplate && cachedBundle) {
          assertEditorCompatible(cachedBundle, "This official template")
          activate(cachedBundle, cachedTemplate.sizeBytes)
          return
        }

        const bundle = await officialTemplate.load({
          signal: controller.signal,
          onProgress: (progress) => {
            if (!aborted()) setTemplateLoadProgress(progress)
          },
        })
        if (aborted()) return
        const validatedBundle = validateTemplateBundle(bundle)
        assertEditorCompatible(validatedBundle, "This official template")
        try {
          await storeTemplate(validatedBundle)
          await refreshTemplateStorage()
        } catch (error: unknown) {
          setTemplateStorageError(errorMessage(error))
        }
        if (!aborted()) activate(validatedBundle)
      } catch (error: unknown) {
        if (!aborted()) {
          setTemplateLoadProgress(undefined)
          setTemplateLoadError(errorMessage(error))
        }
      } finally {
        if (templateLoadController.current === controller) {
          templateLoadController.current = undefined
          setTemplateLoading(false)
        }
      }
    },
    [activate, refreshTemplateStorage, selectedTemplateId],
  )

  useEffect(() => {
    if (inventoryBusy || !templateStorageReady || templateLoading || !selectedTemplateVersion) {
      return
    }
    if (templateBundleMatchesVersion(templateBundle, selectedTemplateId, selectedTemplateVersion)) {
      return
    }
    const restoreKey = `${selectedTemplateId}@${selectedTemplateVersion}`
    if (automaticTemplateRestore.current === restoreKey) return
    automaticTemplateRestore.current = restoreKey
    void loadSelectedTemplate({ cachedOnly: selectedTemplateIsUser })
  }, [
    loadSelectedTemplate,
    inventoryBusy,
    selectedTemplateId,
    selectedTemplateVersion,
    selectedTemplateIsUser,
    templateBundle,
    templateLoading,
    templateStorageReady,
  ])

  // Preparation never blocks a card: on failure the renderer grades live.
  useEffect(() => {
    if (!templateBundle) return
    const controller = new AbortController()
    void acquirePreparedTextures(templateBundle, {
      onProgress: (completed, total) => {
        if (!controller.signal.aborted) {
          setTemplateLoadProgress({ completed, phase: "preparing", total })
        }
      },
      signal: controller.signal,
    }).then((prepared) => {
      if (controller.signal.aborted) return
      activeTexturesRef.current = prepared
      setActiveTextures(prepared)
    })
    return () => controller.abort()
  }, [templateBundle])

  useEffect(() => () => templateLoadController.current?.abort(), [])

  const preparedTextures = useMemo(
    () => preparedTexturesForBundle(activeTextures, templateBundle),
    [activeTextures, templateBundle],
  )

  const deactivate = useCallback(() => setTemplateBundle(undefined), [])

  function clearTemplate() {
    setTemplateBundle(undefined)
    setTemplateLoadError(undefined)
    setTemplateLoadProgress(undefined)
  }

  function openTemplate(templateId: string) {
    setSelectedTemplateId(templateId)
    clearTemplate()
  }

  function resetTemplateIdentity() {
    setTemplateIdentity(DEFAULT_TEMPLATE_ID, editorTemplateVersion)
  }

  function selectTemplate(templateId: string) {
    templateLoadController.current?.abort()
    setTemplateLoading(false)
    setTemplateLoadPaused(false)
    clearTemplate()
    automaticTemplateRestore.current = undefined
    resetTemplateIdentity()
    setSelectedTemplateId(templateId)
  }

  async function removeSelectedTemplate() {
    templateLoadController.current?.abort()
    setTemplateLoading(false)
    try {
      if (selectedTemplateIsUser) {
        const dependentCards = (await listInventoryCards()).filter(
          ({ templateId }) => templateId === selectedTemplateId,
        )
        if (dependentCards.length > 0) {
          throw new Error(
            `This template is used by ${dependentCards.length} inventory card${dependentCards.length === 1 ? "" : "s"}. Delete or migrate those cards first.`,
          )
        }
      } else if (selectedTemplateVersion) {
        // Keep the active bundle for this session and stop the restore effect from re-downloading.
        automaticTemplateRestore.current = `${selectedTemplateId}@${selectedTemplateVersion}`
        setTemplateLoadPaused(true)
      }
      await deleteStoredTemplate(selectedTemplateId)
      await refreshTemplateStorage()
      setTemplateLoadError(undefined)
      setTemplateLoadProgress(undefined)
      if (selectedTemplateIsUser) {
        setTemplateLoadPaused(false)
        setTemplateBundle(undefined)
        setSelectedTemplateId(DEFAULT_TEMPLATE_ID)
        resetTemplateIdentity()
      }
      return true
    } catch (error: unknown) {
      setTemplateStorageMode(getTemplateStorageMode())
      setTemplateStorageError(errorMessage(error))
      return false
    }
  }

  return {
    activeTexturesRef,
    activate,
    clearTemplate,
    deactivate,
    loadSelectedTemplate,
    openTemplate,
    originStorage,
    preparedTextures,
    refreshTemplateStorage,
    removeSelectedTemplate,
    resetTemplateIdentity,
    selectTemplate,
    selectedTemplateId,
    selectedTemplateIsUser,
    selectedTemplateName,
    selectedTemplateVersion,
    setSelectedTemplateId,
    setTemplateLoadError,
    storedTemplate,
    storedTemplates,
    syncTemplateStorageMode: () => setTemplateStorageMode(getTemplateStorageMode()),
    templateBundle,
    templateBundleMatchesSelection: templateBundleMatchesVersion(
      templateBundle,
      selectedTemplateId,
      selectedTemplateVersion,
    ),
    templateCacheBytes:
      storedTemplates.reduce((total, template) => total + template.sizeBytes, 0) +
      preparedTextureBytes,
    templateLoadError,
    templateLoadPaused,
    templateLoadProgress,
    templateLoading,
    templateReady: preparedTexturesSettled(activeTextures, templateBundle),
    templateStorageError,
    templateStorageMode,
  }
}
