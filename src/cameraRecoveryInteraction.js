/** Recovery owns input above the distance/yaw nudger, but never the study below. */
export function nudgerAllowsInput(RC, target) {
  const recovery = RC._interactionLifecycle?.getSnapshot().recovery
  const owner = recovery
    ? document.querySelector('.camera-reconnect-container')
    : document.getElementById('calibration-nudger')
  return !!owner?.contains(target)
}

/** Wait for recovery UI cleanup, not merely the first ready camera frame. */
export function waitForCameraRecovery(RC) {
  const lifecycle = RC._interactionLifecycle
  if (!lifecycle) return Promise.resolve(false)
  const initial = lifecycle.getSnapshot()
  if (initial.status === 'ended') return Promise.resolve(false)
  if (!initial.recovery) return Promise.resolve(initial.camera === 'ready')
  return new Promise(resolve => {
    let unsubscribe = () => {}
    let settled = false
    unsubscribe = lifecycle.subscribe((snapshot, event) => {
      if (snapshot.status !== 'ended' && snapshot.recovery) return
      settled = true
      unsubscribe()
      resolve(
        snapshot.status !== 'ended' &&
          snapshot.camera === 'ready' &&
          event?.type === 'recovery.end' &&
          event.outcome === 'completed',
      )
    })
    if (settled) unsubscribe()
  })
}
