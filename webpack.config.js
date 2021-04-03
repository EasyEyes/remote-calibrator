const webpack = require('webpack')

const ESLintPlugin = require('eslint-webpack-plugin')
const WebpackModules = require('webpack-modules')
const { CleanWebpackPlugin } = require('clean-webpack-plugin')

const packageJSON = require('./package.json')

const config = {
  entry: './src',
  module: {
    rules: [
      {
        test: /\.js/,
        use: 'babel-loader',
        include: __dirname + 'src/*',
        exclude: /node_modules/,
      },
      {
        test: /\.mjs/,
        type: 'javascript/auto',
        use: 'babel-loader',
        exclude: /node_modules/,
      },
      {
        test: /\.css$/i,
        use: ['style-loader', 'css-loader'],
      },
      {
        test: /\.svg$/,
        loader: 'svg-inline-loader',
      },
    ],
  },
  plugins: [
    new WebpackModules(),
    new ESLintPlugin(),
    new webpack.ProgressPlugin(),
    new CleanWebpackPlugin(),
  ],
  devtool: 'source-map',
}

const output = {
  filename: 'RemoteCalibrator.js',
  library: 'RemoteCalibrator',
  libraryTarget: 'umd',
  libraryExport: 'default',
  sourceMapFilename: 'RemoteCalibrator.js.map',
}

const exampleConfig = Object.assign({}, config, {
  mode: 'development',
  output: Object.assign({}, output, {
    path: __dirname + '/example/lib',
  }),
  optimization: {
    minimize: false,
  },
  watch: true,
})

const libConfig = Object.assign({}, config, {
  mode: 'production',
  output: Object.assign({}, output, {
    path: [__dirname + '/lib', __dirname + '/example/lib'],
  }),
  optimization: {
    minimize: true,
  },
})

module.exports = env => {
  if (env.development) {
    exampleConfig.plugins.push(
      new webpack.EnvironmentPlugin({
        VERSION: packageJSON.version,
        DEBUG: true,
      }),
      new webpack.BannerPlugin(
        `${packageJSON.name} - ${packageJSON.version} - DEV`
      )
    )

    return exampleConfig
  } else if (env.production) {
    libConfig.plugins.push(
      new webpack.EnvironmentPlugin({
        VERSION: packageJSON.version,
        DEBUG: false,
      }),
      new webpack.BannerPlugin(`${packageJSON.name} - ${packageJSON.version}`)
    )

    return libConfig
  }
}
