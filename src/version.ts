import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

/** Read from package.json so the CLI, the reports and the npm package can never disagree. */
export const VERSION = (require('../package.json') as { version: string }).version;
