import { TEMPLATES } from '@saitify/configurator';
import { validateWebsite } from '@saitify/engine';
import { describe, expect, it } from 'vitest';
import { demoWebsite, sampleState, templateSamples } from './samples';

describe('marketing samples come from the real generator and the real templates', () => {
  const samples = templateSamples();
  it('has one valid, error-free website for every real template', () => {
    expect(samples.map((s) => s.id)).toEqual(TEMPLATES.map((t) => t.id));
    for (const s of samples) {
      const v = validateWebsite(s.site);
      expect(v.issues.filter((i) => i.severity === 'error'), s.id).toEqual([]);
      expect(s.site.pages.length).toBeGreaterThanOrEqual(3);
      expect(s.site.pages.some((p) => p.type === 'home')).toBe(true);
    }
  });
  it('applies each template exactly as the configurator does (design and variants)', () => {
    for (const t of TEMPLATES) {
      const site = samples.find((s) => s.id === t.id)!.site;
      expect(site.design).toMatchObject({ palette: t.design.palette, style: t.design.style });
    }
    expect(sampleState('table-restaurant').category).toBe('restaurant');
  });
  it('builds compact demo sites with the edit and restyle the demo shows', () => {
    const base = samples.find((s) => s.id === 'table-restaurant')!.site;
    const edited = demoWebsite(base, { headline: 'Casa Brașov, old town', sections: 2 });
    const hero = edited.pages[0]!.sections.find((s) => s.type === 'hero')!;
    expect(hero.content.heading).toBe('Casa Brașov, old town');
    expect(edited.pages).toHaveLength(1);
    expect(edited.pages[0]!.sections.length).toBeLessThanOrEqual(2);
    const restyled = demoWebsite(base, { palette: 'modern' });
    expect(restyled.design.palette).toBe('modern');
    expect(base.design.palette).toBe('bold'); // the original is untouched
  });
});
