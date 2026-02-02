const webpack = require('webpack');

module.exports = {
    webpack: {
        configure: (webpackConfig) => {
            // Add fallbacks for Node.js modules
            webpackConfig.resolve.fallback = {
                ...webpackConfig.resolve.fallback,
                buffer: require.resolve('buffer'),
                crypto: require.resolve('crypto-browserify'),
                stream: require.resolve('stream-browserify'),
                process: require.resolve('process/browser.js'),
                http: require.resolve('stream-http'),
                https: require.resolve('https-browserify'),
                os: false,
                path: false,
                fs: false,
            };

            // Add plugins
            webpackConfig.plugins = [
                ...webpackConfig.plugins,
                new webpack.ProvidePlugin({
                    Buffer: ['buffer', 'Buffer'],
                    process: 'process/browser.js',
                }),
            ];

            return webpackConfig;
        },
    },
};