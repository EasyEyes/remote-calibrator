/**
 * measurementSaveQueue.js
 *
 * Chronological queue for measurement-attempt records.
 * Entries are pushed on every SPACE-press that completes face-mesh samples
 * (whether the tolerance check passes or fails).
 *
 * When a tolerance check fails, the current measurement is pushed with
 * accepted=false and the most-recent accepted=true entry is flipped to false
 * (retroactive rejection of the previous measurement).
 *
 * The entire queue is converted to full measurement objects and saved in bulk
 * at the "ALL LOCATIONS MEASURED" exit point.
 *
 * Faithfully reproduces the logic from legacy distance.js lines 3912-3923,
 * 9147-9180, 9397-9406, and 9597-9680.
 */

import { debugLog, debugError } from './debugLogger'

/**
 * Create a measurement save queue.
 *
 * @returns {object} Queue manager with push/reject/save methods
 */
export function createMeasurementSaveQueue() {
  const queue = []

  return {
    /**
     * Push an accepted measurement entry.
     * Legacy: distance.js lines 9397-9406
     *
     * @param {object} entry
     * @param {string} entry.locEye - Location+eye string
     * @param {string} entry.location - Location string
     * @param {number[]} entry.meshSamples - Copy of mesh samples
     * @param {number} entry.factorCmPx - Calibration factor
     * @param {number} entry.fOverWidth - Focal length over width
     * @param {number[]} entry.cameraResolution - [width, height] in video pixels
     * @param {number} entry.locationIndex - Zero-based location index
     */
    pushAccepted(entry) {
      queue.push({ ...entry, accepted: true })
      debugLog('saveQueue', `Queued accepted measurement for ${entry.locEye}`)
    },

    /**
     * Push a rejected measurement entry.
     * Legacy: distance.js lines 9148-9157
     *
     * @param {object} entry - Same shape as pushAccepted
     */
    pushRejected(entry) {
      queue.push({ ...entry, accepted: false })
      debugLog('saveQueue', `Queued rejected measurement for ${entry.locEye}`)
    },

    /**
     * Retroactively reject the most-recent accepted entry.
     * Walks the queue backwards to find the last accepted=true entry and flips it.
     * Legacy: distance.js lines 9162-9180
     */
    retroactivelyRejectPrevious() {
      for (let i = queue.length - 2; i >= 0; i--) {
        if (queue[i].accepted) {
          queue[i].accepted = false
          debugLog(
            'saveQueue',
            `Retroactively rejected queued measurement at index ${i} ` +
              `(location ${queue[i].locEye}, fOverWidth ${queue[i].fOverWidth})`,
          )
          break
        }
      }
    },

    /**
     * Process the entire queue in chronological order, creating full
     * measurement objects and saving them in bulk.
     *
     * Legacy: distance.js lines 9597-9674
     *
     * @param {object} params
     * @param {object} params.RC - RemoteCalibrator instance
     * @param {object} params.options - objectTest options
     * @param {number} params.ppi - Screen pixels per inch
     * @param {number} params.firstMeasurementCm - Object length in cm
     * @param {boolean} params.isPaperSelectionModeBool - Paper mode flag
     * @param {string|null} params.selectedPaperLabel - Selected paper label
     * @param {Array} params.paperSelectionOptions - Paper selection options array
     * @param {string|null} params.selectedPaperOption - Selected paper option key
     * @param {string|null} params.paperSuggestionValue - User suggestion text
     * @param {function} params.getOffsetPx - Function returning offset in pixels
     * @param {function} params.getGlobalPointForLocation - Location-to-point resolver
     * @param {function} params.processMeshDataAndCalculateNearestPoints - Mesh processing function
     * @param {function} params.createMeasurementObject - Measurement object factory
     * @param {function} params.saveCalibrationMeasurements - Persistence function
     * @param {object} params.commonData - objectTestCommonData (from state manager)
     * @returns {Promise<{acceptedCount: number, rejectedCount: number, totalCount: number}>}
     */
    async processBulkSave({
      RC,
      options,
      ppi,
      firstMeasurementCm,
      isPaperSelectionModeBool,
      selectedPaperLabel,
      paperSelectionOptions,
      selectedPaperOption,
      paperSuggestionValue,
      getOffsetPx,
      getGlobalPointForLocation,
      processMeshDataAndCalculateNearestPoints,
      createMeasurementObject,
      saveCalibrationMeasurements,
      commonData,
    }) {
      try {
        const allMeasurementObjects = []
        for (const entry of queue) {
          const entryPointXYPx = getGlobalPointForLocation(
            entry.location,
            getOffsetPx(),
            RC,
          )
          const {
            nearestPointsData: entryNearestPointsData,
            currentIPDDistance: entryCurrentIPDDistance,
            ipdXYZVpx: entryIpdXYZVpx,
          } = await processMeshDataAndCalculateNearestPoints(
            RC,
            options,
            [...entry.meshSamples],
            entry.factorCmPx,
            ppi,
            0,
            0,
            'object',
            entry.locationIndex + 1,
            [0, 0],
            [0, 0],
            0,
            0,
            0,
            options.calibrateDistanceChecking,
            entryPointXYPx,
            firstMeasurementCm,
          )

          allMeasurementObjects.push(
            createMeasurementObject(
              `location-${entry.locEye}`,
              firstMeasurementCm,
              entry.factorCmPx,
              entryNearestPointsData,
              entryCurrentIPDDistance,
              null,
              entry.cameraResolution,
              isPaperSelectionModeBool
                ? selectedPaperLabel ||
                    paperSelectionOptions.find(
                      o => o.key === selectedPaperOption,
                    )?.label ||
                    null
                : null,
              isPaperSelectionModeBool ? paperSuggestionValue : null,
              entryIpdXYZVpx,
              entry.fOverWidth,
              entry.accepted,
            ),
          )
        }

        saveCalibrationMeasurements(
          RC,
          'object',
          allMeasurementObjects,
          undefined,
          commonData,
        )

        const acceptedCount = allMeasurementObjects.filter(
          m => m.snapshotAcceptedBool,
        ).length
        const rejectedCount = allMeasurementObjects.length - acceptedCount
        debugLog(
          'saveQueue',
          `Saved ${allMeasurementObjects.length} measurement attempts ` +
            `(${acceptedCount} accepted, ${rejectedCount} rejected) ` +
            `in chronological order`,
        )

        return {
          acceptedCount,
          rejectedCount,
          totalCount: allMeasurementObjects.length,
        }
      } catch (error) {
        debugError(
          'saveQueue',
          'Error in bulk save of measurement attempts:',
          error,
        )
        return { acceptedCount: 0, rejectedCount: 0, totalCount: 0 }
      }
    },

    /** Get the current queue length. */
    get length() {
      return queue.length
    },

    /** Get a copy of the queue for inspection. */
    getEntries() {
      return [...queue]
    },
  }
}
