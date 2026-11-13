import js from "@eslint/js";
import tseslint from "typescript-eslint";

// Screens take colours, font sizes and radii from the theme tokens
// (apps/mobile/src/theme/tokens.ts, apps/web/src/styles/tokens.css).
const rawStyleValues = [
  {
    selector: "Literal[value=/^#[0-9a-fA-F]{3,8}$/]",
    message: "Use a colour token from the theme instead of a raw hex colour.",
  },
  {
    selector: "Literal[value=/^(rgb|rgba|hsl|hsla)\\(/]",
    message: "Use a colour token from the theme instead of a raw rgb() or hsl() colour.",
  },
  {
    selector:
      "Property[key.name=/^(borderRadius|border(Top|Bottom)(Left|Right|Start|End)Radius|fontSize)$/] > Literal.value[value!=0]",
    message: "Use a fontSize or radii token from the theme instead of a raw number.",
  },
];

// Time comes from the injected clock (`deps.clock.now()`) so tests can move it.
const sqlNow = [
  {
    selector: "TemplateElement[value.raw=/\\bnow\\(\\)/i]",
    message: "Pass the time from the clock as a query parameter instead of SQL now().",
  },
  {
    selector: "Literal[value=/\\bnow\\(\\)/i]",
    message: "Pass the time from the clock as a query parameter instead of SQL now().",
  },
];
const jsNow = [
  {
    selector: "NewExpression[callee.name='Date'][arguments.length=0]",
    message: "Take the time from the clock (deps.clock.now()) instead of new Date().",
  },
  {
    selector: "CallExpression[callee.object.name='Date'][callee.property.name='now']",
    message: "Take the time from the clock (deps.clock.now()) instead of Date.now().",
  },
];

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/build/**",
      "benchmarks/results/**",
      "docs/**",
      "supabase/.temp/**",
      ".agents/**",
      ".claude/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
    },
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
  {
    files: ["apps/mobile/src/**/*.{ts,tsx}", "apps/web/src/**/*.{ts,tsx}"],
    ignores: ["apps/mobile/src/theme/tokens.ts"],
    rules: { "no-restricted-syntax": ["error", ...rawStyleValues] },
  },
  {
    files: ["apps/api/src/**/*.ts"],
    ignores: ["apps/api/src/clock.ts", "apps/api/src/testing/**"],
    rules: { "no-restricted-syntax": ["error", ...sqlNow, ...jsNow] },
  },
  {
    // Node scripts and Expo build-time config run in Node, which declares these globals.
    files: ["scripts/**", "apps/mobile/scripts/**", "apps/mobile/*.config.ts", "apps/mobile/src/config.ts"],
    languageOptions: {
      globals: { process: "readonly", console: "readonly", fetch: "readonly", setTimeout: "readonly", AbortSignal: "readonly" },
    },
  },
  {
    // Maestro runs these scripts in its own JavaScript engine, which provides these globals.
    files: ["apps/mobile/.maestro/scripts/**"],
    languageOptions: {
      globals: { output: "writable", http: "readonly", json: "readonly", EMAIL: "readonly", EMAIL_DOMAIN: "readonly", VERIFY: "readonly" },
    },
  },
  {
    // Metro loads its config and transformer as CommonJS.
    files: ["apps/mobile/*.js"],
    languageOptions: {
      sourceType: "commonjs",
      globals: { require: "readonly", module: "writable", __dirname: "readonly" },
    },
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
  {
    // The benchmark prototypes and the promoted flat trie index typed arrays in
    // hot loops, where a non-null assertion is the cheapest correct option.
    files: ["benchmarks/**", "packages/shared/src/search/flat-trie.ts"],
    rules: {
      "@typescript-eslint/no-non-null-assertion": "off",
    },
  },
);
