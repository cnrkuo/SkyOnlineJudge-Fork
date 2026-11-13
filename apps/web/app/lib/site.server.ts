/** Deployment-wide settings of the web app, read from the environment. */
export const SITE_NAME = process.env.SITE_NAME ?? 'Sky Online Judge';
/** IANA zone all times are displayed and entered in. */
export const SITE_TIMEZONE = process.env.SITE_TIMEZONE ?? 'Asia/Taipei';
