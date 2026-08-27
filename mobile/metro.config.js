const { getDefaultConfig } = require("expo/metro-config");

// Nothing custom here - this project relies on Expo CLI's built-in
// tsconfig.json `paths` support (the `@/*` -> `./src/*` alias used
// throughout the app) for Metro module resolution. That's automatic with
// getDefaultConfig() in current Expo, but the config file is kept explicit
// rather than omitted, since alias resolution has a history of silently
// depending on exactly this file existing in some EAS Build environments.
module.exports = getDefaultConfig(__dirname);
