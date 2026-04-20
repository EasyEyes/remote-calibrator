import { getCameraResolutionXY } from '../components/utils'
import { phrases } from '../i18n/schema'
import Swal from 'sweetalert2'
import { swalInfoOptions } from '../components/swalOptions'
import { processInlineFormatting } from '../distance/markdownInstructionParser'
import { calculateNearestPoints } from '../distance/distanceTrack'
import { getLeftAndRightEyePointsFromMeshData } from '../distance/distance'
import {
  estimateHeadYaw,
  correctIpdForHeadRotation,
  estimateHeadYawRobust,
} from '../distance/headYaw'

export const validateFaceMeshSamples = async (
  RC,
  calibrateDistancePupil = 'iris',
  calibrateDistanceChecking = 'camera',
  calibrateDistanceIpdUsesZBool = true,
  calibrateDistanceCorrectForHeadRotation = 'useZ',
) => {
  const samples = []

  // Accumulators for averaging over valid samples
  let ipdPixelsSum = 0
  let ipdPixelsCount = 0

  let ipdXYZPixelsSum = 0
  let ipdXYZPixelsCount = 0

  let leftXSum = 0
  let leftYSum = 0
  let leftCount = 0

  let rightXSum = 0
  let rightYSum = 0
  let rightCount = 0

  let eyeToCameraSum = 0
  let eyeToCameraCount = 0

  let eyeToCenterSum = 0
  let eyeToCenterCount = 0

  let eyeToPointSum = 0
  let eyeToPointCount = 0

  let eyeToFootSum = 0
  let eyeToFootCount = 0

  let footToCameraSum = 0
  let footToCameraCount = 0

  let footToCenterSum = 0
  let footToCenterCount = 0

  let footToPointSum = 0
  let footToPointCount = 0

  let calibrationFactorSum = 0
  let calibrationFactorCount = 0

  let footXXSum = 0
  let footYYSum = 0
  let footXYCount = 0

  let pointXXSum = 0
  let pointYYSum = 0
  let pointXYCount = 0

  let yawDegSum = 0
  let yawDegCount = 0

  // Collect exactly 5 samples, using NaN for failed measurements
  for (let i = 0; i < 5; i++) {
    try {
      const ipdData = await captureIPDFromFaceMesh(
        RC,
        calibrateDistancePupil,
        calibrateDistanceChecking,
        calibrateDistanceIpdUsesZBool,
        calibrateDistanceCorrectForHeadRotation,
      )
      if (ipdData && ipdData.ipdPixels && !isNaN(ipdData.ipdPixels)) {
        samples.push(ipdData.ipdPixels)
        ipdPixelsSum += ipdData.ipdPixels
        ipdPixelsCount++

        // Accumulate 3D IPD (ipdXYZPixels) separately
        if (ipdData.ipdXYZPixels && !isNaN(ipdData.ipdXYZPixels)) {
          ipdXYZPixelsSum += ipdData.ipdXYZPixels
          ipdXYZPixelsCount++
        }

        if (
          ipdData.nearestXYPx_left &&
          ipdData.nearestXYPx_left.length > 0 &&
          !isNaN(ipdData.nearestXYPx_left[0]) &&
          !isNaN(ipdData.nearestXYPx_left[1])
        ) {
          leftXSum += Number(ipdData.nearestXYPx_left[0])
          leftYSum += Number(ipdData.nearestXYPx_left[1])
          leftCount++
        }
        if (
          ipdData.nearestXYPx_right &&
          ipdData.nearestXYPx_right.length > 0 &&
          !isNaN(ipdData.nearestXYPx_right[0]) &&
          !isNaN(ipdData.nearestXYPx_right[1])
        ) {
          rightXSum += Number(ipdData.nearestXYPx_right[0])
          rightYSum += Number(ipdData.nearestXYPx_right[1])
          rightCount++
        }

        if (ipdData.eyeToCameraCm && !isNaN(ipdData.eyeToCameraCm)) {
          eyeToCameraSum += Number(ipdData.eyeToCameraCm)
          eyeToCameraCount++
        }

        if (ipdData.eyeToCenterCm && !isNaN(ipdData.eyeToCenterCm)) {
          eyeToCenterSum += Number(ipdData.eyeToCenterCm)
          eyeToCenterCount++
        }

        if (ipdData.eyeToPointCm && !isNaN(ipdData.eyeToPointCm)) {
          eyeToPointSum += Number(ipdData.eyeToPointCm)
          eyeToPointCount++
        }

        if (ipdData.footToCameraCm && !isNaN(ipdData.footToCameraCm)) {
          footToCameraSum += Number(ipdData.footToCameraCm)
          footToCameraCount++
        }

        if (ipdData.footToCenterCm && !isNaN(ipdData.footToCenterCm)) {
          footToCenterSum += Number(ipdData.footToCenterCm)
          footToCenterCount++
        }

        if (ipdData.footToPointCm && !isNaN(ipdData.footToPointCm)) {
          footToPointSum += Number(ipdData.footToPointCm)
          footToPointCount++
        }

        if (ipdData.calibrationFactor && !isNaN(ipdData.calibrationFactor)) {
          calibrationFactorSum += Number(ipdData.calibrationFactor)
          calibrationFactorCount++
        }

        if (ipdData.eyeToFootCm && !isNaN(ipdData.eyeToFootCm)) {
          eyeToFootSum += Number(ipdData.eyeToFootCm)
          eyeToFootCount++
        }

        if (
          ipdData.footXYPx &&
          !isNaN(ipdData.footXYPx[0]) &&
          !isNaN(ipdData.footXYPx[1])
        ) {
          footXXSum += Number(ipdData.footXYPx[0])
          footYYSum += Number(ipdData.footXYPx[1])
          footXYCount++
        }

        if (
          ipdData.pointXYPx &&
          !isNaN(ipdData.pointXYPx[0]) &&
          !isNaN(ipdData.pointXYPx[1])
        ) {
          pointXXSum += Number(ipdData.pointXYPx[0])
          pointYYSum += Number(ipdData.pointXYPx[1])
          pointXYCount++
        }

        if (ipdData.yawDeg && !isNaN(ipdData.yawDeg)) {
          yawDegSum += Number(ipdData.yawDeg)
          yawDegCount++
        }
      } else {
        samples.push(NaN)
        console.warn(`Face Mesh measurement ${i + 1} failed, storing NaN`)
      }
    } catch (error) {
      samples.push(NaN)
      console.warn(`Face Mesh measurement ${i + 1} error:`, error)
    }

    // Wait 100ms between samples
    await new Promise(res => setTimeout(res, 100))
  }

  // Check if we have at least 3 valid samples
  const validSamples = samples.filter(sample => !isNaN(sample))
  const isValid = validSamples.length >= 3

  console.log(`Face Mesh validation: ${validSamples.length}/5 valid samples`)
  console.log(
    'All samples:',
    samples.map(sample => (isNaN(sample) ? 'NaN' : Math.round(sample))),
  )

  // Compute averaged results
  const nearestXYPx_left =
    leftCount > 0
      ? [Math.round(leftXSum / leftCount), Math.round(leftYSum / leftCount)]
      : null
  const nearestXYPx_right =
    rightCount > 0
      ? [Math.round(rightXSum / rightCount), Math.round(rightYSum / rightCount)]
      : null

  const eyeToCameraCm =
    eyeToCameraCount > 0
      ? Math.round((eyeToCameraSum / eyeToCameraCount) * 10) / 10
      : null
  const eyeToCenterCm =
    eyeToCenterCount > 0
      ? Math.round((eyeToCenterSum / eyeToCenterCount) * 10) / 10
      : null
  const eyeToPointCm =
    eyeToPointCount > 0
      ? Math.round((eyeToPointSum / eyeToPointCount) * 10) / 10
      : null

  const footToCameraCm =
    footToCameraCount > 0
      ? Math.round((footToCameraSum / footToCameraCount) * 10) / 10
      : null
  const footToCenterCm =
    footToCenterCount > 0
      ? Math.round((footToCenterSum / footToCenterCount) * 10) / 10
      : null
  const footToPointCm =
    footToPointCount > 0
      ? Math.round((footToPointSum / footToPointCount) * 10) / 10
      : null

  const calibrationFactor =
    calibrationFactorCount > 0
      ? Math.round(calibrationFactorSum / calibrationFactorCount)
      : null

  const eyeToFootCm =
    eyeToFootCount > 0
      ? Math.round((eyeToFootSum / eyeToFootCount) * 10) / 10
      : null

  const footXYPx =
    footXYCount > 0
      ? [
          Math.round(footXXSum / footXYCount),
          Math.round(footYYSum / footXYCount),
        ]
      : null
  const pointXYPx =
    pointXYCount > 0
      ? [
          Math.round(pointXXSum / pointXYCount),
          Math.round(pointYYSum / pointXYCount),
        ]
      : null
  const ipdPixels =
    ipdPixelsCount > 0
      ? Math.round((ipdPixelsSum / ipdPixelsCount) * 10) / 10
      : null
  const ipdXYZPixels =
    ipdXYZPixelsCount > 0
      ? Math.round((ipdXYZPixelsSum / ipdXYZPixelsCount) * 10) / 10
      : null

  const yawDeg =
    yawDegCount > 0 ? Math.round((yawDegSum / yawDegCount) * 10) / 10 : null

  return {
    isValid,
    samples,
    validCount: validSamples.length,
    nearestXYPx_left,
    nearestXYPx_right,
    eyeToCameraCm,
    eyeToCenterCm,
    eyeToPointCm,
    footToCameraCm,
    footToPointCm,
    footToCenterCm,
    calibrationFactor,
    footXYPx,
    ipdPixels,
    ipdXYZPixels, // Always 3D IPD
    pointXYPx,
    eyeToFootCm,
    yawDeg,
  }
}

