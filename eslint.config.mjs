import { createTypeScriptEslintConfig } from '@web-rtc-nest/eslint-config';

const root = import.meta.dirname;

export default [
  ...createTypeScriptEslintConfig({
    files: ['apps/server/auth-service/src/**/*.ts'],
    tsconfigRootDir: `${root}/apps/server/auth-service`,
  }),
  ...createTypeScriptEslintConfig({
    files: ['apps/server/gateway-service/src/**/*.ts'],
    tsconfigRootDir: `${root}/apps/server/gateway-service`,
  }),
  ...createTypeScriptEslintConfig({
    files: ['apps/server/signaling-service/src/**/*.ts'],
    tsconfigRootDir: `${root}/apps/server/signaling-service`,
  }),
  ...createTypeScriptEslintConfig({
    files: ['packages/contracts/src/**/*.ts'],
    tsconfigRootDir: `${root}/packages/contracts`,
  }),
  ...createTypeScriptEslintConfig({
    files: ['apps/client/src/**/*.{ts,tsx}', 'apps/client/vite.config.ts'],
    tsconfigRootDir: `${root}/apps/client`,
  }),
];
