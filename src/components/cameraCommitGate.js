import { isFullscreen, getFullscreen } from './utils'

/**
 * Gate for Choose Camera commit gestures (tile click, Enter key, EasyEyes
 * keypad Return) while the page is windowed.
 *
 * The commit handlers used to begin with `if (!isFullscreen()) return` —
 * a windowed page (fullscreen never entered, lost to a permission prompt,
 * or the re-entry request failed without a fresh gesture) silently ignored
 * EVERY commit, stranding participants on an unresponsive page until they
 * closed the tab and reloaded. A commit gesture is fresh user activation,
 * so use it to enter fullscreen and honor the commit on success.
 *
 * Choose Screen mode (RC._inChooseScreenMode) is windowed ON PURPOSE — the
 * participant is positioning the study window on the screen with the
 * camera — so commits stay ignored there until fullscreen is re-entered
 * via "Choose this screen".
 *
 * @param {object} RC - RemoteCalibrator instance.
 * @param {object} [deps] - Test seams: { isFullscreen, enterFullscreen }.
 * @returns {Promise<boolean>} true when the commit should proceed.
 */
export const cameraCommitGate = async (RC, deps = {}) => {
  const isFs = deps.isFullscreen || isFullscreen
  const enterFullscreen =
    deps.enterFullscreen || (() => getFullscreen(RC?.L, RC))
  if (isFs()) return true
  if (RC?._inChooseScreenMode === true) return false
  try {
    await enterFullscreen()
  } catch (e) {
    console.warn(
      '[ChooseCamera] Ignored commit while windowed (could not enter fullscreen):',
      e,
    )
    return false
  }
  return isFs()
}
