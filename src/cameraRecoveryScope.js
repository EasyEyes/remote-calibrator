/**
 * A camera service can outlive the page using it. Only a live page subscription
 * may rebuild UI after recovery; releasing it also invalidates queued callbacks.
 */
export function subscribeCameraRecovery(tracker, callbacks) {
  let active = true
  let disconnected = false
  const unsubscribeDisconnect = tracker.onCameraDisconnected((...args) => {
    if (!active) return
    disconnected = true
    callbacks.onDisconnect(...args)
  })
  const unsubscribeReconnect = tracker.onCameraReconnected((...args) => {
    if (!active || !disconnected) return
    disconnected = false
    callbacks.onReconnect(...args)
  })

  return () => {
    if (!active) return
    active = false
    disconnected = false
    unsubscribeDisconnect()
    unsubscribeReconnect()
    callbacks.onRelease?.()
  }
}
