const webpack = require('webpack')

const ESLintPlugin = require('eslint-webpack-plugin')
const WebpackModules = require('webpack-modules')
const { CleanWebpackPlugin } = require('clean-webpack-plugin')
const TerserPlugin = require('terser-webpack-plugin')

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
        use: ['style-loader', 'css-loader', 'postcss-loader'],
      },
      {
        test: /\.s[ac]ss$/i,
        use: [
          'style-loader',
          'css-loader',
          'postcss-loader',
          {
            loader: 'sass-loader',
            options: {
              implementation: require('sass'),
            },
          },
        ],
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
  filename: 'RemoteCalibrator.min.js',
  library: 'RemoteCalibrator',
  libraryTarget: 'umd',
  libraryExport: 'default',
  sourceMapFilename: 'RemoteCalibrator.min.js.map',
}

const exampleConfig = Object.assign({}, config, {
  mode: 'development',
  output: Object.assign({}, output, {
    path: __dirname + '/homepage/lib',
  }),
  optimization: {
    minimize: false,
  },
  watch: true,
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
    ],
  },
})

module.exports = env => {
  if (env.development) {
    exampleConfig.plugins.push(
      new webpack.EnvironmentPlugin({
        VERSION: packageJSON.version,
        DEBUG: true,
      }),
      new webpack.BannerPlugin(`${packageJSON.name} - ${packageJSON.version}`)
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

    const libConfigExample = Object.assign({}, libConfig, {
      output: exampleConfig.output,
    })

    return [libConfig, libConfigExample]
  }
}
