type ViewTransitionDocument = Document & {
  startViewTransition?: (update: () => void) => { finished: Promise<void> }
}

export function runAppearanceTransition(update: () => void) {
  if (typeof document === "undefined") {
    update()
    return
  }

  const transitionDocument = document as ViewTransitionDocument
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches

  if (!transitionDocument.startViewTransition || prefersReducedMotion) {
    update()
    return
  }

  const transition = transitionDocument.startViewTransition(update)
  void transition.finished.catch(() => {
    // A newer appearance update can supersede an in-flight transition.
  })
}
