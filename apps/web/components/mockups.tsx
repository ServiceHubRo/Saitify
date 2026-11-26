import type { CSSProperties, ReactNode } from 'react';
import type { TemplateVariant } from '../lib/site';

/**
 * Marketing illustrations drawn in code. They are NOT functional UI: every mockup is exposed to
 * assistive technology as a single labelled image, and sizes scale with the container (cqw units).
 */

type Layout = 'split' | 'center' | 'bold' | 'gallery';

type Theme = {
  brand: string;
  headline: string;
  bg: string;
  ink: string;
  accent: string;
  accent2: string;
  buttonInk: string;
  layout: Layout;
  radius: string;
};

const THEMES: Record<TemplateVariant, Theme> = {
  beauty: {
    brand: 'Atelier',
    headline: 'Glow, naturally.',
    bg: '#FBF4F1',
    ink: '#3A2A2E',
    accent: '#D98BA3',
    accent2: '#F3D5D8',
    buttonInk: '#ffffff',
    layout: 'split',
    radius: '50% 50% 4% 4% / 38% 38% 4% 4%',
  },
  construction: {
    brand: 'Foundry',
    headline: 'Built to last.',
    bg: '#F3F4F6',
    ink: '#14181F',
    accent: '#F59E0B',
    accent2: '#1F2937',
    buttonInk: '#14181F',
    layout: 'bold',
    radius: '0.6cqw',
  },
  photography: {
    brand: 'Aperture',
    headline: 'Light, caught.',
    bg: '#0E0E10',
    ink: '#FFFFFF',
    accent: '#E5E5E5',
    accent2: '#3B3B44',
    buttonInk: '#0E0E10',
    layout: 'gallery',
    radius: '0.8cqw',
  },
  consulting: {
    brand: 'Meridian',
    headline: 'Clarity for what is next.',
    bg: '#FFFFFF',
    ink: '#0B1020',
    accent: '#2563EB',
    accent2: '#E0E7FF',
    buttonInk: '#ffffff',
    layout: 'center',
    radius: '1.4cqw',
  },
  fitness: {
    brand: 'Pulse',
    headline: 'Train harder.',
    bg: '#0B0B12',
    ink: '#FFFFFF',
    accent: '#A3E635',
    accent2: '#7C3AED',
    buttonInk: '#0B0B12',
    layout: 'bold',
    radius: '1.2cqw',
  },
  restaurant: {
    brand: 'Saffron',
    headline: 'Fresh from the oven.',
    bg: '#FFF8EC',
    ink: '#3B2412',
    accent: '#C2410C',
    accent2: '#FDE7C2',
    buttonInk: '#ffffff',
    layout: 'split',
    radius: '2cqw',
  },
};

const GALLERY_TILES = [
  'linear-gradient(135deg,#6b7280,#111827)',
  'linear-gradient(135deg,#f59e0b,#7c2d12)',
  'linear-gradient(135deg,#38bdf8,#1e3a8a)',
  'linear-gradient(135deg,#a78bfa,#312e81)',
  'linear-gradient(135deg,#34d399,#064e3b)',
  'linear-gradient(135deg,#fb7185,#4c0519)',
];

const bar = (w: string, h: string, color: string, opacity = 0.25): CSSProperties => ({
  width: w,
  height: h,
  borderRadius: h,
  background: color,
  opacity,
});

function Picture({ t, style }: { t: Theme; style?: CSSProperties }) {
  return (
    <div
      style={{
        background: `linear-gradient(145deg, ${t.accent2}, ${t.accent})`,
        borderRadius: t.radius,
        position: 'relative',
        overflow: 'hidden',
        ...style,
      }}
    >
      <span
        style={{
          position: 'absolute',
          width: '55%',
          aspectRatio: '1',
          right: '-12%',
          top: '-14%',
          borderRadius: '50%',
          background: '#ffffff',
          opacity: 0.28,
        }}
      />
      <span
        style={{
          position: 'absolute',
          width: '38%',
          aspectRatio: '1',
          left: '10%',
          bottom: '-12%',
          borderRadius: '50%',
          background: t.bg,
          opacity: 0.35,
        }}
      />
    </div>
  );
}

