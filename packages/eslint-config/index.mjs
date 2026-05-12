import tseslint from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import prettier from "eslint-config-prettier";

export function createTypeScriptEslintConfig({
  files = ["src/**/*.ts"],
  project = "./tsconfig.json",
  tsconfigRootDir
}) {
  return [
    {
      ignores: ["dist/**", "node_modules/**"]
    },
    {
      files,
      languageOptions: {
        parser: tsParser,
        parserOptions: {
          project,
          tsconfigRootDir,
          sourceType: "module"
        }
      },
      plugins: {
        "@typescript-eslint": tseslint
      },
      rules: {
        ...tseslint.configs.recommended.rules,
        ...prettier.rules,
        "no-console": ["error", { allow: ["warn", "error"] }],
        "@typescript-eslint/consistent-type-imports": [
          "error",
          {
            fixStyle: "separate-type-imports",
            prefer: "type-imports"
          }
        ]
      }
    }
  ];
}
