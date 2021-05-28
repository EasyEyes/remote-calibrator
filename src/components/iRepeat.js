// Use performance.now() to control the "FPS" of a repeatedly called function

export function iRepeat(fun, fps = 60) {
  let now = 0,
    then = 0,
    elapsed = 0
  const interval = 1000 / fps

  const r = () => {
    requestAnimationFrame(r)

    now = performance.now()
    elapsed = now - then

    if (elapsed > interval) {
      then = now - (elapsed % interval)
      fun()
    }
  }

  requestAnimationFrame(r)
}
