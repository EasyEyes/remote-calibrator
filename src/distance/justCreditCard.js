import { phrases } from '../i18n/schema'
import Swal from 'sweetalert2'
import { swalInfoOptions } from '../components/swalOptions'
import { setDefaultVideoPosition } from '../components/video'
import { cameraShutterSound } from '../components/sound'
import {
  createStepInstructionsUI,
  renderStepInstructions,
  createAnchoredStepperUI,
} from './stepByStepInstructionHelps'
import { parseInstructions } from './instructionParserAdapter'
import { startIrisDrawingWithMesh } from './distanceTrack'
import { getFullscreen, isFullscreen, toFixedNumber } from '../components/utils'
import { hideResolutionSettingMessage } from '../components/popup'

// Constants for credit card size in centimeters
const CREDIT_CARD_SHORT_CM = 5.398
const CREDIT_CARD_LONG_CM = 8.56

// Assumed adult IPD in centimeters for deriving factorVpxCm to keep downstream code working
const ASSUMED_IPD_CM = 6.3
const QUAD_BASE_RATIO_DEFAULT = 1.3

// Shared state holder for outline rendering
let cardState = null

// ============================================================================
// AUTO-DETECTION: Credit Card Edge Detection System
// ============================================================================

/**
 * Captures the current video frame as ImageData for processing
 */
function captureVideoFrameData() {
  const video = document.getElementById('webgazerVideoCanvas')
  if (!video) return null

  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')

  // Get actual video dimensions
  const width = video.width || video.videoWidth || 640
  const height = video.height || video.videoHeight || 480

  canvas.width = width
  canvas.height = height

  // Draw the video frame (mirrored to match display)
  ctx.save()
  ctx.translate(width, 0)
  ctx.scale(-1, 1)
  ctx.drawImage(video, 0, 0, width, height)
  ctx.restore()

  return {
    imageData: ctx.getImageData(0, 0, width, height),
    width,
    height,
    canvas,
    ctx,
  }
}

/**
 * Calculate dynamic minimum edge length based on Y position
 *
 * Geometry: Card pivots on blue line at bottom, tilted upward
 * - Lower Y (higher on screen) = more tilt = longer visible edge
 * - Higher Y (lower on screen) = less tilt = shorter visible edge
 *
 * Formula: minLengthFraction = 0.50 - 0.35 * normalized_Y
 * - At top of search region (normalized_Y = 0): 50% of width
 * - At center of search region (normalized_Y = 0.5): ~33% of width
 * - At bottom of search region (normalized_Y = 1): 15% of width
 */
function calculateDynamicMinLength(
  edgeY,
  width,
  height,
  regionTop,
  regionBottom,
) {
  if (edgeY === undefined || edgeY === null) {
    // Fallback if no Y detected yet
    return width * 0.25
  }

  // Normalize Y within the search region (0 = top, 1 = bottom)
  const normalizedY = Math.max(
    0,
    Math.min(1, (edgeY - regionTop) / (regionBottom - regionTop)),
  )

  // Linear interpolation: more tilt (lower Y) = higher minimum
  // At top (normalizedY=0): 50%, at bottom (normalizedY=1): 15%
  const minFraction = 0.5 - 0.35 * normalizedY

  return width * minFraction
}

/**
 * Convert RGB pixel data to grayscale
 */
function toGrayscale(imageData) {
  const data = imageData.data
  const gray = new Uint8ClampedArray(imageData.width * imageData.height)

  for (let i = 0, j = 0; i < data.length; i += 4, j++) {
    // Luminosity formula
    gray[j] = Math.round(
      data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114,
    )
  }

  return gray
}

/**
 * Apply Gaussian blur to reduce noise (3x3 kernel)
 */
function gaussianBlur(gray, width, height) {
  const blurred = new Uint8ClampedArray(gray.length)
  const kernel = [1, 2, 1, 2, 4, 2, 1, 2, 1]
  const kernelSum = 16

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      let sum = 0
      let ki = 0
      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          sum += gray[(y + ky) * width + (x + kx)] * kernel[ki++]
        }
      }
      blurred[y * width + x] = sum / kernelSum
    }
  }

  return blurred
}

/**
 * Compute horizontal gradient (Sobel-X) for vertical edge detection
 * and vertical gradient (Sobel-Y) for horizontal edge detection
 */
function sobelGradients(gray, width, height) {
  const gradX = new Float32Array(gray.length)
  const gradY = new Float32Array(gray.length)
  const magnitude = new Float32Array(gray.length)

  // Sobel kernels
  // X: [-1, 0, 1, -2, 0, 2, -1, 0, 1]
  // Y: [-1, -2, -1, 0, 0, 0, 1, 2, 1]

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x

      // Sobel X (detects vertical edges)
      const gx =
        -gray[(y - 1) * width + (x - 1)] +
        gray[(y - 1) * width + (x + 1)] +
        -2 * gray[y * width + (x - 1)] +
        2 * gray[y * width + (x + 1)] +
        -gray[(y + 1) * width + (x - 1)] +
        gray[(y + 1) * width + (x + 1)]

      // Sobel Y (detects horizontal edges) - this is what we want for card edge
      const gy =
        -gray[(y - 1) * width + (x - 1)] +
        -2 * gray[(y - 1) * width + x] +
        -gray[(y - 1) * width + (x + 1)] +
        gray[(y + 1) * width + (x - 1)] +
        2 * gray[(y + 1) * width + x] +
        gray[(y + 1) * width + (x + 1)]

      gradX[idx] = gx
      gradY[idx] = gy
      magnitude[idx] = Math.sqrt(gx * gx + gy * gy)
    }
  }

  return { gradX, gradY, magnitude }
}

/**
 * Find the strongest horizontal edge in a region of interest
 * Returns the Y position and endpoints of the detected edge
 */
function detectHorizontalEdge(
  frameData,
  regionTop,
  regionBottom,
  minEdgeLength,
) {
  const { imageData, width, height } = frameData

  // Clamp region to valid bounds
  const yStart = Math.max(1, Math.floor(regionTop))
  const yEnd = Math.min(height - 1, Math.floor(regionBottom))

  if (yEnd <= yStart) return null

  // Convert to grayscale and compute gradients
  const gray = toGrayscale(imageData)
  const blurred = gaussianBlur(gray, width, height)
  const { gradY, magnitude } = sobelGradients(blurred, width, height)

  // Parameters for edge detection
  const edgeThreshold = 30 // Minimum gradient magnitude to consider as edge
  const minRunLength = Math.floor(minEdgeLength * 0.5) // Minimum continuous edge length
  const horizontalTolerance = 3 // Max Y deviation for "horizontal" edge

  // Scan each row in the region to find strong horizontal edges
  // We're looking for a row with many strong edge pixels (high gradY magnitude)
  const rowScores = []

  for (let y = yStart; y < yEnd; y++) {
    let rowScore = 0
    let maxRun = 0
    let currentRun = 0
    let runStartX = 0
    let bestRunStartX = 0
    let bestRunEndX = 0

    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x
      const mag = magnitude[idx]
      const gy = Math.abs(gradY[idx])

      // Check if this is a strong horizontal edge (high vertical gradient)
      // Also check that it's primarily a horizontal edge (|gy| > |gx|)
      if (mag > edgeThreshold && gy > mag * 0.5) {
        if (currentRun === 0) {
          runStartX = x
        }
        currentRun++
        rowScore += gy
      } else {
        if (currentRun > maxRun) {
          maxRun = currentRun
          bestRunStartX = runStartX
          bestRunEndX = runStartX + currentRun
        }
        currentRun = 0
      }
    }

    // Check final run
    if (currentRun > maxRun) {
      maxRun = currentRun
      bestRunStartX = runStartX
      bestRunEndX = runStartX + currentRun
    }

    if (maxRun >= minRunLength) {
      rowScores.push({
        y,
        score: rowScore,
        runLength: maxRun,
        startX: bestRunStartX,
        endX: bestRunEndX,
      })
    }
  }

  if (rowScores.length === 0) return null

  // Sort by score (strongest edges first)
  rowScores.sort((a, b) => b.score - a.score)

  // Take the best candidate
  const best = rowScores[0]

  // Refine the edge endpoints by looking for the actual edge extent
  // Scan left and right from the detected run to find the true edge extent
  let leftX = best.startX
  let rightX = best.endX
  const y = best.y

  // Extend left
  for (let x = best.startX - 1; x >= 0; x--) {
    const idx = y * width + x
    if (
      magnitude[idx] > edgeThreshold * 0.7 &&
      Math.abs(gradY[idx]) > magnitude[idx] * 0.4
    ) {
      leftX = x
    } else {
      break
    }
  }

  // Extend right
  for (let x = best.endX; x < width; x++) {
    const idx = y * width + x
    if (
      magnitude[idx] > edgeThreshold * 0.7 &&
      Math.abs(gradY[idx]) > magnitude[idx] * 0.4
    ) {
      rightX = x
    } else {
      break
    }
  }

  // Verify the edge is long enough
  const edgeLength = rightX - leftX
  if (edgeLength < minEdgeLength) return null

  return {
    y: best.y,
    leftX,
    rightX,
    length: edgeLength,
    score: best.score,
  }
}

/**
 * More robust edge detection using edge clustering with sub-pixel accuracy
 * Groups nearby edge pixels and finds the most prominent horizontal cluster
 * Uses weighted averaging and gradient interpolation for precision
 */
