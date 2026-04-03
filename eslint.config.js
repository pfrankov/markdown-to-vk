import tsParser from "@typescript-eslint/parser";

const complexityRule = ["error", 10];

export default [
  {
    ignores: ["dist/**"],
  },
  {
    files: ["src/**/*.ts", "test/**/*.ts"],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        describe: "readonly",
        expect: "readonly",
        it: "readonly",
      },
    },
    rules: {
      complexity: complexityRule,
    },
  },
  {
    files: ["*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
    },
    rules: {
      complexity: complexityRule,
    },
  },
];
