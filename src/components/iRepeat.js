// Use performance.now() to control the "FPS" of a repeatedly called function

export function iRepeat(fun, options = { framerate: 60, break: false }) {
  let now = 0
  let then = 0
  let elapsed = 0

  const interval = 1000 / options.framerate

  const r = () => {
    if (!options.break) requestAnimationFrame(r)

    now = performance.now()
    elapsed = now - then

    if (elapsed > interval) {
      then = now - (elapsed % interval)
      fun()
    }
  }

  requestAnimationFrame(r)
}
