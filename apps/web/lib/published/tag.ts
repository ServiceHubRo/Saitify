import { createHash } from 'node:crypto';

/** Opaque, non-reversible tag for a deployment. Lets the reachability check prove WHICH version answered, without exposing database ids. */
export const deploymentTag = (id: string) => createHash('sha256').update(`saitify-build:${id}`).digest('hex').slice(0, 16);
