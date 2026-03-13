/**
 * keyboardHandler.js
 *
 * Centralised keyboard-event handling for the object-based distance
 * calibration test.  Extracted from the monolithic handleKeyPress,
 * handleInstructionNav, and breakFunction closures in legacy distance.js.
 *
 * The factory returns an object with attach / detach / cleanup methods so that
 * the caller (pageController or the top-level objectTest orchestrator) can
 * manage the listener lifecycle without reaching into DOM details.
 */

import { debugLog, debugWarn } from './debugLogger'
import { irisTrackingIsActive as _irisTrackingIsActiveLive } from '../distanceTrack'

const CATEGORY = 'keyboard'

/**
 * @typedef {Object} KeyboardDeps
 * @property {Object}   pageController       – exposes getCurrentPage()
 * @property {Object}   proceedButton        – DOM element whose .click() advances
 * @property {Function} spaceKeyHandler      – async (page, ctx) => void
 * @property {Object}   state                – shared mutable state bag
 * @property {Object}   RC                   – RemoteCalibrator instance
 * @property {Object}   options              – calibration options
 * @property {Object}   phrases              – i18n phrase map
 * @property {Function} showPopup            – popup helper
 * @property {string}   TUBE_CHECK_PAGE      – sentinel value for the tube-check page
 * @property {Function} enforceFullscreenOnSpacePress – async (lang, RC) => boolean
 * @property {Function} cancelRulerShiftAnimation     – cancels ruler-shift anim on page 2
 * @property {boolean}  irisTrackingIsActive           – module-level flag from distanceTrack
 * @property {Function} [cameraShutterSound]           – plays shutter sound (pages 3/4)
 * @property {Function} [stampOfApprovalSound]         – plays stamp sound (page 2)
 * @property {Function} captureVideoFrame              – (RC) => imageDataURL
 * @property {string}   env                            – environment string (e.g. 'mocha')
 * @property {Function} getLastCapturedFaceImage       – () => string|null
 * @property {Function} setLastCapturedFaceImage       – (val) => void
 */

/**
 * Factory that wires up keydown (and keyup) listeners on `document`.
 *
 * @param {KeyboardDeps} deps
 * @returns {{ attach(): void, detach(): void, cleanup(): void }}
 */
