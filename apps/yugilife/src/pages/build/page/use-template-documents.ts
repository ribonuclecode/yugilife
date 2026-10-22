import { useState } from "react"

import { errorMessage } from "@/lib/utils"

import {
  applyTemplateSourceDocument,
  makeUserTemplateCopy,
  maximumTemplateDocumentBytes,
  parseTemplateBundleDocument,
  parseTemplateSourceDocument,
  serializeTemplateBundleDocument,
  serializeTemplateSourceDocument,
  templateEditorCompatibility,
} from "../templates/template-document-io"
import { storeTemplate } from "../templates/template-storage"

import { readSelectedFile, safeFileName } from "./downloads"

import type { useTemplateActivation } from "./use-template-activation"
import type { ChangeEvent } from "react"
import type { CardTemplateBundle } from "yugilife-core"

type TemplateActivation = ReturnType<typeof useTemplateActivation>

export function useTemplateDocuments(
  activation: TemplateActivation,
  download: (blob: Blob, fileName: string) => void,
) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [editorOpen, setEditorOpen] = useState(false)
  const [draft, setDraft] = useState("")
  const transferBundle = activation.templateBundle ?? activation.storedTemplate?.bundle

  async function run(task: () => Promise<void>) {
    setBusy(true)
    setError(undefined)
    try {
      await task()
    } catch (reason: unknown) {
      setError(errorMessage(reason))
    } finally {
      setBusy(false)
    }
  }

  async function storeUserCopy(bundle: CardTemplateBundle) {
    const copy = makeUserTemplateCopy(bundle)
    await storeTemplate(copy, "user")
    await activation.refreshTemplateStorage()
    activation.selectTemplate(copy.manifest.id)
    return copy
  }

  function openEditor(bundle: CardTemplateBundle) {
    setDraft(serializeTemplateSourceDocument(bundle))
    setEditorOpen(true)
  }

  async function exportTemplate() {
    if (!transferBundle) {
      setError("Load or cache a template before exporting it.")
      return
    }
    await run(async () => {
      const json = await serializeTemplateBundleDocument(transferBundle)
      download(
        new Blob([json], { type: "application/json" }),
        `${safeFileName(transferBundle.manifest.name)}.yugilife-template.json`,
      )
    })
  }

  async function importTemplate(event: ChangeEvent<HTMLInputElement>) {
    await run(async () => {
      const file = readSelectedFile(event, maximumTemplateDocumentBytes, "Template files")
      if (!file) return
      openEditor(await storeUserCopy(parseTemplateBundleDocument(await file.text())))
    })
  }

  async function beginTemplateEditing() {
    if (!transferBundle) {
      setError("Load or cache a template before editing it.")
      return
    }
    await run(async () => {
      openEditor(
        activation.selectedTemplateIsUser ? transferBundle : await storeUserCopy(transferBundle),
      )
    })
  }

  async function applyTemplateEdit() {
    const stored = activation.storedTemplate
    if (!stored || stored.source !== "user") {
      setError("Only a stored user template can be edited.")
      return
    }
    await run(async () => {
      const next = applyTemplateSourceDocument(
        parseTemplateSourceDocument(draft),
        stored.bundle.assets,
      )
      if (next.manifest.id !== stored.id) {
        throw new Error(
          "A stored template's identity cannot be changed while editing it. Create a new editable copy instead.",
        )
      }
      await storeTemplate(next, "user")
      await activation.refreshTemplateStorage()
      const wasActive = activation.templateBundle?.manifest.id === stored.id
      activation.setSelectedTemplateId(next.manifest.id)
      setEditorOpen(false)
      setDraft("")
      if (!wasActive) return
      const compatibility = templateEditorCompatibility(next.template, next.colorPresets)
      if (compatibility.compatible) {
        activation.activate(next)
        return
      }
      activation.deactivate()
      activation.resetTemplateIdentity()
      activation.setTemplateLoadError(
        `Saved, but the edited template cannot drive the current card editor because ${compatibility.reason}.`,
      )
    })
  }

  function closeEditor() {
    setEditorOpen(false)
    setError(undefined)
  }

  return {
    applyTemplateEdit,
    beginTemplateEditing,
    cancelTemplateEdit: closeEditor,
    closeEditor,
    exportTemplate,
    importTemplate,
    setTemplateDraft: setDraft,
    templateDocumentBusy: busy,
    templateDocumentError: error,
    templateDraft: draft,
    templateEditorOpen: editorOpen,
    templateTransferAvailable: transferBundle !== undefined,
  }
}
