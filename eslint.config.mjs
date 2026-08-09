import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig([
  ...tseslint.configs.recommended,
  globalIgnores([
    "assets/**",
    "github-pages/**",
    "dist/**",
    "coverage/**",
    "tsconfig.tsbuildinfo",
  ]),
]);
