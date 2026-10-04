import { AnimatePresence, motion } from "framer-motion"
import { Check, Plus, RefreshCw, TriangleAlert } from "lucide-react"

import { AppNavigation } from "@/components/app-navigation"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Progress } from "@/components/ui/progress"
import { Elevated } from "@/lib/elevated"
import { useShape } from "@/lib/shape-context"
import { spring } from "@/lib/springs"
import { surfaceClasses } from "@/lib/surface-classes"
import { useSurface } from "@/lib/surface-context"

import { InventoryCarousel } from "./inventory-carousel"
import { previewUpdateDescription } from "./use-inventory-controller"

import type { useInventoryController } from "./use-inventory-controller"

const errorMotion = {
  initial: { opacity: 0, scale: 0.97, x: "-50%", y: -6 },
  animate: { opacity: 1, scale: 1, x: "-50%", y: 0 },
  exit: { opacity: 0, scale: 0.97, x: "-50%", y: -6, transition: spring.moderate.exit },
  transition: spring.moderate,
}

const dockSwap = {
  initial: { opacity: 0, scale: 0.97 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.97 },
  transition: spring.fast,
}

interface InventoryViewProps {
  controller: ReturnType<typeof useInventoryController>
}

export function InventoryView({ controller }: InventoryViewProps) {
  const shape = useShape()
  const {
    busy,
    cancelPreviewRefresh,
    cards,
    createCard,
    deleteCard,
    duplicateCard,
    error,
    previewRefresh,
    previewRefreshMessage,
    previewStatus,
    previewUrls,
    refreshPreviews,
    renderingCardId,
    selectedCardId,
    setSelectedCardId,
    storageMode,
  } = controller

  const updateInProgress = previewRefresh !== undefined || previewRefreshMessage !== undefined
  const tileSurface = surfaceClasses(useSurface() + 1, 3)

  return (
    <main className="bg-background text-foreground relative flex h-dvh flex-col overflow-hidden">
      <AppNavigation />

      <div className="relative min-h-0 w-full flex-1">
        <div className="relative size-full min-h-0 overflow-hidden">
          <header className="pointer-events-none absolute inset-x-0 top-0 z-40 flex justify-center text-center">
            <div className="min-w-0 px-3">
              <h1 className="text-display leading-none font-medium tracking-[-0.035em]">
                Inventory
              </h1>
              <p className="text-caption text-muted-foreground mt-1.5">
                {cards.length} {cards.length === 1 ? "card" : "cards"}
                {storageMode === "memory" ? " · Session only" : ""}
              </p>
            </div>
          </header>

          <AnimatePresence initial={false}>
            {error && (
              <motion.div
                {...errorMotion}
                className="absolute top-20 left-1/2 z-40 flex justify-center"
                key="inventory-error"
              >
                <Elevated
                  className={`${shape.container} border-destructive/20 bg-destructive-light flex max-w-[min(28rem,calc(100vw-1rem))] items-start gap-2 border px-3 py-2`}
                  offset={1}
                >
                  <TriangleAlert
                    aria-hidden="true"
                    className="text-destructive mt-0.5 size-4 shrink-0"
                  />
                  <p className="text-body" role="alert">
                    {error}
                  </p>
                </Elevated>
              </motion.div>
            )}
          </AnimatePresence>

          {busy && cards.length === 0 ? (
            <div className="absolute inset-0 flex items-center justify-center" role="status">
              <div className="flex items-center gap-3">
                <span
                  className={`${shape.container} bg-surface-2 shadow-surface-4 block aspect-[813/1185] h-28 animate-pulse`}
                />
                <span className="text-body text-muted-foreground">Opening your collection…</span>
              </div>
            </div>
          ) : (
            <>
              <InventoryCarousel
                busy={busy}
                cards={cards}
                onDelete={(cardId) => void deleteCard(cardId)}
                onDuplicate={(cardId) => void duplicateCard(cardId)}
                onSelect={setSelectedCardId}
                previewUrls={previewUrls}
                renderingCardId={renderingCardId}
                selectedCardId={selectedCardId}
              />

              <footer className="absolute inset-x-3 bottom-2 z-40 flex justify-center sm:inset-x-5 sm:bottom-4">
                <motion.div
                  className={`flex min-w-0 justify-center ${updateInProgress ? "w-full max-w-2xl" : "w-auto"}`}
                  layout
                  transition={spring.moderate}
                >
                  <AnimatePresence initial={false} mode="popLayout">
                    {previewRefresh ? (
                      <motion.div {...dockSwap} className="w-full" key="progress">
                        <Elevated
                          aria-live="polite"
                          className={`${shape.container} border-border flex w-full flex-col items-stretch gap-2.5 border px-3 py-3 sm:flex-row sm:items-center sm:gap-3 sm:px-4`}
                          offset={1}
                          role="status"
                          shadowLevel={3}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-baseline justify-between gap-2">
                              <span className="text-title font-medium">Updating previews</span>
                              <span className="text-caption text-muted-foreground tabular-nums">
                                {previewRefresh.completed}/{previewRefresh.total}
                              </span>
                            </div>
                            <Progress
                              className="mt-2"
                              label="Updating card previews"
                              max={previewRefresh.total}
                              value={previewRefresh.completed}
                            />
                          </div>
                          <Button onClick={cancelPreviewRefresh} variant="ghost">
                            Cancel
                          </Button>
                        </Elevated>
                      </motion.div>
                    ) : previewRefreshMessage ? (
                      <motion.div {...dockSwap} key="message">
                        <Elevated
                          aria-live="polite"
                          className={`${shape.container} border-border text-body flex items-center gap-2 border px-3 py-2`}
                          offset={1}
                          role="status"
                          shadowLevel={3}
                        >
                          <Check aria-hidden="true" className="text-muted-foreground size-4" />
                          {previewRefreshMessage}
                        </Elevated>
                      </motion.div>
                    ) : (
                      <motion.div
                        {...dockSwap}
                        className="flex flex-col items-center gap-2"
                        key="actions"
                      >
                        {cards.length === 0 && (
                          <p className="text-caption text-muted-foreground">
                            No cards yet. Click new to make a new card.
                          </p>
                        )}
                        <div className="flex items-center gap-2">
                          <Button
                            className={tileSurface}
                            disabled={busy}
                            leadingIcon={Plus}
                            onClick={() => void createCard()}
                            size="tile"
                            variant="tertiary"
                          >
                            New
                          </Button>
                          <ConfirmDialog
                            confirmLabel="Update previews"
                            description={previewUpdateDescription(cards.length, previewStatus)}
                            disabled={busy || cards.length === 0}
                            onConfirm={() => void refreshPreviews()}
                            title="Update all previews?"
                            trigger={
                              <Button
                                className={tileSurface}
                                leadingIcon={RefreshCw}
                                size="tile"
                                variant="tertiary"
                              >
                                Update
                              </Button>
                            }
                          />
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              </footer>
            </>
          )}
        </div>
      </div>
    </main>
  )
}
