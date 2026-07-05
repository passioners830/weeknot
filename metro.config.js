const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
config.resolver.unstable_enablePackageExports = false;
// Windows Metro has a resolution bug with the "module" main field (.mjs paths
// that exist on disk still fail to resolve), so force main/commonjs instead.
config.resolver.resolverMainFields = ['react-native', 'browser', 'main'];

module.exports = config;
