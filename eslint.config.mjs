import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["coverage/**", "dist/**", "dist-electron/**", "node_modules/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { "argsIgnorePattern": "^_", "varsIgnorePattern": "^_" }
      ],
      "no-restricted-imports": [
        "error",
        {
          "paths": [
            {
              "name": "electron",
              "message": "Electron APIs belong in electron/ or a platform adapter."
            }
          ],
          "patterns": [
            {
              "group": ["node:*"],
              "message": "Node.js APIs must not enter the renderer bundle."
            }
          ]
        }
      ]
    }
  },
  {
    files: ["src/sim/**/*.ts"],
    rules: {
      "no-restricted-globals": [
        "error",
        { "name": "document", "message": "Simulation must not depend on the DOM." },
        { "name": "window", "message": "Simulation must not depend on browser globals." },
        { "name": "HTMLElement", "message": "Simulation must not depend on DOM types." }
      ],
      "no-restricted-imports": [
        "error",
        {
          "paths": [
            {
              "name": "pixi.js",
              "message": "Simulation must remain independent from PixiJS."
            },
            {
              "name": "electron",
              "message": "Simulation must remain independent from Electron."
            }
          ],
          "patterns": [
            {
              "group": ["node:*", "**/render/**", "**/ui/**"],
              "message": "Simulation cannot import platform, render, or UI modules."
            }
          ]
        }
      ]
    }
  },
  {
    files: [
      "electron/**/*.{ts,cts}",
      "tests/**/*.ts",
      "scripts/**/*.mjs",
      "*.config.ts"
    ],
    languageOptions: {
      globals: globals.node,
    }
  },
  {
    files: ["electron/**/*.cts"],
    rules: {
      "@typescript-eslint/no-require-imports": "off"
    }
  }
);
