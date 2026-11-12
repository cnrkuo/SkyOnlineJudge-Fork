import { ContestStyle, RegisterType } from '@skyoj/contract';
import { Form, useNavigation } from 'react-router';
import { isoToLocalInput } from '~/lib/time';
import { Field, Notice, useRoot } from './ui';

export interface ContestFormValues {
  title: string;
  description: string;
  style: ContestStyle;
  startAt: string;
  endAt: string;
  registerType: RegisterType;
  registerPassword: string;
  freezeSec: number;
  penaltySec: number;
  /** Already formatted, one problem per line. */
  problems: string;
}

/** Shared by the "new contest" and "edit contest" pages; parsed by `parseContestForm`. */
export function ContestForm({
  values,
  result,
  submitLabel,
}: {
  values: ContestFormValues;
  result?: { ok: boolean; error?: string; message?: string } | null;
  submitLabel: string;
}) {
  const { timeZone } = useRoot();
  const busy = useNavigation().state === 'submitting';
  return (
    <Form method="post" className="card space-y-4 p-4">
      <Notice result={result} />
      <Field label="Title">
        <input className="input" name="title" defaultValue={values.title} maxLength={200} required />
      </Field>
      <Field label="Description" hint="Markdown; shown on the contest page to everyone.">
        <textarea className="input code" name="description" rows={6} defaultValue={values.description} />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Starts" hint={`Times are in ${timeZone}.`}>
          <input className="input" type="datetime-local" name="startAt" defaultValue={isoToLocalInput(values.startAt, timeZone)} required />
        </Field>
        <Field label="Ends">
          <input className="input" type="datetime-local" name="endAt" defaultValue={isoToLocalInput(values.endAt, timeZone)} required />
        </Field>
        <Field label="Rules">
          <select className="input" name="style" defaultValue={values.style}>
            <option value={ContestStyle.ICPC}>ICPC — solved count, then penalty time</option>
            <option value={ContestStyle.IOI}>IOI — sum of best scores</option>
          </select>
        </Field>
        <Field label="Penalty per rejected attempt (minutes)" hint="ICPC only.">
          <input className="input" type="number" name="penaltyMin" min={0} max={1440} defaultValue={Math.round(values.penaltySec / 60)} />
        </Field>
        <Field label="Registration">
          <select className="input" name="registerType" defaultValue={values.registerType}>
            <option value={RegisterType.OPEN}>Open to every user</option>
            <option value={RegisterType.PASSWORD}>Requires the contest password</option>
            <option value={RegisterType.PERMIT_REQUIRED}>Requires approval by an administrator</option>
            <option value={RegisterType.CLOSED}>Closed — administrators add participants</option>
          </select>
        </Field>
        <Field label="Contest password" hint="Only used with password registration.">
          <input className="input" name="registerPassword" defaultValue={values.registerPassword} maxLength={100} autoComplete="off" />
        </Field>
        <Field label="Scoreboard freeze (minutes before the end)" hint="0 disables freezing. The board unfreezes when the contest ends.">
          <input className="input" type="number" name="freezeMin" min={0} defaultValue={Math.round(values.freezeSec / 60)} />
        </Field>
      </div>

      <Field
        label="Problems"
        hint={
          <>
            One per line, in scoreboard order: <code>&lt;tag&gt; &lt;problem id&gt; [hidden|readonly]</code>. Participants can
            read and submit these problems during the contest even while they are hidden from the public list.
          </>
        }
      >
        <textarea className="input code" name="problems" rows={6} placeholder={'A 12\nB 15\nC 9 readonly'} defaultValue={values.problems} />
      </Field>
      <button className="btn btn-primary" disabled={busy}>
        {busy ? 'Saving…' : submitLabel}
      </button>
    </Form>
  );
}