export const showFaceBlockedPopup = async (
  RC,
  capturedImage,
  saveSnapshots,
) => {
  // Hide video container when popup opens
  const videoContainer = document.getElementById('webgazerVideoContainer')
  let originalVideoDisplay = null
  if (videoContainer) {
    originalVideoDisplay = videoContainer.style.display
    videoContainer.style.display = 'none'
  }

  let conditionalFaceImageNotSaved = ''
  if (!saveSnapshots) {
    conditionalFaceImageNotSaved = `<p style="margin-top: 15px; font-size: 0.7em; color: #666;">${processInlineFormatting(phrases.RC_FaceImageNotSaved[RC.language.value])}</p>`
  }
  const result = await Swal.fire({
    ...swalInfoOptions(RC, { showIcon: false }),
    title: processInlineFormatting(phrases.RC_FaceBlocked[RC.language.value]),
    html: `<div style="text-align: center;">
        <img src="${capturedImage}" style="max-width: 300px; max-height: 400px; border: 2px solid #ccc; border-radius: 8px;" alt="Camera view" />
        ${conditionalFaceImageNotSaved}
       </div>`,
    showCancelButton: false,
    showConfirmButton: true,
    confirmButtonText: phrases.EE_ok[RC.language.value],
    allowEnterKey: false,
    didOpen: () => {
      // Handle keyboard events - only allow Enter/Return, prevent Space
      const keydownListener = event => {
        if (event.key === ' ') {
          event.preventDefault()
          event.stopPropagation()
          return
        }
        if (event.key === 'Enter' || event.key === 'Return') {
          Swal.clickConfirm()
        }
      }
      document.addEventListener('keydown', keydownListener, true)
      RC.popupKeydownListener = keydownListener
    },
    willClose: () => {
      // Remove keyboard event listener
      if (RC.popupKeydownListener) {
        document.removeEventListener('keydown', RC.popupKeydownListener, true)
        RC.popupKeydownListener = null
      }
    },
  })

  // Show video container again when popup closes
  if (videoContainer) {
    videoContainer.style.display = originalVideoDisplay || ''
  }

  return result
}

