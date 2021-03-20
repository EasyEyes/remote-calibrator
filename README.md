# remote-calibration-toolbox

Welcome to Remote Calibration Toolbox _(Tentative name)_!

## Development

For building the library locally or development, please follow the steps below.

### Setup

```
git clone --recurse-submodules https://github.com/peilingjiang/remote-calibration-toolbox.git
```

### Install

```
npm run setup
```

### Development Build

This command will give you a quick and continuous build of the package output into the `example/lib` folder. Then you may setup the local server and develop based on it.

```
npm run dev
```

### Build

This command will give you a minimized build of the package output into both of the `example/lib` and `lib` folders. You may use the file for production purposes.

```
npm run build
```

### Example

```
node server.js
```

Then you may access the example at `localhost:8000`.
