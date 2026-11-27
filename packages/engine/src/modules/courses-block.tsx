import { z } from 'zod';
import { defineBlock } from '../registry/types';
import { Img } from '../render/parts';
import { text } from '../schema/common';
import { RichContent, videoEmbed } from './content';
import type { CourseOutline, CoursesData } from './data';
import { ActionFields, Empty, FormMessage, ModuleSection } from './ui';

const ACCESS: Record<string, string> = { free: 'Free', members: 'For members', approval: 'Enrollment on request' };

function Outline({ course, current }: { course: CourseOutline; current?: string }) {
  return (
    <nav className="sf-outline" aria-label="Course contents">
      {course.sections.map((s, i) => (
        <div key={`${s.title}-${i}`}>
          <p className="sf-outline-title">{s.title}</p>
          <ol>
            {s.lessons.map((l) => (
              <li key={l.slug} data-done={l.completed ? 'true' : undefined}>
                {l.href ? (
                  <a href={l.href} aria-current={current === l.slug ? 'page' : undefined}>
                    {l.completed ? <span className="sf-visually-hidden">Completed: </span> : null}
                    {l.title}
                  </a>
                ) : (
                  <span>
                    {l.title} <span className="sf-hint">(locked)</span>
                  </span>
                )}
                {l.preview && !course.enrollment ? <span className="sf-pill sf-pill--muted">Preview</span> : null}
              </li>
            ))}
          </ol>
        </div>
      ))}
    </nav>
  );
}

function Progress({ value }: { value: number }) {
  return (
    <p className="sf-progress-row">
      <span className="sf-progress" aria-hidden="true">
        <span style={{ width: `${value}%` }} />
      </span>
      <span>{value}% complete</span>
    </p>
  );
}

