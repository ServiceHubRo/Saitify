import { SiteRenderer } from '@saitify/engine';
import { hostingFromEnv, publicUrl } from '@saitify/platform';
import '@saitify/engine/styles.css';
import { demoWebsite, templateSamples } from '../../lib/marketing/samples';
import { appUrl } from '../../lib/server/platform';
import { ProductDemo, type DemoData } from './product-demo';

/**
 * Builds the demo's websites with the real configurator output and the real engine, on the server: the visitor's browser gets
 * finished markup for each state and never runs the engine. The address shown is the real address format of this deployment.
 */
export function DemoSection() {
  const samples = templateSamples();
  const base = samples.find((s) => s.id === 'table-restaurant')!;
  const page = base.site.pages.find((p) => p.type === 'home') ?? base.site.pages[0]!;
  const draw = (site: ReturnType<typeof demoWebsite>) => <SiteRenderer website={site} mode="public" year={2026} />;

  const generated = demoWebsite(base.site, { sections: 3 });
  const edited = demoWebsite(base.site, { sections: 3, headline: 'Casa Brașov, old town' });
  const restyled = demoWebsite(base.site, { sections: 3, headline: 'Casa Brașov, old town', palette: 'modern' });

  const hosting = hostingFromEnv(process.env, appUrl());
  const data: DemoData = {
    business: base.business,
    address: publicUrl(hosting, 'casa-brasov').replace(/^https?:\/\//, '').replace(/\/$/, ''),
    pages: base.site.pages.filter((p) => p.visible).map((p) => p.name),
    templates: samples.map((s) => ({ id: s.id, name: s.name, description: s.description })),
    generated: draw(generated),
    edited: draw(edited),
    restyled: draw(restyled),
  };
  void page;
  return <ProductDemo data={data} />;
}
