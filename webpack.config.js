const webpack = require('webpack')
const TerserPlugin = require('terser-webpack-plugin')
const ESLintPlugin = require('eslint-webpack-plugin')
const WebpackModules = require('webpack-modules')
const { CleanWebpackPlugin } = require('clean-webpack-plugin')

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
})

const libConfig = Object.assign({}, config, {
  mode: 'production',
  output: Object.assign({}, output, {
    path: __dirname + '/lib',
  }),
})

module.exports = env => {
  if (env.development) {
    // Export example only and not minimize
    exampleConfig.watch = true
    exampleConfig.plugins.push(
      new webpack.EnvironmentPlugin({
        DEBUG: true,
      })
    )
    return exampleConfig
  } else if (env.production) {
    // Export both and minimize both
    exampleConfig.optimization = {
      minimize: true,
      minimizer: [
        new TerserPlugin({
          extractComments: false,
        }),
      ],
    }
    exampleConfig.plugins.push(
      new webpack.EnvironmentPlugin({
        DEBUG: false,
      })
    )
    exampleConfig.mode = 'production'
    return [exampleConfig, libConfig]
  }
}
