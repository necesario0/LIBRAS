import js from "@eslint/js";
import tseslint from "typescript-eslint";

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