function detectCardEdgeWithClustering(
  frameData,
  regionTop,
  regionBottom,
  expectedWidth,
) {
  const { imageData, width, height } = frameData

  const yStart = Math.max(2, Math.floor(regionTop))
  const yEnd = Math.min(height - 2, Math.floor(regionBottom))

  if (yEnd <= yStart) return null

  const gray = toGrayscale(imageData)
  const blurred = gaussianBlur(gray, width, height)
  const { gradY, magnitude } = sobelGradients(blurred, width, height)

  // Apply non-maximum suppression in Y direction to find true edge peaks
  // LOWERED threshold for better sensitivity
  const edgeThreshold = 8
  const edgePixels = []

  for (let y = yStart; y < yEnd; y++) {
    for (let x = 10; x < width - 10; x++) {
      const idx = y * width + x
      const mag = magnitude[idx]
      const gy = gradY[idx]
      const absGy = Math.abs(gy)

      // Check if this is a strong horizontal edge (relaxed for better detection)
      if (mag > edgeThreshold && absGy > mag * 0.4) {
        // Non-maximum suppression: check if this is a local maximum in Y
        const idxAbove = (y - 1) * width + x
        const idxBelow = (y + 1) * width + x
        const magAbove = Math.abs(gradY[idxAbove])
        const magBelow = Math.abs(gradY[idxBelow])

        if (absGy >= magAbove && absGy >= magBelow) {
          // Sub-pixel Y refinement using parabolic interpolation
          let subPixelY = y
          if (magAbove > 0 && magBelow > 0) {
            // Parabolic fit: find the peak between the three samples
            const denom = 2 * (2 * absGy - magAbove - magBelow)
            if (Math.abs(denom) > 0.001) {
              const offset = (magAbove - magBelow) / denom
              if (Math.abs(offset) < 1) {
                subPixelY = y + offset
              }
            }
          }

          edgePixels.push({
            x,
            y: subPixelY,
            strength: absGy,
            direction: Math.sign(gy), // positive = bright above, dark below
          })
        }
      }
    }
  }

  if (edgePixels.length < 5) return null // Reduced for better detection

  // Cluster edge pixels by Y coordinate with finer bins
  const yBins = {}
  const binSize = 3 // Finer bins for better precision

  for (const pixel of edgePixels) {
    const binY = Math.floor(pixel.y / binSize) * binSize
    if (!yBins[binY]) {
      yBins[binY] = []
    }
    yBins[binY].push(pixel)
  }

  // Find the bin with the longest horizontal extent AND consistent edge direction
  let bestBin = null
  let bestScore = 0

  for (const [binY, pixels] of Object.entries(yBins)) {
    if (pixels.length < 4) continue

    // Sort by X to find extent
    pixels.sort((a, b) => a.x - b.x)

    // Find runs with consistent edge direction
    let runStart = 0
    let maxScore = 0
    let bestRun = null

    for (let i = 1; i <= pixels.length; i++) {
      const shouldBreak =
        i === pixels.length ||
        pixels[i].x - pixels[i - 1].x > 20 ||
        pixels[i].direction !== pixels[runStart].direction

      if (shouldBreak) {
        const runEnd = i - 1
        const runLength = pixels[runEnd].x - pixels[runStart].x

        // Calculate run score: length * consistency * total strength
        const runPixels = pixels.slice(runStart, i)
        const totalStrength = runPixels.reduce((sum, p) => sum + p.strength, 0)
        const avgStrength = totalStrength / runPixels.length
        const score = (runLength * avgStrength) / 100

        // Dynamic minimum based on Y position (more tilt = higher up = longer edge)
        const binYCenter = parseInt(binY) + binSize / 2
        const minRunLength = calculateDynamicMinLength(
          binYCenter,
          width,
          height,
          yStart,
          yEnd,
        )

        // Check if edge center is close to video center (blue line is centered)
        const edgeCenter = (pixels[runStart].x + pixels[runEnd].x) / 2
        const videoCenter = width / 2
        const centerTolerance = width * 0.15 // Allow 15% deviation from center
        const isCentered = Math.abs(edgeCenter - videoCenter) <= centerTolerance

        if (score > maxScore && runLength >= minRunLength && isCentered) {
          maxScore = score
          bestRun = {
            leftX: pixels[runStart].x,
            rightX: pixels[runEnd].x,
            pixels: runPixels,
            length: runLength,
            direction: pixels[runStart].direction,
          }
        }

        if (i < pixels.length) {
          runStart = i
        }
      }
    }

    if (bestRun && maxScore > bestScore) {
      bestScore = maxScore
      bestBin = {
        ...bestRun,
        y: parseInt(binY) + binSize / 2,
      }
    }
  }

  if (!bestBin) return null

  // Refine Y position using strength-weighted average (more accurate)
  const runPixels = bestBin.pixels
  if (runPixels.length > 0) {
    let weightedY = 0
    let totalWeight = 0

    for (const p of runPixels) {
      const weight = p.strength * p.strength // Square weight emphasizes strong edges
      weightedY += p.y * weight
      totalWeight += weight
    }

    if (totalWeight > 0) {
      bestBin.y = weightedY / totalWeight
    }
  }

  // Refine edge extent using color consistency (much more accurate)
  // This looks at the actual card color and finds where it ends
  const refinedExtent = refineEdgeExtentByColor(
    imageData,
    width,
    height,
    bestBin.y,
    bestBin.leftX,
    bestBin.rightX,
  )

  if (refinedExtent) {
    const refinedLength = refinedExtent.rightX - refinedExtent.leftX

    // Re-check minimum length constraint after refinement
    const minLength = calculateDynamicMinLength(
      bestBin.y,
      width,
      height,
      yStart,
      yEnd,
    )

    // Re-check centering constraint after refinement
    const refinedCenter = (refinedExtent.leftX + refinedExtent.rightX) / 2
    const videoCenter = width / 2
    const centerTolerance = width * 0.15
    const isCentered = Math.abs(refinedCenter - videoCenter) <= centerTolerance

    // Only use refined extent if it still meets BOTH constraints
    // Otherwise keep the original extent from edge detection
    if (refinedLength >= minLength && isCentered) {
      bestBin.leftX = refinedExtent.leftX
      bestBin.rightX = refinedExtent.rightX
      bestBin.length = refinedLength
    }
    // If refined fails constraints, keep the original bestBin values
  }

  // FINAL CONSTRAINT CHECK before returning
  // Ensure the result meets ALL constraints
  const finalLength = bestBin.rightX - bestBin.leftX
  const finalMinLength = calculateDynamicMinLength(
    bestBin.y,
    width,
    height,
    yStart,
    yEnd,
  )
  const finalCenter = (bestBin.leftX + bestBin.rightX) / 2
  const finalVideoCenter = width / 2
  const finalCenterTolerance = width * 0.15
  const finalIsCentered =
    Math.abs(finalCenter - finalVideoCenter) <= finalCenterTolerance

  if (finalLength < finalMinLength || !finalIsCentered) {
    return null // Reject if constraints not met
  }

  return bestBin
}

/**
 * Refine edge extent by detecting the SIDE EDGES of the credit card
 * The card has two tilted side edges going from the short edge to the blue line
 * We detect these diagonal edges and extrapolate to find the corners
 */
function refineEdgeExtentByColor(
  imageData,
  width,
  height,
  edgeY,
  initialLeftX,
  initialRightX,
) {
  const data = imageData.data
  const y = Math.round(edgeY)

  if (y < 5 || y >= height - 10) return null

  const centerX = Math.floor((initialLeftX + initialRightX) / 2)

  // Sample multiple rows below the horizontal edge to trace the side edges
  const sampleRows = []
  for (let dy = 5; dy <= 60; dy += 5) {
    if (y + dy < height - 5) {
      sampleRows.push(y + dy)
    }
  }
  if (sampleRows.length < 3) return null

  // For each sample row, find the left and right side edges using gradient
  const leftEdgePoints = []
  const rightEdgePoints = []

  for (const sy of sampleRows) {
    // Find left side edge: scan from center toward left, find strongest gradient
    let bestLeftX = null
    let bestLeftStrength = 0

    for (let x = centerX - 10; x > 20; x--) {
      const strength = getHorizontalGradientStrength(data, width, x, sy)
      if (strength > 25 && strength > bestLeftStrength) {
        bestLeftStrength = strength
        bestLeftX = x
      }
      // Stop if we've gone 40px past the best find
      if (bestLeftX !== null && x < bestLeftX - 40) break
    }

    if (bestLeftX !== null && bestLeftStrength > 30) {
      leftEdgePoints.push({ x: bestLeftX, y: sy })
    }

    // Find right side edge: scan from center toward right
    let bestRightX = null
    let bestRightStrength = 0

    for (let x = centerX + 10; x < width - 20; x++) {
      const strength = getHorizontalGradientStrength(data, width, x, sy)
      if (strength > 25 && strength > bestRightStrength) {
        bestRightStrength = strength
        bestRightX = x
      }
      if (bestRightX !== null && x > bestRightX + 40) break
    }

    if (bestRightX !== null && bestRightStrength > 30) {
      rightEdgePoints.push({ x: bestRightX, y: sy })
    }
  }

  // Need at least 3 points to reliably estimate the side edge line
  let leftX = initialLeftX
  let rightX = initialRightX

  if (leftEdgePoints.length >= 3) {
    const extrapolatedLeft = extrapolateSideEdgeToY(leftEdgePoints, y)
    if (extrapolatedLeft !== null) {
      leftX = extrapolatedLeft
    }
  }

  if (rightEdgePoints.length >= 3) {
    const extrapolatedRight = extrapolateSideEdgeToY(rightEdgePoints, y)
    if (extrapolatedRight !== null) {
      rightX = extrapolatedRight
    }
  }

  // Ensure result makes sense
  if (rightX <= leftX + 20) {
    return { leftX: initialLeftX, rightX: initialRightX }
  }

  return { leftX, rightX }
}

/**
 * Calculate horizontal gradient strength at a point (for side edge detection)
 */
function getHorizontalGradientStrength(data, width, x, y) {
  if (x < 3 || x >= width - 3) return 0

  // Use a small vertical window for robustness
  let totalGrad = 0
  for (let dy = -1; dy <= 1; dy++) {
    const yy = y + dy
    const idx = (yy * width + x) * 4
    const idxLeft = (yy * width + x - 2) * 4
    const idxRight = (yy * width + x + 2) * 4

    totalGrad += Math.abs(data[idxRight] - data[idxLeft])
    totalGrad += Math.abs(data[idxRight + 1] - data[idxLeft + 1])
    totalGrad += Math.abs(data[idxRight + 2] - data[idxLeft + 2])
  }

  return totalGrad / 3
}

/**
 * Fit a line to side edge points and extrapolate to target Y
 * Uses linear regression: x = slope * y + intercept
 */
function extrapolateSideEdgeToY(points, targetY) {
  if (points.length < 2) return null

  const n = points.length
  let sumY = 0,
    sumX = 0,
    sumYY = 0,
    sumXY = 0

  for (const p of points) {
    sumY += p.y
    sumX += p.x
    sumYY += p.y * p.y
    sumXY += p.x * p.y
  }

  const denom = n * sumYY - sumY * sumY
  if (Math.abs(denom) < 0.001) return null

  const slope = (n * sumXY - sumX * sumY) / denom
  const intercept = (sumX * sumYY - sumY * sumXY) / denom

  // Extrapolate to target Y
  return slope * targetY + intercept
}

/**
 * Get average color of a region
 */
function getAverageColor(data, width, x1, x2, y1, y2) {
  let r = 0,
    g = 0,
    b = 0,
    count = 0

  for (let y = Math.max(0, y1); y <= y2; y++) {
    for (let x = Math.max(0, x1); x <= x2 && x < width; x++) {
      const idx = (y * width + x) * 4
      r += data[idx]
      g += data[idx + 1]
      b += data[idx + 2]
      count++
    }
  }

  if (count === 0) return { r: 128, g: 128, b: 128 }
  return { r: r / count, g: g / count, b: b / count }
}

/**
 * Get color of a single pixel
 */
function getPixelColor(data, width, x, y) {
  const idx = (y * width + x) * 4
  return { r: data[idx], g: data[idx + 1], b: data[idx + 2] }
}

/**
 * Calculate perceptual color distance (weighted for human vision)
 * Human eyes are more sensitive to green, less to blue
 */
function colorDistance(c1, c2) {
  const dr = c1.r - c2.r
  const dg = c1.g - c2.g
  const db = c1.b - c2.b
  // Perceptual weights: R=0.3, G=0.59, B=0.11 (based on luminance sensitivity)
  return Math.sqrt(0.3 * dr * dr + 0.59 * dg * dg + 0.11 * db * db)
}

/**
 * Advanced card edge detection using color uniformity analysis
 * Credit cards have uniform color, so we look for the transition from
 * uniform card color to non-uniform background
 */
function detectCardEdgeByColorUniformity(
  frameData,
  regionTop,
  regionBottom,
  expectedWidth,
) {
  const { imageData, width, height } = frameData
  const data = imageData.data

  const yStart = Math.max(5, Math.floor(regionTop))
  const yEnd = Math.min(height - 5, Math.floor(regionBottom))

  if (yEnd <= yStart) return null

  // For each row, calculate color variance in sliding windows
  // The card edge is where we transition from low variance (card) to high variance (background)
  const windowSize = 20
  const rowScores = []

  for (let y = yStart; y < yEnd; y++) {
    // Calculate variance for pixels above and below this row
    const aboveVariance = calculateRowVariance(data, width, y - 3, windowSize)
    const belowVariance = calculateRowVariance(data, width, y + 3, windowSize)

    // Edge detection: look for transition from low to high variance
    // (card above, background below) OR high to low (background above, card below)
    const varianceRatio = Math.max(
      aboveVariance / (belowVariance + 1),
      belowVariance / (aboveVariance + 1),
    )

    if (varianceRatio > 1.5) {
      // Also check for strong edge gradient at this row
      const edgeStrength = calculateRowEdgeStrength(data, width, y)
      rowScores.push({
        y,
        varianceRatio,
        edgeStrength,
        score: varianceRatio * Math.log(edgeStrength + 1),
      })
    }
  }

  if (rowScores.length === 0) return null

  // Sort by combined score
  rowScores.sort((a, b) => b.score - a.score)

  // Take the best row and find edge extent
  const bestRow = rowScores[0]
  const gray = toGrayscale(imageData)
  const blurred = gaussianBlur(gray, width, height)
  const { gradY, magnitude } = sobelGradients(blurred, width, height)

  // Find edge extent at this row
  let leftX = width / 2
  let rightX = width / 2
  const threshold = 20

  // Scan left from center
  for (let x = Math.floor(width / 2); x > 10; x--) {
    const idx = bestRow.y * width + x
    if (Math.abs(gradY[idx]) > threshold) {
      leftX = x
    } else {
      break
    }
  }

  // Scan right from center
  for (let x = Math.floor(width / 2); x < width - 10; x++) {
    const idx = bestRow.y * width + x
    if (Math.abs(gradY[idx]) > threshold) {
      rightX = x
    } else {
      break
    }
  }

  // Extend to find full edge
  const edgeLength = rightX - leftX
  if (edgeLength < expectedWidth * 0.3) return null

  return {
    y: bestRow.y,
    leftX,
    rightX,
    length: edgeLength,
    score: bestRow.score,
  }
}

/**
 * Calculate color variance for a row of pixels
 */
