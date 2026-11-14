import RemoteCalibrator from '../core'
import { preloadExcludeTubeModel } from './object/tubeTemplateTracker'

const FACE_TASKS = new Set(['trackDistance', 'measureDistance', 'trackGaze'])

/**
 * The models the study's calibration tasks will load, using the same option
 * names and defaults as trackDistance so the preloaded instances are the
 * ones calibration reuses.
 */
export function collectRequiredModels(calibrationTasks = []) {
  const models = []
  const add = model => {
    if (!models.some(m => m.key === model.key)) models.push(model)
  }
  for (const { name, options = {} } of calibrationTasks) {
    if (!FACE_TASKS.has(name)) continue
    add({ key: 'faceMesh', tracker: 'TFFacemesh' })
    if (name !== 'trackDistance') continue
    if (options.calibrateDistancePupil === 'eyeCorners')
      add({
        key: 'faceMeshUnrefined',
        tracker: 'TFFacemesh_unrefined_landmarks',
      })
    const mode =
      options._calibrateDistanceExcludeTube ??
      options.calibrateDistanceExcludeTube ??
      'excludeHand'
    const tweak =
      options._calibrateDistanceExcludeTubeTweak ??
      options.calibrateDistanceExcludeTubeTweak ??
      ''
    add({ key: 'hand', excludeTubeMode: mode, tweak })
  }
  return models
}

/**
 * Download and initialize every model the study needs, so camera startup
 * and calibration never wait on a model download. Rejects if any model
 * fails, letting the caller offer a retry; models that loaded are kept.
 */
RemoteCalibrator.prototype.preloadModels = async function ({
  calibrationTasks = [],
} = {}) {
  const models = collectRequiredModels(calibrationTasks)
  if (!models.length) {
    console.log('[RC.preloadModels] No models needed for this study')
    return
  }
  const webgazer = this.gazeTracker.webgazer
  const startedAt = performance.now()
  const sec = t => ((performance.now() - t) / 1000).toFixed(2)
  console.log(
    '[RC.preloadModels] Loading:',
    models.map(m => m.key).join(', '),
  )

  const loadOne = async model => {
    const t = performance.now()
    console.log(`[RC.preloadModels] ${model.key}: started`)
    try {
      if (model.tracker) await webgazer.preloadTracker(model.tracker)
      else await preloadExcludeTubeModel(model.excludeTubeMode, model.tweak)
      console.log(`[RC.preloadModels] ${model.key}: loaded in ${sec(t)}s`)
    } catch (error) {
      console.error(
        `[RC.preloadModels] ${model.key}: failed after ${sec(t)}s`,
        error,
      )
      throw error
    }
  }

  await Promise.all(models.map(loadOne))
  console.log(`[RC.preloadModels] All models loaded in ${sec(startedAt)}s`)
}
