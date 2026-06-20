// Flat config for ESLint 9 + eslint-config-next 16. v16 ships native flat
// configs (arrays of Linter.Config), so we spread them directly rather than
// going through @eslint/eslintrc's FlatCompat — wrapping the native flat
// config in compat.extends() throws "Converting circular structure to JSON".
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = [
  // Skip generated + third-party trees. The Tauri Rust target dir contains
  // bundler-minified JS blobs that balloon `eslint .` to ~30k false errors.
  {
    ignores: [
      ".next/**",
      "out/**",
      "node_modules/**",
      "src-tauri/target/**",
      "src-tauri/gen/**",
    ],
  },
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    // The codebase is now clean of `any` and unused vars, so these are
    // errors to stop regressions as the team grows. The remaining two stay
    // warnings: stray expressions are occasionally intentional, and
    // unescaped entities are cosmetic (React renders them correctly).
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          // Allow intentionally-unused names via a leading underscore, and
          // don't flag caught errors that a handler chooses not to inspect.
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrors: "none",
        },
      ],
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-expressions": "warn",
      "react/no-unescaped-entities": "warn",

      // eslint-config-next 16 ships react-hooks v6, which turns on the React
      // Compiler diagnostics below. They enforce React-Compiler compatibility,
      // which this codebase has not adopted — they flag legitimate non-Compiler
      // patterns (data-fetch-on-mount setState, deliberate ref reads), not bugs.
      // Disabled to keep the lint signal on the rules we do enforce
      // (no-unused-vars, no-explicit-any, exhaustive-deps, …). Re-enable if/when
      // the team adopts the React Compiler.
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/immutability": "off",
      "react-hooks/refs": "off",
      "react-hooks/preserve-manual-memoization": "off",
      "react-hooks/purity": "off",
    },
  },
];

export default eslintConfig;
