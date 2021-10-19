# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `debug` and `i18n` options of `.panel()`. When set to `true`, The first one adds some useful options, e.g., to skip calibration, for you to use when debugging. The second one adds a language picker for participants to choose their own languages (the default choice is always the one set on initiation).

### Changed

- Rename "Head Tracking" to "Distance Tracking" globally.

## [0.3.0] - 2021-10-16

### Added

**i18n!**

- Internationalization! A full list of supported languages can be found at https://docs.google.com/spreadsheets/d/1UFfNikfLuo8bSromE34uWDuJrMPFiJG3VpoQKdCGkII/edit#gid=0.
- A few new getters related to languages:
  - `.userLanguage`
  - `.language` (e.g., `en-US`, `zh-CN`)
  - `.languageNameEnglish` (e.g., `English`, `Chinese (Simplified)`)
  - `.languageNameNative` (e.g., `简体中文`)
  - `.languageDirection` (`LTR` or `RTL`)
  - `.languagePhraseSource` (e.g., `Denis Pelli & Peiling Jiang 2021.10.10`)
  - `.languageData` gets the whole data history of languages.
  - `.supportedLanguages` gets an array of supported languages.
- `.newLanguage(lang = 'en-US')` to set a new language for the calibrator.
- Allows researchers to set language on initialization using the `language` option. Set to `AUTO` (default) will let the calibrator go with the user language.
- `.isMobile` getter.
- Call `._environment()` and `._displaySize()` automatically when initializing the calibrator.
- Instructions in the viewing distance measurement (and head tracking setup) is scrollable to avoid overlapping with the canvas on small screen sizes.
- Automatically minimize the mobile address bar when a calibration task starts.
- Safer type check for callback functions to avoid fatal errors.
- Version console log on loading.

### Changed

- Improved UI and performance for small screens and mobile devices.
- Take Return instead of Space for confirming screen size measurement.
- (Breaking) `.fullScreenData` getter is changed to `.fullscreenData`.
- Viewing distance methods become `BlindSpot` or `FaceMesh`.

### Fixed