export const captureIPDFromFaceMesh = async (
  RC,
  calibrateDistancePupil = 'iris',
  calibrateDistanceChecking = 'camera',
  calibrateDistanceIpdUsesZBool = true,
  calibrateDistanceCorrectForHeadRotation = 'useZ',
) => {
  try {
    const video = document.getElementById('webgazerVideoCanvas')
    if (!video) {
      console.warn('No video canvas found for IPD measurement')
      return null
    }
    // Ensure model is loaded
    const model = await RC.gazeTracker.webgazer.getTracker().model
    const faces = await model.estimateFaces(video)

    if (!faces.length) {
      console.warn('No faces detected for IPD measurement')
      return null
    }

    // Get face mesh keypoints
    const mesh = faces[0].keypoints || faces[0].scaledMesh
    // Calculate eye positions using same logic as distanceTrack.js
    const eyeDist = (a, b, useZ = true) =>
      useZ
        ? Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)
        : Math.hypot(a.x - b.x, a.y - b.y)
    const { leftEye, rightEye } = getLeftAndRightEyePointsFromMeshData(
      mesh,
      calibrateDistancePupil,
    )

    // Calculate IPD in pixels
    const ipdPixels = eyeDist(leftEye, rightEye, calibrateDistanceIpdUsesZBool)
    // Always calculate 3D IPD for ipdOverWidthXYZ (uses Z coordinate)
    const ipdXYZPixels = eyeDist(leftEye, rightEye, true)

    // Correct for head rotation shrinkage
    const { ipdShrinkage, yawDeg } = estimateHeadYawRobust(
      mesh,
      leftEye,
      rightEye,
      calibrateDistanceCorrectForHeadRotation,
    )

    const correctedIPD = correctIpdForHeadRotation(ipdPixels, ipdShrinkage)

    // Convert to cm if we have screen PPI
    let ipdCm = null
    if (RC.screenPpi && RC.screenPpi.value) {
      // Use the same conversion logic as in distance tracking
      const VpxPerCm = correctedIPD / RC._CONST.IPD_CM
      ipdCm = correctedIPD / VpxPerCm
    }
    const cameraResolutionXYVpx = getCameraResolutionXY(RC)
    const horizontalVpx = cameraResolutionXYVpx[0]
    const ipdOverWidth = correctedIPD / horizontalVpx
    let eyesToFootCm =
      (RC.calibrationFOverWidth * RC._CONST.IPD_CM) / ipdOverWidth
    if (
      RC.useObjectTestData === 'justCreditCard' ||
      RC.useObjectTestData === 'autoCreditCard'
    ) {
      try {
        eyesToFootCm =
          (RC.fRatio * RC.getHorizontalVpx() * RC._CONST.IPD_CM) / correctedIPD
      } catch (error) {
        console.error('Error calculating webcamToEyeDistance:', error)
      }
    }
    const ppi = RC.screenPpi ? RC.screenPpi.value : RC._CONST.N.PPI_DONT_USE

    const pxPerCm = ppi / 2.54

    const nearestPoints = calculateNearestPoints(
      video,
      leftEye,
      rightEye,
      correctedIPD,
      eyesToFootCm,
      pxPerCm,
      RC.screenPpi.value,
      RC,
      {},
      0,
      0,
      '',
      1,
      [],
      [],
      0,
      0,
      correctedIPD,
      true,
      calibrateDistanceChecking,
    )
    const {
      nearestXYPx_left,
      nearestXYPx_right,
      eyeToCameraCm,
      eyeToPointCm,
      eyeToCenterCm,
      footToCameraCm,
      footToCenterCm,
      footToPointCm,
      calibrationFactor,
      footXYPx,
      pointXYPx,
      eyeToFootCm,
    } = nearestPoints

    return {
      ipdPixels: correctedIPD ? Number(correctedIPD.toFixed(1)) : null,
      ipdXYZPixels: ipdXYZPixels ? Number(ipdXYZPixels.toFixed(1)) : null, // Always 3D
      ipdCm: ipdCm ? Number(ipdCm.toFixed(2)) : null,
      ipdShrinkage,
      yawDeg: Number(yawDeg.toFixed(1)),
      timestamp: performance.now(),
      eyePositions: {
        left: leftEye,
        right: rightEye,
      },
      nearestXYPx_left,
      nearestXYPx_right,
      eyeToCameraCm,
      eyeToCenterCm,
      footToCameraCm,
      footToCenterCm,
      calibrationFactor,
      eyeToPointCm,
      footToPointCm,
      footXYPx,
      pointXYPx,
      eyeToFootCm,
    }
  } catch (error) {
    console.error('Error capturing IPD from face mesh:', error)
    return null
  }
}