function DesktopSite({ t }: { t: Theme }) {
  const nav = (
    <div
      style={{ height: '7cqw', padding: '0 3.5cqw' }}
      className="flex items-center justify-between"
    >
      <div className="flex items-center" style={{ gap: '1cqw' }}>
        <span style={{ width: '2.4cqw', height: '2.4cqw', borderRadius: '50%', background: t.accent }} />
        <span style={{ fontSize: '2cqw', fontWeight: 700 }}>{t.brand}</span>
      </div>
      <div className="flex items-center" style={{ gap: '2.5cqw' }}>
        {[0, 1, 2].map((i) => (
          <span key={i} style={bar('5cqw', '0.9cqw', t.ink)} />
        ))}
        <span style={{ width: '9cqw', height: '3.2cqw', borderRadius: '2cqw', background: t.accent }} />
      </div>
    </div>
  );

  const headline = (size: string, align: 'left' | 'center' = 'left') => (
    <div style={{ fontSize: size, fontWeight: 700, lineHeight: 1.04, letterSpacing: '-0.02em', textAlign: align }}>
      {t.headline}
    </div>
  );

  const subtext = (align: 'left' | 'center' = 'left') => (
    <div
      className="flex flex-col"
      style={{ gap: '0.9cqw', marginTop: '2cqw', alignItems: align === 'center' ? 'center' : 'flex-start' }}
    >
      <span style={bar('30cqw', '1cqw', t.ink)} />
      <span style={bar('24cqw', '1cqw', t.ink)} />
    </div>
  );

  const button = (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        marginTop: '2.6cqw',
        padding: '0 3cqw',
        height: '4.4cqw',
        borderRadius: '3cqw',
        background: t.accent,
        color: t.buttonInk,
        fontSize: '1.6cqw',
        fontWeight: 700,
      }}
    >
      Get started
    </span>
  );

  const cards = (
    <>
      <div className="grid grid-cols-3" style={{ gap: '1.6cqw', padding: '0 3.5cqw' }}>
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            style={{
              height: '11cqw',
              borderRadius: '1.2cqw',
              background: t.ink,
              opacity: 0.07,
              padding: '1.6cqw',
            }}
          />
        ))}
      </div>
      <div style={{ margin: '3cqw 3.5cqw 0', display: 'flex', gap: '1.4cqw', alignItems: 'center' }}>
        <span style={bar('10cqw', '1cqw', t.ink, 0.3)} />
        <span style={bar('7cqw', '1cqw', t.ink, 0.15)} />
        <span style={bar('7cqw', '1cqw', t.ink, 0.15)} />
      </div>
    </>
  );

  if (t.layout === 'split') {
    return (
      <>
        {nav}
        <div className="grid grid-cols-2 items-center" style={{ padding: '2cqw 3.5cqw 3cqw', gap: '3cqw' }}>
          <div>
            {headline('5.6cqw')}
            {subtext()}
            {button}
          </div>
          <Picture t={t} style={{ aspectRatio: '1 / 0.72' }} />
        </div>
        {cards}
      </>
    );
  }

  if (t.layout === 'center') {
    return (
      <>
        {nav}
        <div className="flex flex-col items-center text-center" style={{ padding: '3cqw 12cqw 3cqw' }}>
          {headline('5.6cqw', 'center')}
          {subtext('center')}
          {button}
        </div>
        {cards}
      </>
    );
  }

  if (t.layout === 'bold') {
    return (
      <>
        <div style={{ background: t.accent2, color: '#fff', minHeight: '40cqw' }}>
          <div style={{ color: '#fff' }}>{nav}</div>
          <div className="grid grid-cols-[1.2fr_1fr] items-center" style={{ padding: '3cqw 3.5cqw 4cqw', gap: '3cqw' }}>
            <div>
              {headline('6.4cqw')}
              <div className="flex flex-col" style={{ gap: '0.9cqw', marginTop: '2cqw' }}>
                <span style={bar('28cqw', '1cqw', '#fff', 0.45)} />
                <span style={bar('22cqw', '1cqw', '#fff', 0.45)} />
              </div>
              {button}
            </div>
            <div
              style={{
                width: '68%',
                justifySelf: 'center',
                aspectRatio: '1',
                borderRadius: '50%',
                background: `radial-gradient(circle at 30% 30%, ${t.accent}, ${t.accent2} 70%)`,
                border: `0.8cqw solid ${t.accent}`,
              }}
            />
          </div>
        </div>
        <div style={{ height: '2.4cqw' }} />
        {cards}
      </>
    );
  }

  // gallery
  return (
    <>
      {nav}
      <div style={{ padding: '1cqw 3.5cqw 0' }} className="flex items-end justify-between">
        {headline('4.4cqw')}
        <span style={bar('14cqw', '1cqw', t.ink, 0.4)} />
      </div>
      <div className="grid grid-cols-3" style={{ gap: '1.2cqw', padding: '2.4cqw 3.5cqw 0' }}>
        {GALLERY_TILES.map((background, i) => (
          <div key={i} style={{ background, borderRadius: t.radius, aspectRatio: '4 / 3' }} />
        ))}
      </div>
    </>
  );
}

