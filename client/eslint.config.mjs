import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

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
  ...compat.extends("next/core-web-vitals", "next/typescript"),
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
    },
  },
];

export default eslintConfig;
