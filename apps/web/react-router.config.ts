import type { Config } from '@react-router/dev/config';

export default {
  // Every page is server-rendered; loaders and actions are the only code
  // that talks to the API.
  ssr: true,
} satisfies Config;
