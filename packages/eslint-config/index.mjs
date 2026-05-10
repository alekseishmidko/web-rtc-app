import tseslint from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import prettier from "eslint-config-prettier";

export function createTypeScriptEslintConfig({ tsconfigRootDir }) {
  return [
    {
      ignores: ["dist/**", "node_modules/**"]
    },
    {
      files: ["src/**/*.ts"],
      languageOptions: {
        parser: tsParser,
        parserOptions: {
          project: "./tsconfig.json",
          tsconfigRootDir,
          sourceType: "module"
        }
      },
      plugins: {
        "@typescript-eslint": tseslint
      },
      rules: {
        ...tseslint.configs.recommended.rules,
        ...prettier.rules
      }
    }
  ];
}
