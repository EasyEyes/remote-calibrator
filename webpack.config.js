const path = require('path')

const webpack = require('webpack')

const { CleanWebpackPlugin } = require('clean-webpack-plugin')
const TerserPlugin = require('terser-webpack-plugin')
const CssMinimizerPlugin = require('css-minimizer-webpack-plugin')
const BundleAnalyzerPlugin =
  require('webpack-bundle-analyzer').BundleAnalyzerPlugin

const packageJSON = require('./package.json')
const config = require('./webpack.utils.js').config
const plugins = [
  ...require('./webpack.utils.js').plugins,
  new CleanWebpackPlugin(),
]

const output = {
  filename: 'RemoteCalibrator.min.js',
  sourceMapFilename: 'RemoteCalibrator.min.js.map',
  library: 'RemoteCalibrator',
  libraryTarget: 'umd',
  libraryExport: 'default',
}

const exampleConfig = Object.assign({}, config, {
  mode: 'development',
  output: Object.assign({}, output, {
    sourceMapFilename: 'RemoteCalibrator.[contenthash].min.js.map',
    path: __dirname + '/homepage/lib',
    publicPath: '/lib/',
  }),
  optimization: {
    minimize: false,
  },
  // watch: true,
  devServer: {
    static: {
      directory: path.join(__dirname, 'homepage'),
    },
    client: {
      overlay: {
        errors: true,
        warnings: false,
      },
    },
    port: 9000,
    hot: true,
    open: true,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
      'Access-Control-Allow-Headers': 'X-Requested-With, content-type, Authorization',
    },
  },
  plugins: plugins,
})

const libConfig = Object.assign({}, config, {
  mode: 'production',
  output: Object.assign({}, output, {
    path: __dirname + '/lib',
  }),
  optimization: {
    minimize: true,
    minimizer: [
      new TerserPlugin({
        terserOptions: {
          compress: {
            drop_console: true,
          },
        },
      }),
      new CssMinimizerPlugin(),
    ],
  },
  plugins: plugins,
})

module.exports = env => {
  if (env.development) {
    exampleConfig.plugins.push(
      new webpack.EnvironmentPlugin({
        VERSION: packageJSON.version,
        DEBUG: true,
        BUILD_TARGET: 'development',
      }),
      new webpack.BannerPlugin(
        `${packageJSON.name} - ${packageJSON.version} - DEV`,
      ),
    )

    return exampleConfig
  } else if (env.production) {
    const licenseText = `
    @license
    EasyEyes Remote Calibrator (${packageJSON.name}) Version ${
      packageJSON.version
    }
    https://github.com/EasyEyes/remote-calibrator
    
    Copyright ${new Date().getFullYear()} New York University. All Rights Reserved
    Created in New York City by Denis Pelli & Peiling Jiang

    The source code is available with an MIT-style
    license which can be found in the LICENSE file.
    `
    libConfig.plugins.push(
      new webpack.EnvironmentPlugin({
        VERSION: packageJSON.version,
        DEBUG: false,
        BUILD_TARGET: 'production',
      }),
      new webpack.BannerPlugin(licenseText),
    )
    // libConfig.plugins.push(new BundleAnalyzerPlugin())

    // const libConfigExample = Object.assign({}, libConfig, {
    //   output: exampleConfig.output,
    // })

    return libConfig
  }
}
