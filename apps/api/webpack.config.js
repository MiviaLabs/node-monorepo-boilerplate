const { join } = require('path');

const { NxAppWebpackPlugin } = require('@nx/webpack/app-plugin');
const { IgnorePlugin } = require('webpack');

module.exports = (async () => {
  return {
    output: {
      path: join(__dirname, '../../dist/apps/api'),
      clean: true,
      ...(process.env.NODE_ENV !== 'production' && {
        devtoolModuleFilenameTemplate: '[absolute-resource-path]'
      })
    },
    resolve: {
      alias: {
        'class-transformer/storage': require.resolve('class-transformer')
      }
    },
    externals: ({ request }, callback) => {
      // Mark optional peer dependencies as external
      if (request?.includes('@package/tasks')) {
        return callback(null, 'commonjs ' + request);
      }
      callback();
    },
    plugins: [
      // Ignore optional peer dependencies during build
      new IgnorePlugin({
        resourceRegExp: /^@package\/tasks$/
      }),
      // Nest tries to optionally load these packages at runtime.
      // This API app does not use these transports, so ignore them in bundle resolution.
      new IgnorePlugin({
        resourceRegExp: /^@nestjs\/microservices(\/.*)?$/
      }),
      new IgnorePlugin({
        resourceRegExp: /^@nestjs\/websockets(\/.*)?$/
      }),
      new NxAppWebpackPlugin({
        target: 'node',
        compiler: 'tsc',
        // Bundle internal workspace packages to avoid runtime resolution issues
        // from dist/package manifests during local serve.
        externalDependencies: ['@package/tasks'],
        main: './src/main.ts',
        tsConfig: './tsconfig.app.json',
        assets: ['./src/assets', './src/i18n/locales'],
        optimization: false,
        outputHashing: 'none',
        generatePackageJson: true,
        skipPackageManager: true, // Skip lockfile generation - handled separately by prune-lockfile
        sourceMaps: true
      })
    ]
  };
})();
