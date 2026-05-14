import { createTypeScriptEslintConfig } from "@web-rtc-nest/eslint-config";

export default createTypeScriptEslintConfig({
  tsconfigRootDir: import.meta.dirname
});