function calculateRowVariance(data, width, y, windowSize) {
  if (y < 0 || y >= data.length / (width * 4)) return 0

  const startX = Math.floor((width - windowSize) / 2)
  const endX = startX + windowSize

  let sumR = 0,
    sumG = 0,
    sumB = 0
  let sumR2 = 0,
    sumG2 = 0,
    sumB2 = 0
  let count = 0

  for (let x = startX; x < endX; x++) {
    const idx = (y * width + x) * 4
    const r = data[idx]
    const g = data[idx + 1]
    const b = data[idx + 2]

    sumR += r
    sumG += g
    sumB += b
    sumR2 += r * r
    sumG2 += g * g
    sumB2 += b * b
    count++
  }

  if (count === 0) return 0

  const varR = sumR2 / count - (sumR / count) ** 2
  const varG = sumG2 / count - (sumG / count) ** 2
  const varB = sumB2 / count - (sumB / count) ** 2

  return varR + varG + varB
}

/**
 * Calculate edge strength for a row
 */
function calculateRowEdgeStrength(data, width, y) {
  let strength = 0
  const halfWidth = Math.floor(width / 2)
  const scanWidth = Math.floor(width * 0.6)
  const startX = halfWidth - scanWidth / 2
  const endX = halfWidth + scanWidth / 2

  for (let x = startX + 1; x < endX - 1; x++) {
    const idx = (y * width + x) * 4
    const idxAbove = ((y - 1) * width + x) * 4
    const idxBelow = ((y + 1) * width + x) * 4

    // Vertical gradient
    const gradY =
      Math.abs(data[idxBelow] - data[idxAbove]) +
      Math.abs(data[idxBelow + 1] - data[idxAbove + 1]) +
      Math.abs(data[idxBelow + 2] - data[idxAbove + 2])

    strength += gradY
  }

  return strength / (endX - startX)
}

/**
 * Combined detection using multiple methods for robustness
 */
function detectCardEdgeCombined(
  frameData,
  regionTop,
  regionBottom,
  expectedWidth,
) {
  // Try the clustering method first (works well for clear edges)
  const clustering = detectCardEdgeWithClustering(
    frameData,
    regionTop,
    regionBottom,
    expectedWidth,
  )

  // Try the color uniformity method (works well for uniform cards)
  const colorUniformity = detectCardEdgeByColorUniformity(
    frameData,
    regionTop,
    regionBottom,
    expectedWidth,
  )

  // If both methods agree (similar Y position), use the combined result
  if (clustering && colorUniformity) {
    const yDiff = Math.abs(clustering.y - colorUniformity.y)
    if (yDiff < 10) {
      // Methods agree - average them for better accuracy
      return {
        y: (clustering.y + colorUniformity.y) / 2,
        leftX: Math.min(clustering.leftX, colorUniformity.leftX),
        rightX: Math.max(clustering.rightX, colorUniformity.rightX),
        length: Math.max(clustering.length, colorUniformity.length),
        confidence: 'high',
      }
    }
  }

  // Return whichever has better score/length
  if (clustering && colorUniformity) {
    return clustering.length > colorUniformity.length
      ? { ...clustering, confidence: 'medium' }
      : { ...colorUniformity, confidence: 'medium' }
  }

  return clustering
    ? { ...clustering, confidence: 'low' }
    : colorUniformity
      ? { ...colorUniformity, confidence: 'low' }
      : null
}

/**
 * Auto-detection controller - LIVE CONTINUOUS MODE
 * Continuously detects and updates the green line in real-time
 * Uses temporal smoothing to reduce jitter
 */
class CardEdgeAutoDetector {
  constructor(state, guide, getExpectedVideoRect, videoTopOffsetPx, RC) {
    this.state = state
    this.guide = guide
    this.getExpectedVideoRect = getExpectedVideoRect
    this.videoTopOffsetPx = videoTopOffsetPx
    this.RC = RC
    this.running = false
    this.animationFrameId = null
    this.enabled = false
    this.onUpdate = null // Callback when green line is updated
    this.onConfidenceChange = null

    // Temporal smoothing buffer (reduced for faster response)
    this.recentDetections = []
    this.smoothingWindow = 3 // Average last 3 valid detections for faster tracking
    this.lastConfidence = null
  }

  /**
   * Start live detection
   */
  start() {
    if (this.running) return
    this.running = true
    this.enabled = true
    this.recentDetections = []

    if (this.onConfidenceChange) {
      this.onConfidenceChange('searching')
    }

    this.detect()
  }

  stop() {
    this.running = false
    this.enabled = false
    if (this.animationFrameId) {
      clearTimeout(this.animationFrameId)
      this.animationFrameId = null
    }
  }

  detect() {
    if (!this.running || !this.enabled) return

    try {
      const frameData = captureVideoFrameData()
      if (!frameData) {
        this.scheduleNextFrame()
        return
      }

      const { width, height } = frameData
      const expectedRect = this.getExpectedVideoRect(
        this.RC,
        this.videoTopOffsetPx,
      )

      // Search region
      const regionTop = height * 0.05
      const regionBottom = height * 0.7
      const expectedWidth = width * 0.25

      // Run detection
      const detection = detectCardEdgeWithClustering(
        frameData,
        regionTop,
        regionBottom,
        expectedWidth,
      )

      // Dynamic minimum length based on Y position
      const minLength = calculateDynamicMinLength(
        detection?.y,
        width,
        height,
        regionTop,
        regionBottom,
      )

      // Check if edge center is close to video center
      const edgeCenter = detection
        ? (detection.leftX + detection.rightX) / 2
        : 0
      const videoCenter = width / 2
      const centerTolerance = width * 0.15
      const isCentered = detection
        ? Math.abs(edgeCenter - videoCenter) <= centerTolerance
        : false

      // Valid detection passes all constraints
      if (detection && detection.length >= minLength && isCentered) {
        // Add to smoothing buffer
        this.recentDetections.push({
          y: detection.y,
          leftX: detection.leftX,
          rightX: detection.rightX,
          length: detection.length,
          frameData: frameData,
          expectedRect: expectedRect,
        })

        // Keep only recent detections
        if (this.recentDetections.length > this.smoothingWindow) {
          this.recentDetections.shift()
        }

        // Update green line with smoothed result (show immediately with 1 detection)
        if (this.recentDetections.length >= 1) {
          const smoothed = this.getSmoothedDetection()
          this.updateGreenLine(smoothed, frameData, expectedRect)

          // Update confidence
          const confidence =
            detection.length > width * 0.35
              ? 'high'
              : detection.length > width * 0.25
                ? 'medium'
                : 'low'
          if (confidence !== this.lastConfidence) {
            this.lastConfidence = confidence
            if (this.onConfidenceChange) {
              this.onConfidenceChange(confidence)
            }
          }
        }
      } else {
        // No valid detection this frame - keep using previous smoothed result
        // Don't clear the buffer immediately (allows for brief occlusions)
      }
    } catch (e) {
      console.warn('Card edge detection error:', e)
    }

    this.scheduleNextFrame()
  }

  /**
   * Get smoothed detection using median of recent detections
   */
  getSmoothedDetection() {
    const n = this.recentDetections.length
    if (n === 0) return null
    if (n === 1) return this.recentDetections[0]

    // Use median for robustness
    const ys = this.recentDetections.map(d => d.y).sort((a, b) => a - b)
    const leftXs = this.recentDetections.map(d => d.leftX).sort((a, b) => a - b)
    const rightXs = this.recentDetections
      .map(d => d.rightX)
      .sort((a, b) => a - b)

    const mid = Math.floor(n / 2)
    return {
      y: n % 2 === 0 ? (ys[mid - 1] + ys[mid]) / 2 : ys[mid],
      leftX: n % 2 === 0 ? (leftXs[mid - 1] + leftXs[mid]) / 2 : leftXs[mid],
      rightX:
        n % 2 === 0 ? (rightXs[mid - 1] + rightXs[mid]) / 2 : rightXs[mid],
    }
  }

  updateGreenLine(detection, frameData, expectedRect) {
    if (!detection || this.state.dragging) return

    const { width: videoWidth, height: videoHeight } = frameData

    // Convert video coordinates to screen coordinates
    const scaleX = expectedRect.width / videoWidth
    const scaleY = expectedRect.height / videoHeight

    // Note: The video is mirrored, so we flip X coordinates
    const screenLeftX =
      expectedRect.left + (videoWidth - detection.rightX) * scaleX
    const screenRightX =
      expectedRect.left + (videoWidth - detection.leftX) * scaleX
    const screenY = expectedRect.top + detection.y * scaleY

    // Update state
    this.state.p1 = { x: screenLeftX, y: screenY }
    this.state.p2 = { x: screenRightX, y: screenY }
    this.state.lineLengthPx = screenRightX - screenLeftX

    if (this.onUpdate) {
      this.onUpdate()
    }
  }

  scheduleNextFrame() {
    if (!this.running) return
    // Run at ~25 FPS for responsive tracking
    this.animationFrameId = setTimeout(() => {
      requestAnimationFrame(() => this.detect())
    }, 40)
  }

  toggle() {
    if (this.enabled) {
      this.stop()
      return false
    } else {
      this.start()
      return true
    }
  }
}

function getCamParams(RC, videoTopOffsetPx = 0) {
  const cam = getCameraResolution(RC)
  if (!cam) return null
  const rect = getExpectedVideoRect(RC, videoTopOffsetPx)
  const cx = rect.left + rect.width / 2
  const cy = rect.top + rect.height / 2
  return { cam, cx, cy }
}

function getVideoContainerRect() {
  const v = document.getElementById('webgazerVideoContainer')
  if (!v) return null
  const rect = v.getBoundingClientRect()
  return { el: v, rect }
}

function getCameraResolution(RC) {
  try {
    const vp = RC?.gazeTracker?.webgazer?.videoParamsToReport
    if (vp && vp.width && vp.height) {
      return {
        width: vp.width,
        height: vp.height,
        maxWidth: vp.maxWidth,
        maxHeight: vp.maxHeight,
      }
    }
  } catch (_) {}
  return null
}

function createOverlayLayer() {
  const layer = document.createElement('div')
  layer.id = 'just-credit-card-overlay'
  layer.style.position = 'fixed'
  layer.style.left = '0'
  layer.style.top = '0'
  layer.style.width = '100%'
  layer.style.height = '100%'
  layer.style.pointerEvents = 'none'
  layer.style.zIndex = '1000000000000'
  return layer
}

// Inject a subtle flicker animation for guide lines (once)
function ensureFlickerStyle() {
  const styleId = 'just-credit-card-flicker-style'
  if (document.getElementById(styleId)) return
  const s = document.createElement('style')
  s.id = styleId
  s.textContent = `
    @keyframes jc-line-flicker {
      0% { opacity: 0.1; }
      45% { opacity: 1; }
      55% { opacity: 1; }
      100% { opacity: 0.1; }
    }
  `
  document.head.appendChild(s)
}

function createDashedGuide() {
  const guide = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  guide.id = 'just-credit-card-guide'
  guide.style.position = 'absolute'
  guide.style.overflow = 'visible'
  guide.style.pointerEvents = 'none'
  // Position off-screen initially to prevent flash at wrong position
  guide.style.left = '-9999px'
  guide.style.top = '-9999px'
  guide.style.opacity = '0'
  guide.style.transition = 'opacity 0.15s ease-in'

  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  path.setAttribute('stroke', 'rgba(0, 180, 0, 0.95)')
  path.setAttribute('stroke-width', '3')
  path.setAttribute('stroke-dasharray', '8,4')
  path.setAttribute('fill', 'none')
  path.style.animation = 'jc-line-flicker 0.125s ease-in-out infinite'
  guide.appendChild(path)

  return guide
}

function createCardOutline() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.id = 'just-credit-card-outline'
  svg.style.position = 'absolute'
  svg.style.overflow = 'visible'
  svg.style.pointerEvents = 'none'
  svg.style.left = '-9999px'
  svg.style.top = '-9999px'
  svg.style.opacity = '0'
  svg.style.transition = 'opacity 0.1s ease-in'

  const body = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  body.id = 'just-credit-card-outline-body'
  body.setAttribute('stroke', 'rgba(0, 200, 0, 0.9)')
  body.setAttribute('stroke-width', '3') // match dashed line thickness
  body.setAttribute('fill', 'none')
  svg.appendChild(body)

  const top = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  top.id = 'just-credit-card-outline-top'
  top.setAttribute('stroke', 'transparent')
  top.setAttribute('stroke-width', '2')
  top.setAttribute('fill', 'none')
  svg.appendChild(top)

  return svg
}

