# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## Added

- Measure the interpupillary distance before tracking near point and viewing distance.
- A new `develop` branch for new feature development. The deployed `main` branch will only use released versions of the package.

## Changed

- Improved starting time of gaze and distance tracking, around 3 times faster.

## [0.0.7] - 2021-07-17

No new feature updates in this release. Updated dependency packages and the license.

## [0.0.6] - 2021-07-16

### Added

- Track near point (as an add-on to the viewing distance tracking).
- Bot detection: `.bot` will return the name, category, and producer of the bot if the user agent is one, an empty string will be returned otherwise.
- `.isFullscreen` getter to get the current window mode. `.getFullscreen()` now also records fullscreen mode status data.
- `.version` getter on the demo page.

### Changed

- **(Breaking)** `.trackDistance` and `.getDistanceNow` now pass `{ value: { viewingDistanceCM, nearPointCM: { x, y } }, timestamp, method }` into the `callbackTrack` function.
- If no result is found for `.model` and `.manufacturer`, an empty string instead of `null` will be returned as value.
- Format of the result from `.version` getter - now an object with one field, `value`.
- Update readme.

### Fixed

- No value was returned for `.deviceType` getter.
- Wrong Netlify badge.

## [0.0.5] - 2021-07-13

### Added

- Customized predicting framerate for gaze tracking.
- `greedyLearner` option for gaze tracking. Set to `false` (default) to stop active learning and regression to cursor interaction to update the prediction model. (WebGazer uses a regression model to always learn and update the model based on the assumption that one would always look at the point where curser makes interaction. However, in a psychophysics experiment, participants may not always look at the place where they click or move the cursor.)
- Get gaze prediction only at the moment when the user makes a reaction using `.getGazeNow()` (when the tracking is paused). This can help save lots of computing resources and get the gaze data at the desired time.
- Visual feedback during gaze calibration, e.g., click countdown.
- Add dynamic viewing distance tracking. Customized framerate and target-moment predicting (`.getDistanceNow()`) are built-in.
- Tracking viewing distance and gaze at the same time.
- End viewing distance tracking and gaze tracking and restart fresh.
- Enable eye centering validation even when WebGazer prediction is paused.
- `.panel()` function that helps set up a graphical user interface for participants to calibrate step by step.
- Universal key binders and un-binders. Binding `Escape` and `Space` keys to functions.
- [Swal](https://sweetalert2.github.io/) to handle alerts and text instructions.
- Customizable calibration background color and video opacity.
- When calibrating screen size with USB, the virtual handle part will become semitransparent to emphasize the main port part when the user hovers the slider.
- New homepage at https://easyeyes.app/remote-calibrator/ with the new logo.
- New theme color `#ff9a00` used in various places.

### Changed

- Reduced text instructions on the calibration page, moving descriptions and instructions to the [Swal](https://sweetalert2.github.io/) element.
- Uniform format for floating text instructions, e.g., "Starting up... Please wait."
- Updated information and instructions on the demo page.
- `paused` status can be accessed beyond WebGazer.
- New orange icon color for the Swal popups.
- New remapping relationship between the slider value and the USB connecter sizes, making it easier to make tiny adjustments.

### Fixed

- Various bug and wording fixes.
- Can't end the gaze due to a WebGazer error.
- Some functions can't record data when no callback function is defined.

### Removed

- WebGazer's warning when running on `localhost` without `https`.
- `predicting` status of WebGazer.
- `_calibrated` status of `RemoteCalibrator.gazeTracker`.
- `.webcam()` that gets device information of the webcam.

## [0.0.4] - 2021-05-28

### Added

- The first prototype of `.trackDistance()` for tracking the dynamic viewing distance.

### Fixed

- Various bugs.

## [0.0.3] - 2021-04-20

### Added

- Get info of the webcam by taking a picture and read the EXIF meta data from the image file.

### Changed

- By default, fullscreen will not be activated during initiation.

### Removed

- Stop publishing to GitHub packages.

## [0.0.2] - 2021-04-20

### Fixed

- Set publish registry for publishing GitHub packages.

## [0.0.1] - 2021-04-20

The framework and some basic functions, e.g., screen size calibration. Released for integration testing.

[unreleased]: https://github.com/EasyEyes/remote-calibrator/compare/v0.0.7...develop
[0.0.7]: https://github.com/EasyEyes/remote-calibrator/compare/v0.0.6...v0.0.7
[0.0.6]: https://github.com/EasyEyes/remote-calibrator/compare/v0.0.5...v0.0.6
[0.0.5]: https://github.com/EasyEyes/remote-calibrator/compare/v0.0.4...v0.0.5
[0.0.4]: https://github.com/EasyEyes/remote-calibrator/compare/v0.0.3...v0.0.4
[0.0.3]: https://github.com/EasyEyes/remote-calibrator/compare/v0.0.2...v0.0.3
[0.0.2]: https://github.com/EasyEyes/remote-calibrator/compare/v0.0.1...v0.0.2
[0.0.1]: https://github.com/EasyEyes/remote-calibrator/releases/tag/v0.0.1
