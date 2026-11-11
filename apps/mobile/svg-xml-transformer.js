// Turns `import xml from "./icon.svg"` into the file's text. Every other file
// goes through Expo's own transformer unchanged.
const upstream = require("@expo/metro-config/babel-transformer");

module.exports = {
  ...upstream,
  transform({ src, filename, options, ...rest }) {
    if (filename.endsWith(".svg")) {
      return upstream.transform({ src: `module.exports = ${JSON.stringify(src)};`, filename, options, ...rest });
    }
    return upstream.transform({ src, filename, options, ...rest });
  },
};