function MobileSite({ t }: { t: Theme }) {
  return (
    <>
      <div style={{ height: '14cqw', padding: '0 5cqw' }} className="flex items-center justify-between">
        <div className="flex items-center" style={{ gap: '2cqw' }}>
          <span style={{ width: '5cqw', height: '5cqw', borderRadius: '50%', background: t.accent }} />
          <span style={{ fontSize: '4.6cqw', fontWeight: 700 }}>{t.brand}</span>
        </div>
        <div className="flex flex-col" style={{ gap: '1.2cqw' }}>
          <span style={bar('6cqw', '0.8cqw', t.ink, 0.7)} />
          <span style={bar('6cqw', '0.8cqw', t.ink, 0.7)} />
        </div>
      </div>
      <div style={{ padding: '4cqw 5cqw 0' }}>
        <div style={{ fontSize: '9.6cqw', fontWeight: 700, lineHeight: 1.04, letterSpacing: '-0.02em' }}>
          {t.headline}
        </div>
        <div className="flex flex-col" style={{ gap: '2cqw', marginTop: '4cqw' }}>
          <span style={bar('70cqw', '2cqw', t.ink)} />
          <span style={bar('52cqw', '2cqw', t.ink)} />
        </div>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            marginTop: '5cqw',
            padding: '0 6cqw',
            height: '10cqw',
            borderRadius: '6cqw',
            background: t.accent,
            color: t.buttonInk,
            fontSize: '3.8cqw',
            fontWeight: 700,
          }}
        >
          Get started
        </span>
      </div>
      <div style={{ padding: '6cqw 5cqw 0' }}>
        {t.layout === 'gallery' ? (
          <div className="grid grid-cols-2" style={{ gap: '2cqw' }}>
            {GALLERY_TILES.slice(0, 4).map((background, i) => (
              <div key={i} style={{ background, borderRadius: '2cqw', aspectRatio: '1' }} />
            ))}
          </div>
        ) : (
          <Picture t={t} style={{ aspectRatio: '1.2', borderRadius: '4cqw' }} />
        )}
      </div>
    </>
  );
}

/** A miniature website. */
export function SiteMock({
  variant,
  device = 'desktop',
}: {
  variant: TemplateVariant;
  device?: 'desktop' | 'mobile';
}) {
  const t = THEMES[variant];
  return (
    <div style={{ containerType: 'inline-size' }}>
      <div
        style={{
          background: t.bg,
          color: t.ink,
          aspectRatio: device === 'desktop' ? '16 / 10' : '9 / 17',
          overflow: 'hidden',
          fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
        }}
      >
        {device === 'desktop' ? <DesktopSite t={t} /> : <MobileSite t={t} />}
      </div>
    </div>
  );
}

export function DesktopFrame({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`overflow-hidden rounded-xl border border-midnight/10 bg-white shadow-2xl shadow-midnight/15 ${className}`}
    >
      <div className="flex h-7 items-center gap-1.5 border-b border-midnight/10 bg-cloud px-3">
        <span className="h-2 w-2 rounded-full bg-midnight/15" />
        <span className="h-2 w-2 rounded-full bg-midnight/15" />
        <span className="h-2 w-2 rounded-full bg-midnight/15" />
        <span className="ml-3 h-3 w-1/3 rounded-full bg-midnight/10" />
      </div>
      {children}
    </div>
  );
}

export function PhoneFrame({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`overflow-hidden rounded-[1.6rem] border-[5px] border-midnight bg-midnight shadow-2xl shadow-midnight/25 ${className}`}
    >
      <div className="overflow-hidden rounded-[1.1rem]">{children}</div>
    </div>
  );
}

/** Desktop + overlapping phone, used on the homepage and templates. */
export function DevicePair({
  variant,
  label,
  className = '',
}: {
  variant: TemplateVariant;
  label: string;
  className?: string;
}) {
  return (
    <div role="img" aria-label={label} className={`relative ${className}`}>
      <DesktopFrame>
        <SiteMock variant={variant} />
      </DesktopFrame>
      <div className="absolute -bottom-5 right-[-2%] w-[24%] min-w-[64px]">
        <PhoneFrame>
          <SiteMock variant={variant} device="mobile" />
        </PhoneFrame>
      </div>
    </div>
  );
}

const SWATCHES = ['#7C3AED', '#2563EB', '#C4B5FD', '#0B1020'];

