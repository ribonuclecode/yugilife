import { useState } from "react"

import {
  readComparisonMode,
  readReferenceOpacity,
  writeComparisonMode,
  writeReferenceOpacity,
} from "../references/reference-settings"

export function useReferenceSettings() {
  const [comparisonMode, setComparisonMode] = useState(readComparisonMode)
  const [referenceOpacity, setReferenceOpacity] = useState(readReferenceOpacity)
  const [settingsStorageError, setSettingsStorageError] = useState<string>()

  function changeComparisonMode(mode: string) {
    if (mode !== "off" && mode !== "overlay" && mode !== "side-by-side") {
      setSettingsStorageError("Comparison settings contain an invalid mode.")
      return
    }
    setComparisonMode(mode)
    setSettingsStorageError(writeComparisonMode(mode))
  }

  function changeReferenceOpacity(opacity: number) {
    if (!Number.isFinite(opacity) || opacity < 0 || opacity > 100) {
      setSettingsStorageError("Reference settings contain an invalid opacity.")
      return
    }
    setReferenceOpacity(opacity)
    setSettingsStorageError(writeReferenceOpacity(opacity))
  }

  return {
    changeComparisonMode,
    changeReferenceOpacity,
    comparisonMode,
    referenceOpacity,
    settingsStorageError,
  }
}
