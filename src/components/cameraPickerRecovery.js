/** Keep the preview mount alive even when every camera disappears. */
export function emptyCameraPreviewsHTML({ message, retry, quit }) {
  const root = document.createElement('div')
  root.id = 'rc-camera-previews-outer'
  const label = document.createElement('p')
  label.textContent = message
  root.append(label)
  for (const [action, text] of [
    ['retry', retry],
    ['quit', quit],
  ]) {
    const button = document.createElement('button')
    button.id = `rc-camera-missing-${action}`
    button.type = 'button'
    button.className =
      action === 'retry'
        ? 'rc-button rc-go-button'
        : 'rc-button rc-cancel-button'
    button.textContent = text
    root.append(button)
  }
  return root.outerHTML
}

export function bindMissingCameraActions(root, actions) {
  for (const action of ['retry', 'quit']) {
    const button = root?.querySelector(`#rc-camera-missing-${action}`)
    if (button) button.onclick = actions[action]
  }
}

/** Serial, page-scoped refreshes cannot write into a replacement popup. */
export function createCameraRefresh({ read, apply, onError }) {
  let active = true
  let pending = null
  const isCurrent = () => active
  return {
    run() {
      if (!active) return Promise.resolve()
      if (pending) return pending
      pending = (async () => {
        try {
          const cameras = await read()
          if (active) await apply(cameras, isCurrent)
        } catch (error) {
          if (active) onError(error)
        }
      })().finally(() => {
        pending = null
      })
      return pending
    },
    dispose() {
      active = false
    },
  }
}