- Participants can now continue (restart) calibration tasks after quitting at the middle of the last one.
- Various fixes and updates for the panel.
- Gaze and head trackers stop working on Safari when the video preview is turned off. (#49)
- Fatal error due to cannot detect devices for VR headsets.
- Remove wrongly labelled camera icon for measuring viewing distance task in the panel.

### Removed

- (Breaking) `.environment()` and `.displaySize()`. Values can be accessed directly throw the getters.
- The responsive arrow in the screen size calibration with credit card.

## [0.2.3] - 2021-10-05

### Added

- (Breaking) Callback function of gaze tracking is split into two functions: `callbackOnCalibrationEnd` that will only be called once when calibration ends, and `callbackTrack` that will be called continuously as the tracking runs (with data parameter passed in).
- `sparkle` option (default `true`) for measuring and tracking viewing distance. The red dot sparkles at 10 Hz to make it more prominent when absent from the view.
- Ignore the Return key in screen size calibration.

### Fixed

- Panel final callback function is called multiple times if gaze tracking is the last calibration task.

## [0.2.2] - 2021-10-04

### Added

- Sound feedback (2000 Hz, 0.05 s) for responses in blind spot test.
- `showNextButton` option for panel. If set to `false` (default), automatically proceed to the final callback after finishing the last task.
- `nextHeadline` and `nextDescription` in panel options to change panel text after finishing all calibrations.
- Blind spot floating instructions move along with the crosshair.
- Add credit text for blind spot test and credit card trick on the corresponding pages.

### Changed

- Changed "cross" to "crosshair" in default task descriptions.
- Slightly thinner crosshair line width.
- When not tracking near point, `nearPointCm` is stored as `[null, null]` instead of `null`.

### Fixed

- Floating instructions don't show in blind spot test for head tracking, when near point is turned off.
- Dependency security issues.

## [0.2.1] - 2021-09-14

Minor fixes and updates.

## [0.2.0] - 2021-09-14

### Added

- `.showNearPoint()` to control the display of the near point on the screen (a green square).
- `.removePanel()` and `.resetPanel()` functions to better control the panel element.
- Animate transitions of the gaze calibration dot.

### Changed

- **(Breaking)** `.panel()` now becomes an async function and takes one more argument - `resolveOnFinish` that can be resolved after the "Done" button is pressed. This process is independent from the original callback function and provides one more way to deal with the end state of the calibration panel. The logic might be used for all other calibration and tracking functions soon.
- The square part of the USB connectors will totally disappear when hovering on the slider and changing their sizes.
- Default decimal place value (customized by `decimalPlace` in options) for head (1) and gaze (0) tracking data.
- **(Breaking)** `showVideo` and `showGazer` parameters will only be effective after the initial calibration process. Participants would be able to see these visual feedbacks during the calibration even the parameters were set to `false`.
- Refined design and default text of panel element.
- Refined design of screen size measurement interface. It now works much better on smartphones.
- Default instruction text in various functions.
- A lighter default background color, changed from `#ddd` to `#ccc`.

### Fixed

- Avoid setting up multiple head trackings at the same time.
- Cannot track near point when video is hidden.
- After the initial measurement in head tracking, the float instruction block shrink to an ellipse.
- No data error for video element when tracking viewing distance.
- Panel final callback is not checked before running, which may cause error.
- Video feedback box may be selected unexpectedly during gaze calibration.

### Removed

- Pop-up in various functions. Instructions will be displayed side-by-side with the actual tasks.
- Disable checking gaze accuracy and setting `thresholdDeg`. Waiting for more robust solutions.

## [0.1.1] - 2021-08-24

Minor update.

## [0.1.0] - 2021-08-24

### Added

- Add virtual clickable buttons to be fully functional on mobile devices without a keyboard.

### Changed

- **(Breaking)** In the parameter, options, and extension names, the unit name is capitalized only for the first letter, including `Px`, `Cm`, `In`, `Ppi`, `Deg`, e.g., `RemoteCalibrator.viewingDistanceCm`.
- Redesigned panel for setting up calibration pipeline.
- Changed default descriptions and instructions for various functions.
- Viewing distance tracking is rephrased to **Head Tracking** in various context. The function handle `.trackDistance()` stays unchanged.

### Fixed

- Wrong keyword for framerate option for `.trackDistance()` in readme.

## [0.0.9] - 2021-07-24

No new feature updates in this release. Fix image path and update dependencies.

## [0.0.8] - 2021-07-24

### Added

- Measure the interpupillary distance before tracking near point and viewing distance.
- A new `develop` branch for new feature development. The deployed `main` branch will only use released versions of the package.

### Changed

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

- **(Breaking)** `.trackDistance()` and `.getDistanceNow()` now pass `{ value: { viewingDistanceCM, nearPointCM: { x, y } }, timestamp, method }` into the `callbackTrack` function.
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

[unreleased]: https://github.com/EasyEyes/remote-calibrator/compare/v0.3.0...develop
[0.3.0]: https://github.com/EasyEyes/remote-calibrator/compare/v0.2.3...v0.3.0
[0.2.3]: https://github.com/EasyEyes/remote-calibrator/compare/v0.2.2...v0.2.3
[0.2.2]: https://github.com/EasyEyes/remote-calibrator/compare/v0.2.1...v0.2.2
[0.2.1]: https://github.com/EasyEyes/remote-calibrator/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/EasyEyes/remote-calibrator/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/EasyEyes/remote-calibrator/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/EasyEyes/remote-calibrator/compare/v0.0.9...v0.1.0
[0.0.9]: https://github.com/EasyEyes/remote-calibrator/compare/v0.0.8...v0.0.9
[0.0.8]: https://github.com/EasyEyes/remote-calibrator/compare/v0.0.7...v0.0.8
[0.0.7]: https://github.com/EasyEyes/remote-calibrator/compare/v0.0.6...v0.0.7
[0.0.6]: https://github.com/EasyEyes/remote-calibrator/compare/v0.0.5...v0.0.6
[0.0.5]: https://github.com/EasyEyes/remote-calibrator/compare/v0.0.4...v0.0.5
[0.0.4]: https://github.com/EasyEyes/remote-calibrator/compare/v0.0.3...v0.0.4
[0.0.3]: https://github.com/EasyEyes/remote-calibrator/compare/v0.0.2...v0.0.3
[0.0.2]: https://github.com/EasyEyes/remote-calibrator/compare/v0.0.1...v0.0.2
[0.0.1]: https://github.com/EasyEyes/remote-calibrator/releases/tag/v0.0.1
