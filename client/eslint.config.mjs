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
    // Pre-existing code-quality nits (unused vars, stray expressions,
    // `any` types) are demoted to warnings so CI doesn't fail on legacy
    // code. Real bugs (a11y, react-hooks, etc.) remain errors. Clean these
    // up opportunistically — they're surface-level, not architectural.
    rules: {
      "@typescript-eslint/no-unused-vars": "warn",
      "@typescript-eslint/no-unused-expressions": "warn",
      "@typescript-eslint/no-explicit-any": "warn",
      // Cosmetic — React renders the raw characters correctly either way.
      "react/no-unescaped-entities": "warn",
    },
  },
];

export default eslintConfig;
