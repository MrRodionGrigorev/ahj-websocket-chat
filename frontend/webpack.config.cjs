const path = require('node:path');
const webpack = require('webpack');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');

const apiUrl = new URL(process.env.API_URL || 'http://127.0.0.1:3000/');

module.exports = {
  entry: './src/index.js',
  output: { path: path.resolve(__dirname, 'dist'), filename: 'app.[contenthash].js', publicPath: '', clean: true },
  module: { rules: [
    { test: /\.css$/i, use: [MiniCssExtractPlugin.loader, 'css-loader'] },
    { test: /\.(svg|png|jpe?g|gif)$/i, type: 'asset/resource' }
  ] },
  plugins: [
    new HtmlWebpackPlugin({ template: './src/index.html', favicon: './src/images/favicon.svg' }),
    new MiniCssExtractPlugin({ filename: 'app.[contenthash].css' }),
    new webpack.DefinePlugin({ __API_URL__: JSON.stringify(apiUrl.href) })
  ],
  devServer: { host: '127.0.0.1', port: 8081, open: false }
};
