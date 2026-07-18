import path from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";

// eslint-config-next 15.x only ships legacy (eslintrc) shareable configs, so
// they are loaded through FlatCompat until the Next 16 upgrade brings native
// flat-config entrypoints.
const compat = new FlatCompat({
  baseDirectory: path.dirname(fileURLToPath(import.meta.url)),
});

const config = [
  {
    ignores: [
      ".next/**",
      ".gstack/**",
      // Flat config does not honor .gitignore; keep nested worktrees and
      // other tool state out of `eslint .`.
      ".claude/**",
      "test-results/**",
      "playwright-report/**",
      "next-env.d.ts",
    ],
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    // Underscore prefix marks intentionally unused bindings (e.g. `_columns`
    // in Supabase mock chains).
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
  {
    // Jest resets module state via jest.isolateModules/requireActual, which
    // only work with require(); mocks also need loose typing.
    files: ["__tests__/**", "__stubs__/**", "e2e/**", "jest.setup.ts"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
];

export default config;