function positionGuide(guide, p1, p2) {
  // Safety check
  if (!p1 || !p2) return

  // Calculate length and angle
  const dx = p2.x - p1.x
  const dy = p2.y - p1.y
  const length = Math.sqrt(dx * dx + dy * dy)
  const angle = Math.atan2(dy, dx) * (180 / Math.PI)

  // Position SVG at p1 and rotate
  guide.style.left = `${p1.x}px`
  guide.style.top = `${p1.y}px`
  guide.style.width = `${Math.max(0, length)}px`
  guide.style.height = '30px' // Enough height for the curve
  guide.style.transformOrigin = '0 0'
  guide.style.transform = `rotate(${angle}deg)`

  // Draw the rounded path with a moderate curve.
  const rBase = (0.318 / 5.398) * length * 0.45
  const rX = Math.min(rBase, length * 0.2)
  const rY = rX * 0.4 // bend control
  const w = length
  const d = `M 0 0 Q ${rX} -${rY} ${rX} -${rY} L ${w - rX} -${rY} Q ${w - rX} -${rY} ${w} 0`

  const path = guide.querySelector('path')
  if (path) path.setAttribute('d', d)

  // Ensure opacity is 1
  guide.style.opacity = '1'
}

function positionCardOutline() {
  const cs = cardState
  if (!cs || !cs.RCRef) return
  const cardOutlineEl = cs.cardOutline
  if (!cardOutlineEl) return
  const bodyPath = cardOutlineEl.querySelector('#just-credit-card-outline-body')
  const topPath = cardOutlineEl.querySelector('#just-credit-card-outline-top')
  if (!bodyPath || !topPath) return

  // Clamp helper to keep outline within the expected video rect
  const expectedRect = getExpectedVideoRect(cs.RCRef, cs.videoTopOffsetPx || 0)
  if (!expectedRect) return
  const clampToRect = ({ x, y }) => ({
    x: Math.min(
      Math.max(x, expectedRect.left),
      expectedRect.left + expectedRect.width,
    ),
    y: Math.min(
      Math.max(y, expectedRect.top),
      expectedRect.top + expectedRect.height,
    ),
  })

  const dx = cs.p2.x - cs.p1.x
  const dy = cs.p2.y - cs.p1.y
  const topWidthVpx = Math.max(0, Math.hypot(dx, dy))
  if (!topWidthVpx) return

  const topUnit = { x: dx / topWidthVpx, y: dy / topWidthVpx }
  let perpDown = { x: topUnit.y, y: -topUnit.x }
  // Ensure the quadrilateral extends downward on screen (positive Y).
  if (perpDown.y < 0) {
    perpDown = { x: -perpDown.x, y: -perpDown.y }
  }

  const quadBaseRatio =
    typeof cs.quadBaseRatio === 'number'
      ? cs.quadBaseRatio
      : QUAD_BASE_RATIO_DEFAULT
  const bottomWidthVpx = topWidthVpx * quadBaseRatio
  const heightVpx = topWidthVpx / 2
  const halfBottom = bottomWidthVpx / 2

  const topMid = { x: (cs.p1.x + cs.p2.x) / 2, y: (cs.p1.y + cs.p2.y) / 2 }
  const bottomMid = {
    x: topMid.x + perpDown.x * heightVpx,
    y: topMid.y + perpDown.y * heightVpx,
  }

  // Use the ideal quad based on current p1/p2 (no scaling). We'll clip via SVG.
  const tl = { x: cs.p1.x, y: cs.p1.y }
  const tr = { x: cs.p2.x, y: cs.p2.y }
  const bl = {
    x: bottomMid.x - topUnit.x * halfBottom,
    y: bottomMid.y - topUnit.y * halfBottom,
  }
  const br = {
    x: bottomMid.x + topUnit.x * halfBottom,
    y: bottomMid.y + topUnit.y * halfBottom,
  }

  cardOutlineEl.setAttribute(
    'viewBox',
    `0 0 ${Math.max(1, window.innerWidth)} ${Math.max(1, window.innerHeight)}`,
  )
  // Update clipPath to hide anything outside the video rect (cosmetic only)
  let defs = cardOutlineEl.querySelector('defs')
  if (!defs) {
    defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs')
    cardOutlineEl.prepend(defs)
  }
  let clip = defs.querySelector('#just-credit-card-clip')
  if (!clip) {
    clip = document.createElementNS('http://www.w3.org/2000/svg', 'clipPath')
    clip.id = 'just-credit-card-clip'
    defs.appendChild(clip)
  }
  let clipRect = clip.querySelector('rect')
  if (!clipRect) {
    clipRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
    clip.appendChild(clipRect)
  }
  clipRect.setAttribute('x', String(expectedRect.left))
  clipRect.setAttribute('y', String(expectedRect.top))
  clipRect.setAttribute('width', String(expectedRect.width))
  clipRect.setAttribute('height', String(expectedRect.height))
  cardOutlineEl.style.left = '0px'
  cardOutlineEl.style.top = '0px'
  cardOutlineEl.style.width = '100%'
  cardOutlineEl.style.height = '100%'
  cardOutlineEl.style.transform = 'none'

  // Body: draw only vertical sides; horizontals stay invisible.
  bodyPath.setAttribute('clip-path', 'url(#just-credit-card-clip)')
  topPath.setAttribute('clip-path', 'url(#just-credit-card-clip)')
  bodyPath.setAttribute(
    'd',
    `M ${tl.x} ${tl.y} L ${bl.x} ${bl.y} M ${tr.x} ${tr.y} L ${br.x} ${br.y}`,
  )
  topPath.setAttribute('d', `M ${tl.x} ${tl.y} L ${tr.x} ${tr.y}`)
  cardOutlineEl.style.opacity = '1'
}

// Get the expected video rect based on known positioning (below camera, centered horizontally)
// This avoids relying on getBoundingClientRect which may return stale values
function getExpectedVideoRect(RC, videoTopOffsetPx) {
  const vw = window.innerWidth
  const vh = window.innerHeight

  // Get camera aspect ratio
  const cam = getCameraResolution(RC)
  const camAspect = cam ? cam.width / cam.height : 16 / 9

  // Available space: width capped to 95% of viewport, height below the desired top offset
  const maxWidth = vw * 0.95
  const availWidth = maxWidth
  const availHeight = Math.max(0, vh - (videoTopOffsetPx || 0))

  // Calculate size that fits while maintaining aspect ratio
  let videoW, videoH
  if (availWidth / availHeight > camAspect) {
    videoH = availHeight
    videoW = videoH * camAspect
  } else {
    videoW = availWidth
    videoH = videoW / camAspect
  }

  // Top is pinned to the requested offset (0.5 cm below blue line)
  const topOffset = Math.max(0, videoTopOffsetPx || 0)
  // Horizontally centered on the camera (screen center)
  const leftOffset = (vw - videoW) / 2

  return {
    left: leftOffset,
    top: topOffset,
    width: videoW,
    height: videoH,
  }
}

function getInstructions(RC, isRepeat) {
  const fallbackPage3 =
    'Hold a credit card level with the floor, pressing one of its short edges firmly against the top center of your screen.\n' +
    'Slide the card left/right until it is left-right centered in the video.\n' +
    'Tilt the card slightly downward until, in the video, its bottom edge meets the green line.\n' +
    "Adjust the green line to match the card's bottom edge:\n" +
    '• Drag the ends of the green line with your mouse, OR\n' +
    '• Use the ◀ ▶ keys to adjust the length.\n' +
    "When the line matches the edge, press the SPACE bar. 🔉 You'll hear a shutter click."
  const fallbackPage4 = fallbackPage3
  const keyPage3 = phrases?.RC_UseCreditCardBelowToCalibrateCameraPage3?.[RC.L]
  const keyPage4 =
    phrases?.RC_UseCreditCardBelowToCalibrateCameraRepeatPage4?.[RC.L]
  const text =
    (isRepeat ? keyPage4 : keyPage3) ||
    (isRepeat ? fallbackPage4 : fallbackPage3)
  return text || ''
}

