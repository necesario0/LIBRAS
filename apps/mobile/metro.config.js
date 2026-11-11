// Metro config: Expo's default, plus .svg files imported as their own XML text,
// which <SvgXml> (react-native-svg) draws. Figma's icon exports are used as they
// are, with no vector converter in the build.
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

config.transformer.babelTransformerPath = require.resolve("./svg-xml-transformer.js");
config.resolver.assetExts = config.resolver.assetExts.filter((extension) => extension !== "svg");
config.resolver.sourceExts = [...config.resolver.sourceExts, "svg"];

module.exports = config;
