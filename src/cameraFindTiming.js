/**
 * Camera-find timing helpers. Logs to the console and merges into RC.newCameraData
 * so EasyEyes can plot cameraFindSec across computers.
 */

export function finalizeCameraFindTiming(RC, { cameraCount = null } = {}) {
  if (typeof RC._cameraFindStartMs !== 'number') return RC.cameraFindTiming

  const cameraFindSec = Number(
    ((performance.now() - RC._cameraFindStartMs) / 1000).toFixed(3),
  )
  RC.cameraFindTiming = {
    ...(RC.cameraFindTiming || {}),
    cameraFindSec,
    cameraCountAtFind: cameraCount,
  }
  logCameraFindResults(RC)
  return RC.cameraFindTiming
}

export function logCameraFindResults(RC) {
  const t = RC.cameraFindTiming || {}
  const payload = {
    cameraFindSec: t.cameraFindSec ?? null,
    cameraPermissionSec: t.cameraPermissionSec ?? null,
    cameraModelLoadSec: t.cameraModelLoadSec ?? null,
    cameraVideoStartSec: t.cameraVideoStartSec ?? null,
    cameraEnumerateSec: t.cameraEnumerateSec ?? null,
    cameraFirstStreamSec: t.cameraFirstStreamSec ?? null,
    cameraProbeSec: t.cameraProbeSec ?? null,
    cameraProbeCount: t.cameraProbeCount ?? null,
    cameraProbeMethod: t.cameraProbeMethod ?? null,
    cameraStartupError: t.cameraStartupError ?? null,
    cameraCountAtFind: t.cameraCountAtFind ?? null,
  }

  console.log('[RC.cameraFind] Camera startup timing (sec):', payload)

  if (t.cameraFindSec != null) {
    const parts = [`cameraFindSec=${t.cameraFindSec}s`]
    if (t.cameraPermissionSec != null) {
      parts.push(`permission=${t.cameraPermissionSec}s`)
    }
    if (t.cameraModelLoadSec != null) {
      parts.push(`model=${t.cameraModelLoadSec}s`)
    }
    if (t.cameraVideoStartSec != null) {
      parts.push(`video=${t.cameraVideoStartSec}s`)
    }
    if (t.cameraFirstStreamSec != null) {
      parts.push(`firstStream=${t.cameraFirstStreamSec}s`)
    }
    if (t.cameraProbeMethod) {
      parts.push(`probe=${t.cameraProbeMethod}`)
    }
    if (t.cameraProbeCount != null) {
      parts.push(`probeCount=${t.cameraProbeCount}`)
    }
    if (t.cameraCountAtFind != null) {
      parts.push(`cameras=${t.cameraCountAtFind}`)
    }
    console.log(`[RC.cameraFind] ${parts.join(' | ')}`)
  }
}