export async function justCreditCard(RC, options, callback = undefined) {
  RC._addBackground()

  // Unit conversions and configurable offsets
  const pxPerCm = (RC?.screenPpi?.value ? RC.screenPpi.value : 96) / 2.54 // fallback to 96 DPI if missing
  const cameraToCardOffsetCm =
    options?.calibrateDistanceCameraToBlueLineCm ??
    options?._calibrateDistanceCameraToBlueLineCm ??
    4
  const blueLineOffsetPx = cameraToCardOffsetCm * pxPerCm
  // Video sits 0.5 cm below the blue line
  const videoTopOffsetPx = blueLineOffsetPx + 0.5 * pxPerCm

  // Initial position of green line as fraction of video height (0.0 = bottom, 1.0 = top)
  const initialCardTopVideoFraction =
    options?.calibrateDistanceGreenLineVideoFraction ??
    options?._calibrateDistanceGreenLineVideoFraction ??
    0.9

  const commonCalibrationData = {
    shortCm: CREDIT_CARD_SHORT_CM,
    longCm: CREDIT_CARD_LONG_CM,
    _calibrateDistance: options.calibrateDistance,
    _calibrateDistanceAllowedRangeCm: options.calibrateDistanceAllowedRangeCm,
    _calibrateDistanceAllowedRatio: options.calibrateDistanceAllowedRatio,
    _calibrateDistancePupil: options.calibrateDistancePupil,
    _calibrateDistanceShowRulerUnitsBool:
      options.calibrateDistanceShowRulerUnitsBool,
    _calibrateDistanceTimes: options.objectMeasurementCount,
    _showPerpendicularFeetBool: options.showNearestPointsBool,
    _calibrateScreenSizeAllowedRatio: options.calibrateScreenSizeAllowedRatio,
    _calibrateScreenSizeTimes: options.calibrateScreenSizeTimes,
    _viewingDistanceWhichEye: options.viewingDistanceWhichEye,
    _viewingDistanceWhichPoint: options.viewingDistanceWhichPoint,
    _calibrateDistanceCameraToBlueLineCm: cameraToCardOffsetCm,
    _calibrateDistanceGreenLineVideoFraction: initialCardTopVideoFraction,
  }

  // Measurement count/pages: 1 (default) or 2 for repeat
  const measurementCount = Math.max(
    1,
    Math.floor(options.objectMeasurementCount || 1),
  )
  // Counts every attempt, even retries; used for display (1/2, 3/3, 4/4, ...)
  let attemptCount = 0
  let currentPage = 3
  let measurements = [] // { shortVPx, fVpx }
  let stepInstructionModel = null
  let currentStepFlatIndex = 0
  let fullscreenGuardInterval = null
  let lastFullscreenAttempt = 0

  // Ensure video is visible and positioned
  RC.showVideo(true)
  const vCont = document.getElementById('webgazerVideoContainer')
  if (vCont) setDefaultVideoPosition(RC, vCont)

  // Container
  const container = document.createElement('div')
  container.style.position = 'fixed'
  container.style.left = '0'
  container.style.top = '0'
  container.style.width = '100vw'
  container.style.height = '100vh'
  container.style.userSelect = 'none'
  container.style.overflow = 'hidden'
  container.style.zIndex = '999999998'

  // Title
  const titleRow = document.createElement('div')
  titleRow.style.display = 'flex'
  titleRow.style.alignItems = 'baseline'
  titleRow.style.gap = '24px'
  titleRow.style.paddingInlineStart = '3rem'
  titleRow.style.margin = '2rem 0 0rem 0'
  titleRow.style.position = 'fixed'
  titleRow.style.top = '0'
  titleRow.style.left = '0'
  titleRow.style.width = '100%'
  // Keep the title visible even when fullscreen toggles reorder layers
  titleRow.style.zIndex = '1000000000001'
  titleRow.style.pointerEvents = 'none'
  container.appendChild(titleRow)

  const title = document.createElement('h1')
  title.style.whiteSpace = 'pre-line'
  title.style.textAlign = 'start'
  title.style.margin = '0'
  title.dir = RC.LD.toLowerCase()
  title.id = 'just-credit-card-title'
  titleRow.appendChild(title)

  // Stepper UI: anchored relative to the video, placed below it
  const instructionsPlacement = 'inside-top'
  let instructionsUI = null
  let leftInstructionsText = null
  let mediaContainer = null

  // Overlay and guide line - remove any existing overlay first to prevent duplicates
  const existingOverlay = document.getElementById('just-credit-card-overlay')
  if (existingOverlay && existingOverlay.parentNode) {
    existingOverlay.parentNode.removeChild(existingOverlay)
  }
  const overlay = createOverlayLayer()
  const guide = createDashedGuide()
  const cardOutline = createCardOutline()
  overlay.appendChild(guide)
  overlay.appendChild(cardOutline)
  document.body.appendChild(overlay)
  ensureFlickerStyle()

  // Blue reference line (short edge length) and labels
  const blueGuide = document.createElement('div')
  blueGuide.id = 'just-credit-card-blue-guide'
  blueGuide.style.position = 'absolute'
  blueGuide.style.height = '0px'
  blueGuide.style.borderTop = '3px dashed rgba(0, 120, 255, 0.95)'
  blueGuide.style.animation = 'jc-line-flicker 0.125s ease-in-out infinite'
  blueGuide.style.pointerEvents = 'none'
  blueGuide.style.zIndex = '1000000000'
  overlay.appendChild(blueGuide)

  const blueLabel = document.createElement('div')
  blueLabel.id = 'just-credit-card-blue-label'
  blueLabel.style.position = 'absolute'
  blueLabel.style.color = 'black'
  blueLabel.style.font =
    '600 14px system-ui, -apple-system, Segoe UI, Roboto, sans-serif'
  blueLabel.style.textShadow = '0 1px 2px rgba(0,0,0,0.25)'
  blueLabel.style.pointerEvents = 'none'
  blueLabel.style.transform = 'translate(-50%, -100%)'
  blueLabel.style.whiteSpace = 'nowrap'
  blueLabel.style.zIndex = '1000000001'
  blueLabel.dir = RC.LD.toLowerCase()
  blueLabel.textContent =
    phrases?.RC_PlaceCreditCardHere?.[RC.L] || 'Place credit card here'
  overlay.appendChild(blueLabel)

  const greenLabel = document.createElement('div')
  greenLabel.id = 'just-credit-card-green-label'
  greenLabel.style.position = 'absolute'
  greenLabel.style.color = 'black'
  greenLabel.style.font =
    '600 14px system-ui, -apple-system, Segoe UI, Roboto, sans-serif'
  greenLabel.style.textShadow = '0 1px 2px rgba(0,0,0,0.25)'
  greenLabel.style.pointerEvents = 'none'
  greenLabel.style.transform = 'translate(-50%, -120%)'
  greenLabel.style.whiteSpace = 'nowrap'
  greenLabel.style.zIndex = '1000000001'
  greenLabel.dir = RC.LD.toLowerCase()
  greenLabel.textContent =
    phrases?.RC_PlaceUpperCreditCardEdgeHere?.[RC.L] ||
    'Place upper credit card edge here'
  overlay.appendChild(greenLabel)
  const greenLabelOffsetPx = 21 // reduced gap (30% less than previous 30px)

  // Hide the resolution setting message now that we're ready to show the UI
  hideResolutionSettingMessage()

  // Add to RC background (below overlay but above page)
  RC._replaceBackground('')
  RC.background.appendChild(container)

  // Position video centered below the blue line; remember original style
  let originalVideoCssText = null
  let originalResizeHandler = null
  const positionVideoBelowCamera = () => {
    const v = document.getElementById('webgazerVideoContainer')
    if (!v) return
    if (originalVideoCssText == null) {
      originalVideoCssText = v.style.cssText || ''
    }
    // Remove the default resize handler that repositions video to top-center
    // This handler was added by setDefaultVideoPosition and would interfere with our custom positioning
    if (v._resizeHandler && !originalResizeHandler) {
      originalResizeHandler = v._resizeHandler
      window.removeEventListener('resize', v._resizeHandler)
      v._hasResizeListener = false
    }

    // Get camera aspect ratio to size the container proportionally
    const cam = getCameraResolution(RC)
    const camAspect = cam ? cam.width / cam.height : 16 / 9 // default to 16:9

    // Available space: width capped to 95% of viewport, start at videoTopOffsetPx
    const vw = window.innerWidth
    const vh = window.innerHeight
    const maxWidth = vw * 0.95
    const availWidth = maxWidth
    const availHeight = Math.max(0, vh - videoTopOffsetPx)

    // Calculate size that fits while maintaining aspect ratio
    let videoW, videoH
    if (availWidth / availHeight > camAspect) {
      // Height is the constraint
      videoH = availHeight
      videoW = videoH * camAspect
    } else {
      // Width is the constraint
      videoW = availWidth
      videoH = videoW / camAspect
    }

    // Top is fixed at the desired offset, horizontally centered
    const topOffset = Math.max(0, videoTopOffsetPx)

    v.style.position = 'fixed'
    v.style.left = `${(vw - videoW) / 2}px`
    v.style.top = `${topOffset}px`
    v.style.width = `${videoW}px`
    v.style.height = `${videoH}px`
    v.style.right = 'unset'
    v.style.bottom = 'unset'
    v.style.transform = 'none'
    v.style.zIndex = '999999999999' // below overlay but above page
    // Force reflow so getBoundingClientRect returns the new position
    void v.offsetWidth
    return v
  }
  positionVideoBelowCamera()

  // Position blue guide and labels
  const positionBlueGuideAndLabels = () => {
    const blueLengthPx = CREDIT_CARD_SHORT_CM * pxPerCm
    const xLeft = Math.round(window.innerWidth / 2 - blueLengthPx / 2)
    const yTop = Math.round(blueLineOffsetPx)
    blueGuide.style.width = `${Math.max(0, blueLengthPx)}px`
    blueGuide.style.left = `${xLeft}px`
    blueGuide.style.top = `${yTop}px`
    // Blue label centered above the blue line
    blueLabel.style.left = `${Math.round(window.innerWidth / 2)}px`
    blueLabel.style.top = `${yTop - 6}px`
  }
  positionBlueGuideAndLabels()

  // State for guide line and outline
  const state = {
    p1: { x: 0, y: 0 }, // {x, y} relative to document (pageX/Y style) for positioning absolute elements
    p2: { x: 0, y: 0 },
    dragging: null, // 'left' | 'right' | null
    lineLengthPx: null, // fallback store for initial width
    cardOutline, // store ref for convenience
    RCRef: RC,
    videoTopOffsetPx,
    cameraToCardOffsetCm: cameraToCardOffsetCm,
    quadBaseRatio: options.calibrateDistanceQuadBaseRatio,
  }
  cardState = state

  // Initialize drag handling
  let dragStart = null // { x, y }

  function handlePointerDown(e) {
    const v = document.getElementById('webgazerVideoContainer')
    if (!v) return

    // Stop auto-detection when user starts manual drag
    if (autoDetector && autoDetectEnabled) {
      autoDetector.stop()
      autoDetectEnabled = false
      if (autoDetectBtn) {
        autoDetectBtn.style.backgroundColor = 'rgba(0, 100, 200, 0.7)'
        autoDetectBtn.style.borderColor = 'rgba(255, 255, 255, 0.3)'
        autoDetectBtn.textContent = 'Auto Detect'
        autoDetectBtn.style.animation = 'none'
      }
    }

    const rect = v.getBoundingClientRect()
    const relX = e.clientX - rect.left

    // Check which half of the video
    if (relX < rect.width / 2) {
      state.dragging = 'left'
    } else {
      state.dragging = 'right'
    }

    dragStart = { x: e.clientX, y: e.clientY }
    e.preventDefault() // prevent selection
  }

  function handlePointerMove(e) {
    if (!state.dragging) return

    // Determine new coordinates
    // The guide is absolutely positioned in document body (via overlay), so we use e.pageX/Y
    // But we need to update the p1/p2 state

    const pageX = e.pageX
    const pageY = e.pageY

    if (state.dragging === 'left') {
      state.p1 = { x: pageX, y: pageY }
    } else if (state.dragging === 'right') {
      state.p2 = { x: pageX, y: pageY }
    }

    // Redraw immediately
    positionGuide(guide, state.p1, state.p2)
    positionCardOutline()
    positionCardOutline()

    // Update labels
    // Green label centered above the green guide
    const midX = (state.p1.x + state.p2.x) / 2
    const midY = (state.p1.y + state.p2.y) / 2
    // Approximate "above" by using min Y minus some offset
    const minY = Math.min(state.p1.y, state.p2.y)

    greenLabel.style.left = `${midX}px`
    greenLabel.style.top = `${minY - greenLabelOffsetPx}px`
  }

  function handlePointerUp(e) {
    state.dragging = null
  }

  // Add global move/up listeners
  document.addEventListener('pointermove', handlePointerMove)
  document.addEventListener('pointerup', handlePointerUp)

  // Make video container interactable
  const vContForClick = document.getElementById('webgazerVideoContainer')
  if (vContForClick) {
    vContForClick.style.cursor = 'crosshair'
    vContForClick.style.pointerEvents = 'auto'
    vContForClick.style.touchAction = 'none' // Prevent scrolling while dragging
    vContForClick.addEventListener('pointerdown', handlePointerDown)
  }

  // === EDGE DETECTION FILTER ===
  // Create SVG filter for edge detection (Laplacian kernel)
  const svgNS = 'http://www.w3.org/2000/svg'
  const svgFilter = document.createElementNS(svgNS, 'svg')
  svgFilter.setAttribute('width', '0')
  svgFilter.setAttribute('height', '0')
  svgFilter.style.position = 'absolute'
  svgFilter.innerHTML = `
    <defs>
      <filter id="edge-detect-filter" color-interpolation-filters="sRGB">
        <!-- Convert to grayscale first -->
        <feColorMatrix type="saturate" values="0" />
        <!-- Edge detection using Laplacian kernel -->
        <feConvolveMatrix 
          order="3" 
          kernelMatrix="
            -1 -1 -1
            -1  8 -1
            -1 -1 -1"
          preserveAlpha="true"
        />
        <!-- Boost the result -->
        <feComponentTransfer>
          <feFuncR type="linear" slope="2" intercept="0"/>
          <feFuncG type="linear" slope="2" intercept="0"/>
          <feFuncB type="linear" slope="2" intercept="0"/>
        </feComponentTransfer>
      </filter>
    </defs>
  `
  document.body.appendChild(svgFilter)

  // Create toggle button
  const edgeToggle = document.createElement('button')
  edgeToggle.id = 'edge-detect-toggle'
  edgeToggle.textContent = '🔲 Edges'
  edgeToggle.style.position = 'fixed'
  edgeToggle.style.zIndex = '10000000000000' // Very high to be above everything
  edgeToggle.style.padding = '6px 12px'
  edgeToggle.style.fontSize = '13px'
  edgeToggle.style.fontFamily = 'system-ui, sans-serif'
  edgeToggle.style.border = 'none'
  edgeToggle.style.borderRadius = '15px'
  edgeToggle.style.cursor = 'pointer'
  edgeToggle.style.backgroundColor = 'rgba(0, 0, 0, 0.5)'
  edgeToggle.style.color = 'white'
  edgeToggle.style.transition = 'background-color 0.2s'
  edgeToggle.style.pointerEvents = 'auto' // Ensure it's clickable

  // Position button on top of video
  const positionEdgeToggle = () => {
    const rect = getExpectedVideoRect(RC, videoTopOffsetPx)
    edgeToggle.style.top = `${rect.top + 10}px`
    edgeToggle.style.right = `${rect.right - 10}px`
  }
  positionEdgeToggle()
  // Append to body instead of overlay to avoid pointer-events issues
  // document.body.appendChild(edgeToggle)

  let edgeDetectEnabled = false

  function toggleEdgeDetect() {
    edgeDetectEnabled = !edgeDetectEnabled
    const vContainer = document.getElementById('webgazerVideoContainer')
    if (vContainer) {
      if (edgeDetectEnabled) {
        vContainer.style.filter = 'url(#edge-detect-filter)'
        edgeToggle.style.backgroundColor = 'rgba(76, 175, 80, 0.8)'
        edgeToggle.textContent = '✓ Edges'
      } else {
        vContainer.style.filter = ''
        edgeToggle.style.backgroundColor = 'rgba(0, 0, 0, 0.5)'
        edgeToggle.textContent = '🔲 Edges'
      }
    }
  }

  edgeToggle.addEventListener('click', e => {
    e.stopPropagation()
    toggleEdgeDetect()
  })

  // Also toggle with 'E' key
  const handleEdgeKey = e => {
    if (e.key === 'e' || e.key === 'E') {
      toggleEdgeDetect()
    }
  }
  document.addEventListener('keydown', handleEdgeKey)

  // === AUTO-DETECT BUTTON (only shown when useObjectTestData is 'autoCreditCard') ===
  const showAutoDetect = options.useObjectTestData === 'autoCreditCard'
  let autoDetectBtn = null

  if (showAutoDetect) {
    autoDetectBtn = document.createElement('button')
    autoDetectBtn.id = 'auto-detect-toggle'
    autoDetectBtn.textContent = 'Auto Detect'
    autoDetectBtn.style.position = 'fixed'
    autoDetectBtn.style.zIndex = '10000000000000'
    autoDetectBtn.style.padding = '8px 16px'
    autoDetectBtn.style.fontSize = '14px'
    autoDetectBtn.style.fontWeight = '600'
    autoDetectBtn.style.fontFamily = 'system-ui, sans-serif'
    autoDetectBtn.style.border = '2px solid rgba(255, 255, 255, 0.3)'
    autoDetectBtn.style.borderRadius = '20px'
    autoDetectBtn.style.cursor = 'pointer'
    autoDetectBtn.style.backgroundColor = 'rgba(0, 100, 200, 0.7)'
    autoDetectBtn.style.color = 'white'
    autoDetectBtn.style.transition = 'all 0.2s ease'
    autoDetectBtn.style.pointerEvents = 'auto'
    autoDetectBtn.style.boxShadow = '0 2px 8px rgba(0,0,0,0.3)'
  }

  // Position auto-detect button at bottom-center of video
  const positionAutoDetectBtn = () => {
    if (!autoDetectBtn) return
    const rect = getExpectedVideoRect(RC, videoTopOffsetPx)
    autoDetectBtn.style.left = `${rect.left + rect.width / 2}px`
    autoDetectBtn.style.transform = 'translateX(-50%)'
    autoDetectBtn.style.bottom = `${window.innerHeight - rect.top - rect.height + 15}px`
  }
  if (showAutoDetect) {
    positionAutoDetectBtn()
    document.body.appendChild(autoDetectBtn)
  }

  // Create the auto-detector instance
  let autoDetector = null
  let autoDetectEnabled = false

  // Reset auto-detector state (call on page transitions)
  function resetAutoDetector() {
    if (autoDetector) {
      autoDetector.stop()
    }
    autoDetectEnabled = false
    if (autoDetectBtn) {
      autoDetectBtn.style.backgroundColor = 'rgba(0, 100, 200, 0.7)'
      autoDetectBtn.style.borderColor = 'rgba(255, 255, 255, 0.3)'
      autoDetectBtn.textContent = 'Auto Detect'
      autoDetectBtn.style.animation = 'none'
    }
  }

  // Function to update the guide and outline when auto-detection updates
  const onAutoDetectUpdate = () => {
    positionGuide(guide, state.p1, state.p2)
    positionCardOutline()
    // Update green label
    const midX = (state.p1.x + state.p2.x) / 2
    const minY = Math.min(state.p1.y, state.p2.y)
    greenLabel.style.left = `${midX}px`
    greenLabel.style.top = `${minY - greenLabelOffsetPx}px`
  }

  // Initialize auto-detector after state is ready
  const initAutoDetector = () => {
    if (autoDetector) return
    autoDetector = new CardEdgeAutoDetector(
      state,
      guide,
      getExpectedVideoRect,
      videoTopOffsetPx,
      RC,
    )
    autoDetector.onUpdate = onAutoDetectUpdate

    // Handle confidence updates during live detection
    autoDetector.onConfidenceChange = confidence => {
      if (!autoDetectEnabled || !autoDetectBtn) return
      switch (confidence) {
        case 'searching':
          autoDetectBtn.style.backgroundColor = 'rgba(33, 150, 243, 0.9)'
          autoDetectBtn.textContent = '🔍 Searching...'
          autoDetectBtn.style.animation =
            'jc-line-flicker 1s ease-in-out infinite'
          break
        case 'high':
          autoDetectBtn.style.backgroundColor = 'rgba(76, 175, 80, 0.9)'
          autoDetectBtn.textContent = '✓ Tracking (High)'
          autoDetectBtn.style.animation = 'none'
          break
        case 'medium':
          autoDetectBtn.style.backgroundColor = 'rgba(255, 193, 7, 0.9)'
          autoDetectBtn.textContent = '⚡ Tracking (Medium)'
          autoDetectBtn.style.animation = 'none'
          break
        case 'low':
          autoDetectBtn.style.backgroundColor = 'rgba(255, 152, 0, 0.9)'
          autoDetectBtn.textContent = '⚠ Tracking (Low)'
          autoDetectBtn.style.animation = 'none'
          break
      }
    }
  }

  // Toggle live auto-detection on/off
  function toggleAutoDetect() {
    if (!showAutoDetect) return
    initAutoDetector()

    autoDetectEnabled = autoDetector.toggle()

    if (autoDetectBtn) {
      if (autoDetectEnabled) {
        autoDetectBtn.style.backgroundColor = 'rgba(33, 150, 243, 0.9)'
        autoDetectBtn.style.borderColor = 'rgba(255, 255, 255, 0.5)'
        autoDetectBtn.textContent = '🔍 Searching...'
        autoDetectBtn.style.animation =
          'jc-line-flicker 1s ease-in-out infinite'
      } else {
        autoDetectBtn.style.backgroundColor = 'rgba(0, 100, 200, 0.7)'
        autoDetectBtn.style.borderColor = 'rgba(255, 255, 255, 0.3)'
        autoDetectBtn.textContent = 'Auto Detect'
        autoDetectBtn.style.animation = 'none'
      }
    }
  }

  if (autoDetectBtn) {
    autoDetectBtn.addEventListener('click', e => {
      e.stopPropagation()
      toggleAutoDetect()
    })
  }

  // Also toggle with 'A' key (only if auto-detect is enabled)
  const handleAutoDetectKey = e => {
    if (showAutoDetect && (e.key === 'a' || e.key === 'A')) {
      toggleAutoDetect()
    }
  }
  document.addEventListener('keydown', handleAutoDetectKey)

  // Position the guide immediately using expected rect (right half of viewport)
  // This ensures the guide is in the correct position before it becomes visible
  const expectedRectInitial = getExpectedVideoRect(RC, videoTopOffsetPx)
  state.lineLengthPx = expectedRectInitial.width * 0.6

  // Initialize p1 and p2 based on length and rect
  // Use initialCardTopVideoFraction for the initial green line position (0.0 = bottom, 1.0 = top)
  const y =
    expectedRectInitial.top +
    expectedRectInitial.height * (1 - initialCardTopVideoFraction)
  const x =
    expectedRectInitial.left +
    (expectedRectInitial.width - state.lineLengthPx) / 2
  state.p1 = { x: x, y: y }
  state.p2 = { x: x + state.lineLengthPx, y: y }

  positionGuide(guide, state.p1, state.p2)
  positionCardOutline()
  // Green label centered above the green guide
  greenLabel.style.left = `${Math.round(expectedRectInitial.left + expectedRectInitial.width / 2)}px`
  greenLabel.style.top = `${Math.round(y - 30)}px`
  // Ensure everything becomes visible and the Stepper is created immediately
  // (schedule handles guide opacity and lazy Stepper instantiation)
  requestAnimationFrame(() => {
    scheduleGuideReposition()
  })

  // Stepper will be created after video is positioned (in scheduleGuideReposition)

  // Re-position the guide after layout settles
  function scheduleGuideReposition() {
    positionVideoBelowCamera()
    positionBlueGuideAndLabels()
    // Use expected rect based on known positioning (centered below blue line)
    // This avoids issues with getBoundingClientRect returning stale values
    const expectedRect = getExpectedVideoRect(RC, videoTopOffsetPx)
    if (state.lineLengthPx == null) {
      state.lineLengthPx = expectedRect.width * 0.6
    }

    // If p1/p2 aren't set yet or are default, update them to match potentially new rect
    // Only if NOT dragging
    if (!state.dragging) {
      // Calculate center of current line
      const currentMidX = (state.p1.x + state.p2.x) / 2
      const currentY = state.p1.y // assume roughly horizontal or use mid

      // If this is first run or re-layout, we might want to re-center
      // But if user moved it, we should respect that?
      // The user prompt implies we should keep user adjustments.
      // However, initially (before user interaction), it should center.
      // Let's just ensure it's visible.
      // For now, re-center ONLY if it seems untouched (y is still initial 10%?)
      // Actually, let's just trust state.p1/p2 if they exist, but ensure they are initialized.
    }

    positionGuide(guide, state.p1, state.p2)
    positionCardOutline()
    guide.style.opacity = '1'

    // Update green label
    const midX = (state.p1.x + state.p2.x) / 2
    const midY = (state.p1.y + state.p2.y) / 2
    const minY = Math.min(state.p1.y, state.p2.y)
    greenLabel.style.left = `${midX}px`
    greenLabel.style.top = `${minY - greenLabelOffsetPx}px`

    // Lazily create the anchored stepper only after video size/position is final
    if (!instructionsUI) {
      const videoRefForStepper = document.getElementById(
        'webgazerVideoContainer',
      )
      if (videoRefForStepper) {
        instructionsUI = createAnchoredStepperUI(videoRefForStepper, {
          placement: instructionsPlacement,
          offsetPx: 8,
          positionMode: 'absolute',
          disableInternalPositioning: true, // We handle positioning via repositionInstructionsUI with calculated expectedRect
          layout: 'leftOnly',
          leftWidth: '100%',
          leftPaddingStart: '0.75rem',
          leftPaddingEnd: '0.75rem',
          fontSize: 'clamp(1.05em, 2.2vw, 1.35em)',
          lineHeight: '1.4',
        })
        leftInstructionsText = instructionsUI.leftText
        mediaContainer = instructionsUI.mediaContainer
        repositionInstructionsUI(instructionsUI, expectedRect)
        renderPage()
      } else {
        // Fallback inside container if video element missing
        instructionsUI = createStepInstructionsUI(container, {
          leftWidth: '100%',
          rightWidth: '0%',
          leftPaddingStart: '3rem',
          leftPaddingEnd: '3rem',
          fontSize: 'clamp(1.05em, 2.2vw, 1.35em)',
          lineHeight: '1.4',
          layout: 'leftOnly',
        })
        leftInstructionsText = instructionsUI.leftText
        mediaContainer = instructionsUI.mediaContainer
        repositionInstructionsUI(instructionsUI, expectedRect)
        renderPage()
      }
    }
    repositionInstructionsUI(instructionsUI, expectedRect)
    // Double RAF to ensure we apply the position AFTER the internal anchored stepper's
    // initialization/listeners have fired (which might be using stale DOM rects).
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const rect3 = getExpectedVideoRect(RC, videoTopOffsetPx)
        repositionInstructionsUI(instructionsUI, rect3)
      })
    })
  }

  function repositionInstructionsUI(instructionsUI, expectedRect) {
    // Force anchored stepper width/position to match expectedRect immediately
    if (instructionsUI && instructionsUI.anchoredContainer) {
      const ac = instructionsUI.anchoredContainer
      const pageX =
        window.pageXOffset || document.documentElement.scrollLeft || 0
      const pageY =
        window.pageYOffset || document.documentElement.scrollTop || 0
      const offsetPx = 8
      ac.style.width = `${Math.round(expectedRect.width)}px`
      ac.style.left = `${Math.round(expectedRect.left + pageX)}px`

      // Align instructions inside the video; position depends on requested placement
      const height = ac.offsetHeight || 0 // force reflow for accurate height
      const top =
        instructionsPlacement === 'inside-top'
          ? expectedRect.top + offsetPx
          : expectedRect.top + expectedRect.height - height - offsetPx

      ac.style.top = `${Math.round(top + pageY)}px`
      ac.style.visibility = 'visible'
    }
    // Do NOT call instructionsUI.reposition() here. The internal logic relies on getBoundingClientRect
    // which might be stale or incorrect during initialization. We trust expectedRect.
  }

  function ensureFullscreenGuard() {
    const shouldGuard = currentPage === 3 || currentPage === 4
    if (shouldGuard) {
      if (fullscreenGuardInterval) return
      fullscreenGuardInterval = setInterval(async () => {
        if (!(currentPage === 3 || currentPage === 4)) return
        if (isFullscreen()) return
        const now = Date.now()
        if (now - lastFullscreenAttempt < 2000) return
        lastFullscreenAttempt = now
        try {
          await getFullscreen(RC.language?.value || RC.L, RC)
        } catch {}
      }, 1500)
    } else if (fullscreenGuardInterval) {
      clearInterval(fullscreenGuardInterval)
      fullscreenGuardInterval = null
    }
  }

  function updateTitle() {
    // Show the attempt number; denominator grows with retries (e.g., 3/3, 4/4)
    const idx = Math.max(1, attemptCount + 1)
    const total = Math.max(idx, measurementCount)
    const t = phrases.RC_distanceTrackingN?.[RC.L]
      ?.replace('[[N1]]', String(idx))
      ?.replace('[[N2]]', String(total))
    title.innerText = t || `Measurement ${idx} of ${total}`
  }

  // Helper to clamp and render the stepper at the current index
  function renderStepperAtCurrentIndex() {
    if (!leftInstructionsText || !mediaContainer || !stepInstructionModel)
      return
    const maxIdx = Math.max(
      0,
      (stepInstructionModel.flatSteps?.length || 1) - 1,
    )
    currentStepFlatIndex = Math.min(Math.max(0, currentStepFlatIndex), maxIdx)

    const renderOnce = () =>
      renderStepInstructions({
        model: stepInstructionModel,
        flatIndex: currentStepFlatIndex,
        elements: {
          leftText: leftInstructionsText,
          rightText: null,
          mediaContainer: mediaContainer,
        },
        options: {
          showAllSteps: false,
          thresholdFraction: 0.6,
          useCurrentSectionOnly: true,
          stepperHistory: options.stepperHistory,
          layout: 'leftOnly', // 1-column Stepper on the left
          showLargeHeading: false, // Removed "Instructions" heading - stepper is at top of video
          onPrev: () => {
            if (currentStepFlatIndex > 0) {
              currentStepFlatIndex--
              renderStepperAtCurrentIndex()
            }
          },
          onNext: () => {
            if (currentStepFlatIndex < maxIdx) {
              currentStepFlatIndex++
              renderStepperAtCurrentIndex()
            }
          },
        },
        lang: RC.language?.value || RC.L,
        langDirection: RC.LD,
        phrases,
      })

    renderOnce()
  }

  function renderPage() {
    // If UI not initialized yet, skip; will be called again after creation
    if (!leftInstructionsText || !mediaContainer) return

    // Reset auto-detector on every page render (fresh start for each attempt)
    resetAutoDetector()

    ensureFullscreenGuard()
    updateTitle()
    const isRepeat = currentPage === 4
    const showAllSteps = false

    // Parse and render step instructions (Stepper in left column only)
    try {
      const text = getInstructions(RC, isRepeat)
      stepInstructionModel = parseInstructions(text)
      currentStepFlatIndex = 0
      renderStepperAtCurrentIndex()
    } catch (e) {
      leftInstructionsText.textContent = getInstructions(RC, isRepeat).replace(
        /<br\s*\/?>/gi,
        '\n',
      )
    }

    // Initial line length = 60% of video width (use expected rect for consistent positioning)
    const expectedRect = getExpectedVideoRect(RC, videoTopOffsetPx)
    if (state.lineLengthPx == null) {
      state.lineLengthPx = expectedRect.width * 0.6
      // Initialize p1/p2 if not set (e.g. page reload logic, though this is inside renderPage)
      // Use initialCardTopVideoFraction for the initial green line position (0.0 = bottom, 1.0 = top)
      const y =
        expectedRect.top +
        expectedRect.height * (1 - initialCardTopVideoFraction)
      const x =
        expectedRect.left + (expectedRect.width - state.lineLengthPx) / 2
      state.p1 = { x: x, y: y }
      state.p2 = { x: x + state.lineLengthPx, y: y }
    }
    scheduleGuideReposition()
  }

  function resizeHandler() {
    scheduleGuideReposition()
    positionEdgeToggle()
    positionAutoDetectBtn()
    positionCardOutline()
  }

  window.addEventListener('resize', resizeHandler)

  // Up/Down to navigate Stepper
  const handleInstructionNav = e => {
    if (![3, 4].includes(currentPage) || !stepInstructionModel) return
    if (e.key === 'ArrowDown') {
      const maxIdx = Math.max(
        0,
        (stepInstructionModel.flatSteps?.length || 1) - 1,
      )
      if (currentStepFlatIndex < maxIdx) {
        currentStepFlatIndex++
        renderStepperAtCurrentIndex()
      }
      e.preventDefault()
      e.stopPropagation()
    } else if (e.key === 'ArrowUp') {
      if (currentStepFlatIndex > 0) {
        currentStepFlatIndex--
        renderStepperAtCurrentIndex()
      }
      e.preventDefault()
      e.stopPropagation()
    }
  }
  document.addEventListener('keydown', handleInstructionNav)

  function getShortVPx() {
    const v = getVideoContainerRect()
    const cam = getCameraResolution(RC)
    if (!v || !cam) return null

    // Calculate length in screen pixels from p1/p2
    const dx = state.p2.x - state.p1.x
    const dy = state.p2.y - state.p1.y
    const lengthPx = Math.sqrt(dx * dx + dy * dy)

    // Otherwise use the green line length
    const scaleX = cam.width / v.rect.width
    // Note: This assumes isotropic scaling or that line angle doesn't matter for scale.
    // Usually scaleX and scaleY are similar.
    return lengthPx * scaleX
  }

  async function onSpace() {
    const shortVPx = getShortVPx()
    if (!shortVPx || isNaN(shortVPx)) {
      await Swal.fire({
        ...swalInfoOptions(RC, { showIcon: false }),
        html: phrases.T_error?.[RC.L] || 'Error: Camera/video not ready.',
        confirmButtonText: phrases.T_ok?.[RC.L] || 'OK',
      })
      return
    }

    // Play camera shutter sound to confirm measurement
    if (cameraShutterSound) {
      cameraShutterSound()
    }

    const cam = getCameraResolution(RC)
    if (!cam) {
      await Swal.fire({
        ...swalInfoOptions(RC, { showIcon: false }),
        html:
          phrases.T_error?.[RC.L] || 'Error: Camera resolution not available.',
        confirmButtonText: phrases.T_ok?.[RC.L] || 'OK',
      })
      return
    }

    // Get camera resolution (horizontalVpx and verticalVpx)
    const horizontalVpx = cam.width
    const verticalVpx = cam.height
    // Expose camera width in COMMON for downstream consumers
    commonCalibrationData.horizontalVpx = horizontalVpx

    // Calculate cardTopVideoFraction: the height of the green line center as a fraction of video height
    // state.p1 and state.p2 are in page coordinates, need to convert to video fraction
    // Coordinate system: 0.0 = bottom, 1.0 = top
    const expectedRect = getExpectedVideoRect(RC, videoTopOffsetPx)
    const greenLineMidY = (state.p1.y + state.p2.y) / 2
    const cardTopVideoFraction =
      1 - (greenLineMidY - expectedRect.top) / expectedRect.height

    // NEW CORRECT FORMULAS FOR FOCAL LENGTH COMPUTATION
    // See equations (1)-(5) in the documentation
    //
    // (1) edgeToCameraDeltaYCm = (cardTopVideoFraction - 0.5) * verticalVpx * (shortCm / shortVpx)
    const edgeToCameraDeltaYCm =
      (cardTopVideoFraction - 0.5) *
      verticalVpx *
      (CREDIT_CARD_SHORT_CM / shortVPx)

    // (2) edgeToScreenCm = sqrt(longCm^2 - (edgeToCameraDeltaYCm + cameraToBlueLineCm)^2)
    // cameraToBlueLineCm = cameraToCardOffsetCm (the _calibrateDistanceCameraToCardCm parameter)
    const edgeToScreenCm = Math.sqrt(
      Math.max(
        0,
        CREDIT_CARD_LONG_CM ** 2 -
          (edgeToCameraDeltaYCm + cameraToCardOffsetCm) ** 2,
      ),
    )

    // (3) fVpx = (shortVpx / shortCm) * edgeToScreenCm
    const fVpx = (shortVPx / CREDIT_CARD_SHORT_CM) * edgeToScreenCm

    // (4) fRatio = fVpx / horizontalVpx
    const fRatio = fVpx / horizontalVpx

    RC.fRatio = fRatio
    RC.getHorizontalVpx = () => {
      const cam = getCameraResolution(RC)
      return cam?.width || 0
    }

    // (5) factorVpxCm = fRatio * horizontalVpx * ipdCm
    // Note: fRatio is stable across resolution changes; factorVpxCm should be recomputed each time
    const factorVpxCm = fRatio * horizontalVpx * ASSUMED_IPD_CM

    const mode = 'lineAdjust' // merged mode
    attemptCount++
    measurements.push({
      shortVPx,
      fVpx,
      factorVpxCm,
      fRatio,
      cardTopVideoFraction,
      edgeToScreenCm,
      mode,
      cameraToCardOffsetCm: cameraToCardOffsetCm,
      verticalVpx: verticalVpx,
      cameraToBlueLineCm: cameraToCardOffsetCm,
    })

    saveCalibrationAttempt(
      RC,
      'justCreditCard',
      {
        shortVPx,
        fVpx,
        factorVpxCm,
        fRatio,
        cardTopVideoFraction,
        edgeToScreenCm,
        mode,
        cameraToCardOffsetCm: cameraToCardOffsetCm,
        verticalVpx: verticalVpx,
        cameraToBlueLineCm: cameraToCardOffsetCm,
      },
      commonCalibrationData,
    )

    const allowedRatio = options.calibrateDistanceAllowedRatio || 1.1
    const maxAllowedRatio = Math.max(allowedRatio, 1 / allowedRatio)

    // Validate consistency only when multiple measurements are requested
    if (measurementCount > 1 && measurements.length >= 2) {
      const lastIdx = measurements.length - 1
      const secondLastIdx = measurements.length - 2
      const M1 = measurements[secondLastIdx].shortVPx
      const M2 = measurements[lastIdx].shortVPx
      const ratio = Math.max(M2 / M1, M1 / M2)

      // Check if ratio is outside the allowed range
      if (ratio > maxAllowedRatio) {
        console.log(
          `Green line consistency check failed. Ratio: ${toFixedNumber(ratio, 2)}. Showing popup.`,
        )
        console.log(`M1=${M1}, M2=${M2}, ratio=${ratio}`)

        const errorMessage =
          phrases.RC_creditCardSizeMismatch?.[RC.L]?.replace(
            '[[N1]]',
            toFixedNumber(ratio, 2).toString(),
          ) ||
          phrases.RC_objectSizeMismatch?.[RC.L]?.replace(
            '[[N1]]',
            toFixedNumber(ratio, 2).toString(),
          ) ||
          `Green line measurements are inconsistent. Ratio: ${toFixedNumber(ratio, 2)}. Please try again.`

        // Prevent spacebar from closing the popup
        const preventSpacebar = e => {
          if (e.key === ' ' || e.code === 'Space') {
            e.preventDefault()
            e.stopPropagation()
          }
        }

        // Temporarily lower z-index of overlay, video, stepper, and other high-z elements so Swal popup is visible
        const overlayEl = document.getElementById('just-credit-card-overlay')
        const videoEl = document.getElementById('webgazerVideoContainer')
        const edgeToggleEl = document.getElementById('edge-detect-toggle')
        const stepperEl = instructionsUI?.anchoredContainer || null
        const savedOverlayZIndex = overlayEl ? overlayEl.style.zIndex : null
        const savedVideoZIndex = videoEl ? videoEl.style.zIndex : null
        const savedEdgeToggleZIndex = edgeToggleEl
          ? edgeToggleEl.style.zIndex
          : null
        const savedStepperZIndex = stepperEl ? stepperEl.style.zIndex : null
        const savedStepperVisibility = stepperEl
          ? stepperEl.style.visibility
          : null
        if (overlayEl) overlayEl.style.zIndex = '1'
        if (videoEl) videoEl.style.zIndex = '1'
        if (edgeToggleEl) edgeToggleEl.style.zIndex = '1'
        if (stepperEl) stepperEl.style.visibility = 'hidden'

        await Swal.fire({
          ...swalInfoOptions(RC, { showIcon: false }),
          icon: undefined,
          html: errorMessage,
          allowEnterKey: true,
          confirmButtonText:
            phrases.T_ok?.[RC.L] || phrases.RC_OK?.[RC.L] || 'OK',
          didOpen: () => {
            document.addEventListener('keydown', preventSpacebar, true)
          },
          willClose: () => {
            document.removeEventListener('keydown', preventSpacebar, true)
            // Restore z-index and visibility values
            if (overlayEl && savedOverlayZIndex !== null) {
              overlayEl.style.zIndex = savedOverlayZIndex
            }
            if (videoEl && savedVideoZIndex !== null) {
              videoEl.style.zIndex = savedVideoZIndex
            }
            if (edgeToggleEl && savedEdgeToggleZIndex !== null) {
              edgeToggleEl.style.zIndex = savedEdgeToggleZIndex
            }
            if (stepperEl && savedStepperVisibility !== null) {
              stepperEl.style.visibility = savedStepperVisibility
            }
          },
        })

        // Keep previous attempts but reset guide for a fresh retry on page 4
        state.lineLengthPx = null
        state.p1 = { x: 0, y: 0 }
        state.p2 = { x: 0, y: 0 }
        currentPage = 4
        renderPage()
        return
      }
    }

    // If we gathered more than needed (due to retries), keep only the most recent set
    if (measurementCount > 1 && measurements.length > measurementCount) {
      measurements = measurements.slice(-measurementCount)
    }

    if (measurements.length < measurementCount) {
      // Reset guide to initial length/position for the repeat pass (page 4)
      state.lineLengthPx = null
      state.p1 = { x: 0, y: 0 }
      state.p2 = { x: 0, y: 0 }
      currentPage = 4
      renderPage()
      return
    }

    const data = finish()
    if (options.showIrisesBool) {
      await startIrisDrawingWithMesh(RC)
    }
    if (options.calibrateDistanceCheckBool) {
      await RC._checkDistance(
        callback,
        data,
        'trackDistance',
        options.checkCallback,
        options.calibrateDistanceCheckCm,
        options.callbackStatic,
        options.calibrateDistanceCheckSecs,
        options.calibrateDistanceCheckLengthCm,
        options.calibrateDistanceCenterYourEyesBool,
        options.calibrateDistancePupil,
        options.calibrateDistanceChecking,
        options.calibrateDistanceSpotXYDeg,
        options.calibrateDistance,
        options.stepperHistory,
      )
    } else {
      if (typeof callback === 'function') {
        callback(data)
      }
    }
    RC._removeBackground()
  }

  function onArrow(delta) {
    const expectedRect = getExpectedVideoRect(RC, videoTopOffsetPx)
    const step = Math.max(2, Math.round(expectedRect.width * 0.01))

    // Calculate current center and length
    const midX = (state.p1.x + state.p2.x) / 2
    const midY = (state.p1.y + state.p2.y) / 2
    const dx = state.p2.x - state.p1.x
    const dy = state.p2.y - state.p1.y
    const currentLen = Math.sqrt(dx * dx + dy * dy)

    // New length (no max limit)
    const newLen = Math.max(10, currentLen + delta * step)

    // Preserve center and angle.
    // Unit vector from p1 to p2
    const ux = dx / currentLen
    const uy = dy / currentLen

    // New endpoints
    state.p1.x = midX - (ux * newLen) / 2
    state.p1.y = midY - (uy * newLen) / 2
    state.p2.x = midX + (ux * newLen) / 2
    state.p2.y = midY + (uy * newLen) / 2

    state.lineLengthPx = newLen

    scheduleGuideReposition()
    positionCardOutline()
  }

  function keyHandler(e) {
    if (e.key === 'ArrowLeft') {
      e.preventDefault()
      onArrow(-1)
    } else if (e.key === 'ArrowRight') {
      e.preventDefault()
      onArrow(+1)
    } else if (e.key === ' ') {
      e.preventDefault()
      onSpace()
    } else if (e.key === 'Escape') {
      // Reset to initial horizontal position if needed?
      // Or just do nothing as click points are gone.
      e.preventDefault()
    }
  }

  function cleanup() {
    document.removeEventListener('pointermove', handlePointerMove)
    document.removeEventListener('pointerup', handlePointerUp)

    document.removeEventListener('keydown', keyHandler)
    window.removeEventListener('resize', resizeHandler)
    document.removeEventListener('keydown', handleInstructionNav)
    document.removeEventListener('keydown', handleEdgeKey)
    document.removeEventListener('keydown', handleAutoDetectKey)

    // Stop auto-detector
    if (autoDetector) {
      autoDetector.stop()
      autoDetector = null
    }

    if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay)
    if (container && container.parentNode)
      container.parentNode.removeChild(container)
    if (svgFilter && svgFilter.parentNode)
      svgFilter.parentNode.removeChild(svgFilter)
    if (edgeToggle && edgeToggle.parentNode)
      edgeToggle.parentNode.removeChild(edgeToggle)
    if (autoDetectBtn && autoDetectBtn.parentNode)
      autoDetectBtn.parentNode.removeChild(autoDetectBtn)
    if (fullscreenGuardInterval) {
      clearInterval(fullscreenGuardInterval)
      fullscreenGuardInterval = null
    }
    // Remove blue/green labels if still attached (overlay removal usually covers them)
    const blueLbl = document.getElementById('just-credit-card-blue-label')
    if (blueLbl && blueLbl.parentNode) blueLbl.parentNode.removeChild(blueLbl)
    const greenLbl = document.getElementById('just-credit-card-green-label')
    if (greenLbl && greenLbl.parentNode)
      greenLbl.parentNode.removeChild(greenLbl)
    // Destroy anchored stepper if present
    if (instructionsUI && typeof instructionsUI.destroy === 'function') {
      try {
        instructionsUI.destroy()
      } catch {}
    }
    // Reset video filter
    const vContainerCleanup = document.getElementById('webgazerVideoContainer')
    if (vContainerCleanup) {
      vContainerCleanup.style.filter = ''
      vContainerCleanup.removeEventListener('pointerdown', handlePointerDown)
      vContainerCleanup.style.touchAction = ''
    }

    // Restore camera preview size and position
    const v = document.getElementById('webgazerVideoContainer')
    if (v) {
      // Remove click handler and restore cursor
      v.style.cursor = ''
      if (originalVideoCssText != null) {
        v.style.cssText = originalVideoCssText
      } else {
        setDefaultVideoPosition(RC, v)
      }
      // Restore the original resize handler if we removed it
      if (originalResizeHandler) {
        window.addEventListener('resize', originalResizeHandler)
        v._resizeHandler = originalResizeHandler
        v._hasResizeListener = true
      }
    }
  }

  function finish() {
    const cam = getCameraResolution(RC)
    const width = cam?.width || 0
    const height = cam?.height || 0

    // Average fRatio (more stable than fVpx across resolution changes)
    const avgFRatio =
      measurements.reduce((s, m) => s + (m.fRatio || 0), 0) /
      (measurements.length || 1)

    // Compute fVpx from fRatio for current resolution
    const avgFVpx = avgFRatio * width

    // Compute factorVpxCm fresh from fRatio, horizontalVpx, and ipdCm
    // This should be recomputed on each page that uses it, using current resolution and ipdCm
    const factorVpxCm = avgFRatio * width * ASSUMED_IPD_CM

    const data = {
      method: 'justCreditCard',
      measurementMode: 'lineAdjust',
      timestamp: performance.now(),
      shortCm: CREDIT_CARD_SHORT_CM,
      longCm: CREDIT_CARD_LONG_CM,
      measurements: measurements.map((m, i) => ({
        page: i === 0 ? 3 : 4,
        shortVPx: Math.round(m.shortVPx),
        fVpx: Math.round(m.fVpx),
        fRatio: m.fRatio != null ? Number(m.fRatio.toFixed(6)) : null,
        cardTopVideoFraction:
          m.cardTopVideoFraction != null
            ? Number(m.cardTopVideoFraction.toFixed(4))
            : null,
        mode: 'lineAdjust',
      })),
      fVpx: Math.round(avgFVpx),
      // fRatio is stable across resolution changes; save and report this
      fRatio: avgFRatio != null ? Number(avgFRatio.toFixed(6)) : null,
      // Keep fOverHorizontal for backward compatibility (same as fRatio)
      fOverHorizontal: avgFRatio != null ? Number(avgFRatio.toFixed(6)) : null,
      cameraResolutionXY: width && height ? `${width}x${height}` : '',
      // For downstream compatibility: provide a calibrationFactor = fVpx * ipdCm
      // Note: factorVpxCm should be recomputed each time using: fRatio * horizontalVpx * ipdCm
      calibrationFactor: Math.round(factorVpxCm),
      value: CREDIT_CARD_LONG_CM, // use the long edge as the reference "distance" value
    }

    // Persist in RC for later CSV/log export
    RC.justCreditCardCalibration = data
    RC.fRatio = data.fRatio
    RC.fOverHorizontal = data.fOverHorizontal // backward compatibility
    RC.fVpx = data.fVpx

    // Provide a uniform place similar to other flows so downstream uses can pick it up easily
    RC.newKnownDistanceTestData = data
    RC.newViewingDistanceData = data

    cleanup()
    return data
  }

  // Initial render and listeners
  renderPage()
  document.addEventListener('keydown', keyHandler)
}

