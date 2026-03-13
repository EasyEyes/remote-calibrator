/**
 * src/distance/object/index.js
 *
 * Barrel file that re-exports all object-based distance calibration utilities.
 * This replaces the former objectDistance.js with an organized module structure.
 *
 * Modules:
 * - locationUtils:              Parsing, instructions, UI positioning, tolerance checking
 * - locationManager:            Location measurement state manager factory
 * - measurementPageRenderer:    Dynamic measurement page renderer factory + config builder
 * - objectTestOrchestrator:     New modular entry point (opt-in, not yet wired to distance.js)
 */

// ─── Location utilities (parsing, instructions, positioning, tolerance) ──────
export {
  VALID_LOCATIONS,
  parseLocation,
  parseLocationEye,
  parseLocationsArray,
  getLocationInstructionPhraseKey,
  buildLocationInstructions,
  getVideoTopCenterXYPx,
  getPointXYPxForLocation,
  getArrowPositionForLocation,
  positionVideoForLocation,
  getGlobalPointForLocation,
  removeBigCircle,
  setupLocationMeasurementUI,
  checkConsecutiveMeasurementTolerance,
} from './locationUtils'

// ─── Location measurement state manager ─────────────────────────────────────
export { createLocationMeasurementManager } from './locationManager'

// ─── Measurement page renderer + config builder ─────────────────────────────
export {
  createMeasurementPageRenderer,
  buildMeasurementPageConfig,
} from './measurementPageRenderer'

// ─── New modular orchestrator (opt-in, not yet wired to distance.js) ────────
export { objectTestNew } from './objectTestOrchestrator'
