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
    // The benchmark prototypes index typed arrays in hot loops, where a
    // non-null assertion is the cheapest correct option.
    files: ["benchmarks/**"],
    rules: {
      "@typescript-eslint/no-non-null-assertion": "off",
    },
  },
);