let calibrationNumber = 1
const saveCalibrationAttempt = (
  RC,
  method = 'justCreditCard',
  measurement,
  commonCalibrationData = undefined,
) => {
  const _updateCalibrationAttemptsTransposed = (
    RC,
    calibrationObject,
    COMMON,
  ) => {
    if (!RC.calibrationAttemptsT) RC.calibrationAttemptsT = {}
    for (const [key, value] of Object.entries(calibrationObject)) {
      const v = value === undefined ? null : value
      if (!RC.calibrationAttemptsT[key]) RC.calibrationAttemptsT[key] = []
      RC.calibrationAttemptsT[key].push(v)
    }
    if (COMMON) {
      RC.calibrationAttemptsT.COMMON = COMMON
    }
  }

  if (!RC.calibrationAttempts)
    RC.calibrationAttempts = {
      future: 'To be deleted by end of November 2025.',
    }

  while (RC.calibrationAttempts[`calibration${calibrationNumber}`]) {
    calibrationNumber++
  }

  // Helper function to safely round centimeter values (2 decimal places, preserves trailing zeros)
  const safeRoundCm = value => {
    if (value == null || isNaN(value)) return null
    return parseFloat(value).toFixed(2)
  }

  // Helper function to safely round ratio values (4 decimal places)
  const safeRoundRatio = value => {
    if (value == null || isNaN(value)) return null
    return Math.round(value * 10000) / 10000
  }

  const safeRoundXYPx = xyArray => {
    if (!xyArray || !Array.isArray(xyArray) || xyArray.length < 2) return null
    const x = safeRoundPx(xyArray[0])
    const y = safeRoundPx(xyArray[1])
    if (x === null || y === null) return null
    return [x, y]
  }

  const safeToFixed = value => {
    if (value == null || isNaN(value)) return null
    return parseFloat(value).toFixed(1)
  }
  const safeRoundPx = (value, decimalPlaces = 0) => {
    if (value == null || isNaN(value)) return null
    // return parseFloat(value.toFixed(decimalPlaces))
    return Math.round(value * 10 ** decimalPlaces) / 10 ** decimalPlaces
  }

  const pxPerCmValue = RC.screenPpi.value / 2.54
  const cameraXYPxValue = [window.innerWidth / 2, 0] // Top center of screen
  const centerXYPxValue = [window.innerWidth / 2, window.innerHeight / 2] // Screen center

  // Store single shared values in COMMON (not per-attempt) to avoid array growth
  commonCalibrationData.pxPerCm = safeRoundCm(pxPerCmValue)
  commonCalibrationData.cameraXYPx = safeRoundXYPx(cameraXYPxValue)
  commonCalibrationData.centerXYPx = safeRoundXYPx(centerXYPxValue)
  commonCalibrationData.greenLineVideoFraction =
    measurement.cardTopVideoFraction != null
      ? Number(measurement.cardTopVideoFraction.toFixed(4))
      : null
  commonCalibrationData.cameraToBlueLineCm = safeRoundCm(
    measurement.cameraToBlueLineCm || 0,
  )
  commonCalibrationData.edgeToScreenCm = safeRoundCm(
    measurement.edgeToScreenCm || 0,
  )
  commonCalibrationData.verticalVpx = safeRoundPx(measurement.verticalVpx || 0)

  // Use camera width for fOverWidth to be consistent with camera-space measurements
  const cameraWidth = commonCalibrationData?.horizontalVpx || 0
  const calibrationObject = {
    method,
    mode: 'lineAdjust', // merged mode
    // fRatio is stable across resolution changes; this is the primary calibration value
    fRatio:
      measurement.fRatio != null ? Number(measurement.fRatio.toFixed(2)) : null,
    fOverHorizontal:
      measurement.fRatio != null ? Number(measurement.fRatio.toFixed(2)) : null, // backward compatibility
    fOverWidth: safeRoundRatio(
      cameraWidth ? (measurement.fVpx || 0) / cameraWidth : null,
    ),
    factorVpxCm: safeRoundPx(measurement.factorVpxCm || 0),
    ipdCm: safeRoundCm(ASSUMED_IPD_CM),
    shortVPx: safeRoundPx(measurement.shortVPx || 0),
  }
  RC.calibrationAttempts[`calibration${calibrationNumber}`] = calibrationObject
  _updateCalibrationAttemptsTransposed(
    RC,
    calibrationObject,
    commonCalibrationData,
  )
}
