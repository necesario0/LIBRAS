// The desk and scanner pages take colours, font sizes and radii from the
// tokens in apps/web/src/styles/tokens.css, which is the one file that holds raw values.
const useToken = "Use a token from tokens.css instead of a raw value.";

export default {
  ignoreFiles: ["**/node_modules/**", "**/dist/**", "apps/web/src/styles/tokens.css"],
  rules: {
    "color-no-hex": [true, { message: useToken }],
    "color-named": ["never", { message: useToken }],
    "function-disallowed-list": [["rgb", "rgba", "hsl", "hsla", "hwb", "lab", "lch", "oklab", "oklch"], { message: useToken }],
    "declaration-property-value-allowed-list": [
      {
        "font-size": [/^var\(/, "inherit"],
        "/radius$/": [/^var\(/, "0", "inherit"],
      },
      { message: useToken },
    ],
  },
};
