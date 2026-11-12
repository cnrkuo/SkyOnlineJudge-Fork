/** Deployment-wide settings of the web app, read from the environment. */
export const SITE_NAME = process.env.SITE_NAME ?? 'Sky Online Judge';
/** IANA zone all times are displayed and entered in. */
export const SITE_TIMEZONE = process.env.SITE_TIMEZONE ?? 'Asia/Taipei';
/** Base URL of the NestJS API, as reachable from the web server. */
export const API_URL = process.env.API_URL ?? 'http://127.0.0.1:3001';
