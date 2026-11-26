import 'server-only';
import { hostingFromEnv } from '@saitify/platform';
import { appUrl } from './platform';

/** Where websites are published. Read from the environment at request time, never baked in. */
export const hosting = () => hostingFromEnv(process.env, appUrl());