export function createKeyboardHandler(deps) {
  const {
    pageController,
    proceedButton,
    spaceKeyHandler,
    state,
    RC,
    phrases,
    showPopup: showPopupFn,
    TUBE_CHECK_PAGE,
    enforceFullscreenOnSpacePress,
    cancelRulerShiftAnimation,
    // irisTrackingIsActive is read live from the ES module import, not from deps
    cameraShutterSound,
    stampOfApprovalSound,
    captureVideoFrame,
    env,
    getLastCapturedFaceImage,
    setLastCapturedFaceImage,
  } = deps

  // ── handleInstructionNav ──────────────────────────────────────────────
  // Dispatches ArrowUp / ArrowDown to step through instructions on pages 2-4.

  const handleInstructionNav = e => {
    const page = pageController.getCurrentPage()
    if (![2, 3, 4].includes(page) || !state.stepInstructionModel) return

    if (e.key === 'ArrowDown') {
      const maxIdx = (state.stepInstructionModel.flatSteps?.length || 1) - 1
      if (state.currentStepFlatIndex < maxIdx) {
        state.currentStepFlatIndex++
      }
      state.renderCurrentStepView()
      e.preventDefault()
      e.stopPropagation()
    } else if (e.key === 'ArrowUp') {
      if (state.currentStepFlatIndex > 0) {
        state.currentStepFlatIndex--
      }
      state.renderCurrentStepView()
      e.preventDefault()
      e.stopPropagation()
    }
  }

  // ── handleKeyPress ────────────────────────────────────────────────────

  const handleKeyPress = e => {
    // Only process keydown events for actual key actions.
    // keyup is listened to so that detach() can remove it, but we ignore keyup here.
    if (e.type === 'keyup') return

    const currentPage = pageController.getCurrentPage()

    // ── Enter / Return ────────────────────────────────────────────────
    if (e.key === 'Enter' || e.key === 'Return') {
      if (currentPage === 2) {
        if (state.isPaperSelectionMode) {
          e.preventDefault()
          proceedButton.click()
        }
        return
      }
      if (currentPage === 3 || currentPage === 4) return
      if (currentPage === TUBE_CHECK_PAGE) return

      proceedButton.click()
      return
    }

    // ── Space ─────────────────────────────────────────────────────────
    if (e.key === ' ') {
      if (
        currentPage === 2 ||
        currentPage === 3 ||
        currentPage === 4 ||
        currentPage === TUBE_CHECK_PAGE
      ) {
        e.preventDefault()

        // Gate on pages 3/4: require stepper to be on the last step
        if (
          (currentPage === 3 || currentPage === 4) &&
          state.stepInstructionModel
        ) {
          const maxIdx = (state.stepInstructionModel.flatSteps?.length || 1) - 1
          const alreadyRead =
            state.currentStepperPhraseKey &&
            RC._readInstructionPhraseKeys.has(state.currentStepperPhraseKey)
          if (!alreadyRead && state.currentStepFlatIndex < maxIdx) {
            if (!state._showingReadFirstPopup) {
              state._showingReadFirstPopup = true
              ;(async () => {
                await showPopupFn(
                  RC,
                  '',
                  phrases.EE_SpaceBarDisabledUntilInstructionsFullyRead?.[
                    RC.L
                  ] || '',
                )
                state._showingReadFirstPopup = false
              })()
            }
            return
          }
          if (state.currentStepperPhraseKey) {
            RC._readInstructionPhraseKeys.add(state.currentStepperPhraseKey)
          }
        }

        // In paper-selection mode, space should not advance (Enter is used).
        if (currentPage === 2 && state.isPaperSelectionMode) {
          return
        }

        // Pre-dispatch block: fullscreen enforcement, animation cleanup,
        // iris-tracking guard, listener removal, sounds, and video capture.
        // Mirrors legacy distance.js L8401-8443.
        // Remove the listener immediately to prevent double-press.
        // Legacy distance.js L8424: this happens BEFORE the async IIFE.
        detach()
        ;(async () => {
          const canProceed = await enforceFullscreenOnSpacePress(RC.L, RC)
          if (!canProceed) {
            attach()
            return
          }

          if (currentPage === 2) {
            cancelRulerShiftAnimation()
          }

          if (
            (currentPage === 3 || currentPage === 4) &&
            !_irisTrackingIsActiveLive
          ) {
            console.log('Iris tracking not active - ignoring space bar')
            attach()
            return
          }

          if (currentPage === 3 || currentPage === 4) {
            if (env !== 'mocha' && cameraShutterSound) {
              cameraShutterSound()
            }
          }

          if (currentPage === 2) {
            if (env !== 'mocha' && stampOfApprovalSound) {
              stampOfApprovalSound()
            }
          }

          if (currentPage === 3 || currentPage === 4) {
            setLastCapturedFaceImage(captureVideoFrame(RC))
          }

          spaceKeyHandler(currentPage, {
            detach,
            attach,
            handleKeyPress,
          })
        })()
      }
    }
  }

  // ── Lifecycle helpers ─────────────────────────────────────────────────

  function attach() {
    debugLog(CATEGORY, 'attach listeners')
    document.addEventListener('keydown', handleKeyPress)
    document.addEventListener('keyup', handleKeyPress)
    document.addEventListener('keydown', handleInstructionNav)
  }

  function detach() {
    debugLog(CATEGORY, 'detach listeners')
    document.removeEventListener('keydown', handleKeyPress)
    document.removeEventListener('keyup', handleKeyPress)
    document.removeEventListener('keydown', handleInstructionNav)
  }

  /**
   * Full teardown – removes every listener this module ever added.
   * Mirrors the legacy breakFunction's listener-removal block.
   */
  function cleanup() {
    debugLog(CATEGORY, 'cleanup (full teardown)')
    document.removeEventListener('keydown', handleKeyPress)
    document.removeEventListener('keyup', handleKeyPress)
    document.removeEventListener('keydown', handleInstructionNav)
  }

  return { attach, detach, cleanup, handleKeyPress, handleInstructionNav }
}
