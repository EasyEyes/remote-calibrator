# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Customized predicting framerate for gaze tracking.
- `greedyLearner` option for gaze tracking. Set to `false` (default) to stop active learning and regression to cursor interaction to update the prediction model. (WebGazer use a regression model to always learn and update the model based on the assumption that one would always look at the point where curser makes interaction. However, in a psychophysics experiment, participants may not always look at the place where they click or move the cursor.)
- Get gaze prediction only at the moment when the user makes an reaction using `.getGazeNow()` (when the tracking is paused). This can help save lots of computing resources and get the gaze data at the desired time.
- Visual feedback during gaze calibration, e.g., click countdown.
- Add dynamic viewing distance tracking. Customized framerate and target-moment predicting (`.getDistanceNow()`) are built-in.
- Tracking viewing distance and gaze at the same time.
- End viewing distance tracking and/or gaze tracking and restart fresh.
- `.panel()` function that helps set up a graphical user interface for participants to calibrate step by step.
- [Swal](https://sweetalert2.github.io/) to handle alerts and text instructions.
- Customizable calibration background color and video opacity.
- New homepage at https://easyeyes.app/remote-calibrator/ with the new logo.
- New theme color `#ff9a00` used in various places.

### Changed

- Reduced text instructions on the calibration page, moving descriptions and instructions to the [Swal](https://sweetalert2.github.io/) element.
- Uniform format for floating text instructions, e.g., "Starting up... Please wait."
- Updated information and instructions in the demo page.
- `paused` status can be access beyond WebGazer.
- New orange icon color for the Swal popups.

### Fixed

- Various bug and wording fixes.
- Can't end the gaze due to a WebGazer error.

### Removed

- WebGazer's warning when running on `localhost` without `https`.
- `predicting` status of WebGazer.
- `_calibrated` status of `RemoteCalibrator.gazeTracker`.

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

[unreleased]: https://github.com/peilingjiang/RemoteCalibrator/compare/v0.0.4...HEAD
[0.0.4]: https://github.com/peilingjiang/RemoteCalibrator/compare/v0.0.3...v0.0.4
[0.0.3]: https://github.com/peilingjiang/RemoteCalibrator/compare/v0.0.2...v0.0.3
[0.0.2]: https://github.com/peilingjiang/RemoteCalibrator/compare/v0.0.1...v0.0.2
[0.0.1]: https://github.com/peilingjiang/RemoteCalibrator/releases/tag/v0.0.1