/** Concept illustration of the planned editor. Not an operational editor. */
export function EditorMock({ className = '' }: { className?: string }) {
  const row = (text: string, active = false) => (
    <div
      key={text}
      style={{
        padding: '0.9cqw 1.4cqw',
        borderRadius: '1cqw',
        fontSize: '1.5cqw',
        fontWeight: active ? 700 : 500,
        background: active ? 'rgba(124,58,237,0.12)' : 'transparent',
        color: active ? '#7C3AED' : 'rgba(11,16,32,0.7)',
      }}
    >
      {text}
    </div>
  );
  const label = (text: string) => (
    <div style={{ fontSize: '1.2cqw', fontWeight: 700, letterSpacing: '0.1em', color: 'rgba(11,16,32,0.45)', textTransform: 'uppercase', margin: '1.6cqw 0 0.8cqw' }}>
      {text}
    </div>
  );

  return (
    <div
      role="img"
      aria-label="Concept illustration of the planned Saitify editor: a page list on the left, a website preview in the middle and design settings on the right."
      className={className}
    >
      <DesktopFrame>
        <div style={{ containerType: 'inline-size' }}>
          <div style={{ fontFamily: 'system-ui, sans-serif', color: '#0B1020', background: '#fff' }}>
            {/* toolbar */}
            <div className="flex items-center justify-between border-b border-midnight/10" style={{ height: '5.6cqw', padding: '0 2cqw' }}>
              <div className="flex items-center" style={{ gap: '1.2cqw' }}>
                <span style={{ width: '2.6cqw', height: '2.6cqw', borderRadius: '0.8cqw', background: 'linear-gradient(135deg,#7C3AED,#2563EB)' }} />
                <span style={{ fontSize: '1.6cqw', fontWeight: 700 }}>My business</span>
              </div>
              <div className="flex items-center" style={{ gap: '1cqw' }}>
                {['Desktop', 'Tablet', 'Mobile'].map((d, i) => (
                  <span
                    key={d}
                    className="hidden sm:inline-block"
                    style={{
                      padding: '0.6cqw 1.4cqw',
                      borderRadius: '2cqw',
                      fontSize: '1.3cqw',
                      fontWeight: 600,
                      background: i === 0 ? '#0B1020' : 'rgba(11,16,32,0.06)',
                      color: i === 0 ? '#fff' : 'rgba(11,16,32,0.6)',
                    }}
                  >
                    {d}
                  </span>
                ))}
              </div>
              <span style={{ padding: '0.9cqw 2cqw', borderRadius: '2cqw', fontSize: '1.4cqw', fontWeight: 700, color: '#fff', background: 'linear-gradient(90deg,#7C3AED,#2563EB)' }}>
                Publish
              </span>
            </div>
            <div className="flex" style={{ minHeight: '36cqw' }}>
              {/* left sidebar */}
              <div className="hidden border-r border-midnight/10 sm:block" style={{ width: '19cqw', padding: '1.6cqw' }}>
                {label('Pages')}
                {row('Home', true)}
                {row('About')}
                {row('Services')}
                {row('Contact')}
                {label('Sections')}
                {row('Hero')}
                {row('Features')}
                {row('Testimonials')}
              </div>
              {/* canvas */}
              <div className="flex flex-1 items-center justify-center bg-cloud" style={{ padding: '2.4cqw' }}>
                <div className="w-full overflow-hidden rounded-lg border border-midnight/10 shadow-lg shadow-midnight/10">
                  <SiteMock variant="consulting" />
                </div>
              </div>
              {/* right panel */}
              <div className="hidden border-l border-midnight/10 sm:block" style={{ width: '21cqw', padding: '1.6cqw' }}>
                {label('Design')}
                <div style={{ fontSize: '1.4cqw', fontWeight: 600, marginBottom: '0.8cqw' }}>Colors</div>
                <div className="flex" style={{ gap: '1cqw' }}>
                  {SWATCHES.map((c) => (
                    <span key={c} style={{ width: '3cqw', height: '3cqw', borderRadius: '50%', background: c, border: '1px solid rgba(11,16,32,0.1)' }} />
                  ))}
                </div>
                <div style={{ fontSize: '1.4cqw', fontWeight: 600, margin: '2cqw 0 0.8cqw' }}>Font</div>
                <div style={{ border: '1px solid rgba(11,16,32,0.12)', borderRadius: '1cqw', padding: '1cqw 1.4cqw', fontSize: '1.5cqw' }}>Modern sans</div>
                <div style={{ fontSize: '1.4cqw', fontWeight: 600, margin: '2cqw 0 1cqw' }}>Corners</div>
                <div style={{ height: '0.8cqw', borderRadius: '1cqw', background: 'rgba(11,16,32,0.1)', position: 'relative' }}>
                  <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '60%', borderRadius: '1cqw', background: '#7C3AED' }} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </DesktopFrame>
    </div>
  );
}

