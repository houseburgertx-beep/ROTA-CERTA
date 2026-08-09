import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "assets/**",
    "github-pages/**",
    "dist/**",
    "coverage/**",
    "tsconfig.tsbuildinfo",
    "next-env.d.ts",
  ]),
  {
    rules: {
      // Fotos de comandas usam object URLs locais e não passam pelo otimizador.
      "@next/next/no-img-element": "off",
    },
  },
]);

export default eslintConfig;