export const coursesBlock = defineBlock({
  type: 'courses',
  name: 'Online courses',
  description: 'Your course catalog, course pages with enrollment, and lessons with progress for enrolled learners.',
  category: 'content',
  region: 'page',
  module: 'courses',
  detail: true,
  variants: [{ id: 'cards', name: 'Cards', description: 'Course cards in a grid.' }],
  defaultVariant: 'cards',
  defaultTone: 'default',
  contentSchema: z.object({ heading: text(160).optional(), description: text(600).optional() }),
  defaultContent: { heading: 'Courses' },
  render(ctx) {
    const c = ctx.content;
    const r = ctx.route;
    const list = (ctx.data as CoursesData | undefined)?.mode === 'list' || ctx.data === undefined;
    return (
      <ModuleSection<CoursesData> ctx={ctx} block="courses" heading={list ? c.heading : undefined} description={list ? c.description : undefined}>
        {(d) => {
          if (d.mode === 'list') {
            return d.courses.length === 0 ? (
              <Empty>No courses are available yet.</Empty>
            ) : (
              <ul className="sf-grid sf-grid--3">
                {d.courses.map((co) => (
                  <li key={co.slug} className="sf-card">
                    {co.cover ? <Img image={co.cover} ratio="landscape" /> : null}
                    <div className="sf-item-body">
                      <p className="sf-meta">
                        {ACCESS[co.access]}
                        {co.priceText ? ` · ${co.priceText}` : ''} · {co.lessons} {co.lessons === 1 ? 'lesson' : 'lessons'}
                      </p>
                      <h3 className="sf-h3">
                        <a href={`${r.detailBase}/${co.slug}`}>{co.title}</a>
                      </h3>
                      {co.summary ? <p className="sf-muted">{co.summary}</p> : null}
                    </div>
                  </li>
                ))}
              </ul>
            );
          }
          const co = d.course;
          if (d.mode === 'lesson') {
            const embed = d.lesson.video ? videoEmbed(d.lesson.video) : null;
            return (
              <div className="sf-course-layout">
                <div className="sf-lesson">
                  <p>
                    <a className="sf-back" href={`${r.detailBase}/${co.slug}`}>
                      ← {co.title}
                    </a>
                  </p>
                  <h1 className="sf-h2">{d.lesson.title}</h1>
                  {embed ? (
                    <div className="sf-video">
                      <iframe src={embed} title={`Video: ${d.lesson.title}`} loading="lazy" allow="encrypted-media; picture-in-picture" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />
                    </div>
                  ) : null}
                  <RichContent blocks={d.lesson.body} title={d.lesson.title} />
                  {d.lesson.downloads.length ? (
                    <ul className="sf-downloads" aria-label="Downloads">
                      {d.lesson.downloads.map((x) => (
                        <li key={x.href}>
                          <a href={x.href}>{x.label}</a>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  <div className="sf-lesson-nav">
                    {co.enrollment === 'active' ? (
                      <form method="post" action={d.action.url}>
                        <ActionFields action={d.action} />
                        <input type="hidden" name="course" value={co.slug} />
                        <input type="hidden" name="lesson" value={d.lesson.slug} />
                        <input type="hidden" name="done" value={d.lesson.completed ? '0' : '1'} />
                        <button type="submit" className={d.lesson.completed ? 'sf-btn sf-btn--secondary' : 'sf-btn sf-btn--primary'}>
                          {d.lesson.completed ? 'Mark as not completed' : 'Mark as completed'}
                        </button>
                      </form>
                    ) : null}
                    <span className="sf-lesson-links">
                      {d.prev ? <a href={d.prev}>← Previous</a> : null}
                      {d.next ? <a href={d.next}>Next →</a> : null}
                    </span>
                  </div>
                </div>
                <aside className="sf-card">
                  {co.enrollment === 'active' ? <Progress value={co.progress} /> : null}
                  <Outline course={co} current={d.lesson.slug} />
                </aside>
              </div>
            );
          }
          return (
            <div className="sf-course-layout">
              <article className="sf-article">
                <p>
                  <a className="sf-back" href={r.pageHref}>
                    ← All courses
                  </a>
                </p>
                <h1 className="sf-h1">{co.title}</h1>
                <p className="sf-meta">
                  {ACCESS[co.access]}
                  {co.priceText ? ` · ${co.priceText}` : ''}
                  {co.instructor ? ` · ${co.instructor}` : ''}
                </p>
                {co.cover ? <Img image={co.cover} ratio="wide" eager /> : null}
                {co.description ? (
                  <div className="sf-prose">
                    {co.description.split(/\n{2,}/).map((p, i) => (
                      <p key={i}>{p}</p>
                    ))}
                  </div>
                ) : null}
              </article>
              <aside className="sf-card sf-enroll">
                <FormMessage state={d.state} />
                {co.enrollment === 'active' ? (
                  <>
                    <Progress value={co.progress} />
                    {co.continueHref ? (
                      <a className="sf-btn sf-btn--primary" href={co.continueHref}>
                        {co.progress > 0 ? 'Continue learning' : 'Start the course'}
                      </a>
                    ) : null}
                  </>
                ) : co.enrollment === 'pending' ? (
                  <p className="sf-notice">Your enrollment is waiting for approval.</p>
                ) : co.canEnroll ? (
                  <form method="post" action={d.action.url}>
                    <ActionFields action={d.action} />
                    <input type="hidden" name="course" value={co.slug} />
                    <button type="submit" className="sf-btn sf-btn--primary">
                      {co.access === 'approval' ? 'Request enrollment' : 'Enroll'}
                    </button>
                  </form>
                ) : (
                  <>
                    <p className="sf-notice">{co.reason ?? 'Enrollment is not available.'}</p>
                    {co.loginHref ? (
                      <a className="sf-btn sf-btn--primary" href={co.loginHref}>
                        Sign in or join
                      </a>
                    ) : null}
                  </>
                )}
                <Outline course={co} />
              </aside>
            </div>
          );
        }}
      </ModuleSection>
    );
  },
});