/* ---------- Small illustrations for the Features page ---------- */

const card = 'mx-auto w-full max-w-md rounded-2xl border border-midnight/10 bg-white p-5 shadow-xl shadow-midnight/5 sm:p-6';

export function IllustrationCreation() {
  return (
    <div role="img" aria-label="Illustration: a short form asking for a business name and what the business offers." className={card}>
      {['Business name', 'What you offer', 'How people reach you'].map((l, i) => (
        <div key={l} className={i ? 'mt-4' : ''}>
          <div className="text-xs font-semibold text-midnight/60">{l}</div>
          <div className="mt-1.5 h-10 rounded-lg border border-midnight/15 bg-cloud" />
        </div>
      ))}
      <div className="mt-5 h-10 w-32 rounded-full bg-gradient-to-r from-violet to-blue" />
    </div>
  );
}

export function IllustrationDesign() {
  return (
    <div role="img" aria-label="Illustration: color swatches, a font sample and a corner radius control." className={card}>
      <div className="text-xs font-semibold text-midnight/60">Colors</div>
      <div className="mt-2 flex gap-3">
        {SWATCHES.map((c) => (
          <span key={c} className="h-9 w-9 rounded-full border border-midnight/10" style={{ background: c }} />
        ))}
      </div>
      <div className="mt-5 text-xs font-semibold text-midnight/60">Font</div>
      <div className="mt-2 flex items-end gap-4">
        <span className="text-4xl font-semibold text-midnight">Aa</span>
        <span className="font-serif text-4xl text-midnight">Aa</span>
      </div>
      <div className="mt-5 text-xs font-semibold text-midnight/60">Corners</div>
      <div className="mt-2 flex gap-3">
        <span className="h-10 w-16 rounded-none border-2 border-violet" />
        <span className="h-10 w-16 rounded-lg border-2 border-violet" />
        <span className="h-10 w-16 rounded-full border-2 border-violet" />
      </div>
    </div>
  );
}

export function IllustrationPages() {
  return (
    <div role="img" aria-label="Illustration: a list of pages, each with its sections." className={card}>
      {[
        ['Home', ['Hero', 'Features', 'Contact']],
        ['About', ['Story', 'Team']],
        ['Services', ['List', 'Pricing']],
      ].map(([page, sections], i) => (
        <div key={page as string} className={i ? 'mt-4' : ''}>
          <div className="text-sm font-semibold text-midnight">{page as string}</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {(sections as string[]).map((s) => (
              <span key={s} className="rounded-full bg-violet/10 px-3 py-1 text-xs font-medium text-violet">
                {s}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function IllustrationResponsive() {
  return <DevicePair variant="consulting" label="Illustration: one website shown on a desktop screen and on a phone." />;
}

export function IllustrationPublish() {
  return (
    <div role="img" aria-label="Illustration: a browser address bar showing an example web address." className={card}>
      <div className="flex items-center gap-2 rounded-full border border-midnight/15 bg-cloud px-4 py-3">
        <span className="h-2.5 w-2.5 rounded-full bg-violet" />
        <span className="truncate text-sm text-midnight/70">www.yourbusiness.com</span>
      </div>
      <div className="mt-4 text-xs text-midnight/50">Example address</div>
      <div className="mt-5 h-10 w-36 rounded-full bg-gradient-to-r from-violet to-blue" />
    </div>
  );
}

export function IllustrationManagement() {
  return (
    <div role="img" aria-label="Illustration: a checklist of changes a website owner can make." className={card}>
      {['Edit your text', 'Replace images', 'Change colors', 'Add a page'].map((l, i) => (
        <div key={l} className={`flex items-center gap-3 ${i ? 'mt-3.5 border-t border-midnight/5 pt-3.5' : ''}`}>
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue/10 text-blue">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
              <path d="M2.5 6.5l2.5 2.5 4.5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <span className="text-sm font-medium text-midnight">{l}</span>
        </div>
      ))}
    </div>
  );
}

export function IllustrationTemplates() {
  const items: TemplateVariant[] = ['beauty', 'consulting', 'restaurant', 'photography'];
  return (
    <div role="img" aria-label="Illustration: a grid of four website design previews." className="grid grid-cols-2 gap-3">
      {items.map((v) => (
        <div key={v} className="overflow-hidden rounded-lg border border-midnight/10 shadow-md shadow-midnight/5">
          <SiteMock variant={v} />
        </div>
      ))}
    </div>
  );
}
