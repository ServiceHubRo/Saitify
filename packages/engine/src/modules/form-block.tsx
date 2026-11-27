import { z } from 'zod';
import { defineBlock } from '../registry/types';
import { text } from '../schema/common';
import type { FormBlockData, FormFieldDef, FormState } from './data';
import { ActionFields, Field, FormMessage, ModuleSection } from './ui';

const schema = z.object({
  heading: text(160).optional(),
  description: text(600).optional(),
  /** Address (slug) of a form created in the Forms module. */
  form: z.string().trim().max(80).regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Choose a form').describe('ref:form'),
});

function Choice({ f, state, scope }: { f: FormFieldDef; state?: FormState; scope: string }) {
  const error = state?.errors[f.id];
  const chosen = new Set((state?.values[f.id] ?? '').split('\n').filter(Boolean));
  const type = f.type === 'radio' ? 'radio' : 'checkbox';
  return (
    <fieldset className={error ? 'sf-field sf-field--error' : 'sf-field'} aria-invalid={error ? true : undefined}>
      <legend>
        {f.label}
        {f.required ? <span className="sf-req" aria-hidden="true"> *</span> : null}
      </legend>
      <div className="sf-choices">
        {f.options.map((o, i) => (
          <label key={o} className="sf-choice">
            <input type={type} name={f.id} value={o} defaultChecked={chosen.has(o)} id={`f-${scope}-${f.id}-${i}`} />
            <span>{o}</span>
          </label>
        ))}
      </div>
      {error ? <p className="sf-field-error">{error}</p> : null}
    </fieldset>
  );
}

export function FormFields({ fields, state, scope }: { fields: FormFieldDef[]; state?: FormState; scope: string }) {
  return (
    <>
      {fields.map((f) => {
        if (f.type === 'radio' || f.type === 'multiselect') return <Choice key={f.id} f={f} state={state} scope={scope} />;
        if (f.type === 'checkbox') {
          const error = state?.errors[f.id];
          return (
            <div key={f.id} className={error ? 'sf-field sf-field--error' : 'sf-field'}>
              <label className="sf-choice">
                <input type="checkbox" name={f.id} value="yes" defaultChecked={state?.values[f.id] === 'yes'} required={f.required} />
                <span>
                  {f.label}
                  {f.required ? <span className="sf-req" aria-hidden="true"> *</span> : null}
                </span>
              </label>
              {error ? <p className="sf-field-error">{error}</p> : null}
            </div>
          );
        }
        const type = f.type === 'phone' ? 'tel' : f.type;
        return <Field key={f.id} scope={scope} name={f.id} label={f.label} type={type} required={f.required} placeholder={f.placeholder} options={f.options} state={state} autoComplete={f.type === 'email' ? 'email' : f.type === 'phone' ? 'tel' : undefined} />;
      })}
    </>
  );
}

export const formBlock = defineBlock({
  type: 'form',
  name: 'Form',
  description: 'A form from the Forms module: contact, inquiry or any custom form. Answers are stored in your dashboard.',
  category: 'contact',
  region: 'page',
  module: 'forms',
  variants: [
    { id: 'card', name: 'Card', description: 'The form on a card.' },
    { id: 'plain', name: 'Plain', description: 'The form directly on the section background.' },
  ],
  defaultVariant: 'card',
  defaultTone: 'surface',
  contentSchema: schema,
  defaultContent: { heading: 'Send us a message', form: 'contact' },
  render(ctx) {
    const c = ctx.content;
    return (
      <ModuleSection<FormBlockData> ctx={ctx} block="form" heading={c.heading} description={c.description}>
        {(d) =>
          !d.form ? (
            <p className="sf-empty">This form is not available right now.</p>
          ) : (
            <div className={ctx.variant === 'card' ? 'sf-card sf-form-card' : 'sf-form-card'}>
              {!c.heading ? <h2 className="sf-h3">{d.form.title}</h2> : null}
              {d.form.description ? <p className="sf-muted">{d.form.description}</p> : null}
              <FormMessage state={d.state} sent={d.sent} />
              {d.sent ? null : (
                <form className="sf-form" method="post" action={d.action.url} noValidate>
                  <ActionFields action={d.action} />
                  <FormFields fields={d.form.fields} state={d.state} scope={ctx.id} />
                  <button type="submit" className="sf-btn sf-btn--primary">
                    {d.form.submitLabel}
                  </button>
                </form>
              )}
            </div>
          )
        }
      </ModuleSection>
    );
  },
});
