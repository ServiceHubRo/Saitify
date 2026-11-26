import { DEMOS, validateWebsite, type Website } from '@saitify/engine';

/** A realistic multi-page website from the engine's own demos, validated exactly as the renderer does. */
export function demoSite(id = 'restaurant'): Website {
  const demo = DEMOS.find((d) => d.id === id) ?? DEMOS[0]!;
  const { website } = validateWebsite(demo.config);
  if (!website) throw new Error('demo is invalid');
  return website;
}
