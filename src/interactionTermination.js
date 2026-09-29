export const interactionEnded = RC =>
  RC._interactionEnding === true ||
  RC._interactionLifecycle?.getSnapshot().status === 'ended'

/** Register resource cleanup independently of success callbacks. */
export function onInteractionEnd(RC, cleanup) {
  if (interactionEnded(RC)) {
    cleanup()
    return () => {}
  }
  RC._interactionDisposers ??= new Set()
  RC._interactionDisposers.add(cleanup)
  return () => RC._interactionDisposers.delete(cleanup)
}

/** A cancelled operation settles without reporting successful completion. */
export function untilInteractionEnds(RC, promise, cancelledValue = false) {
  return new Promise((resolve, reject) => {
    const release = onInteractionEnd(RC, () => resolve(cancelledValue))
    Promise.resolve(promise).then(
      value => {
        release()
        resolve(interactionEnded(RC) ? cancelledValue : value)
      },
      error => {
        release()
        if (interactionEnded(RC)) resolve(cancelledValue)
        else reject(error)
      },
    )
  })
}

// Installed before calibration listeners. The host grants its own modal input;
// RC grants only the active recovery controls while camera recovery owns input.
export function installInteractionInputBoundary(RC) {
  const events = [
    'keydown',
    'keyup',
    'keypress',
    'click',
    'pointerdown',
    'pointerup',
    'mousedown',
    'mouseup',
    'touchstart',
    'touchend',
  ]
  const capture = event => {
    if (interactionEnded(RC)) return
    const recovery = RC._interactionLifecycle?.getSnapshot().recovery
    const blocked = RC.isInteractionInputBlocked?.() || recovery
    if (!blocked) return
    if (recovery && event.target?.closest?.('.camera-reconnect-container'))
      return
    if (RC._interactionHost?.allowsInputEvent?.(event)) return
    event.stopImmediatePropagation()
    if (event.cancelable) event.preventDefault()
  }
  events.forEach(type =>
    window.addEventListener(type, capture, { capture: true, passive: false }),
  )
  return () =>
    events.forEach(type => window.removeEventListener(type, capture, true))
}
