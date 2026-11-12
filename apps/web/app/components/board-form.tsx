import { Form, useNavigation } from 'react-router';
import { isoToLocalInput } from '~/lib/time';
import { Field, Notice, useRoot } from './ui';

export interface BoardFormValues {
  title: string;
  announce: string;
  startAt: string;
  endAt: string;
  allowJoin: boolean;
  /** Already formatted for the textareas. */
  users: string;
  problems: string;
}

/** Shared by the "new scoreboard" and "edit scoreboard" pages; parsed by `parseBoardForm`. */
export function BoardForm({
  values,
  result,
  submitLabel,
}: {
  values: BoardFormValues;
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
      <Field label="Announcement" hint="Markdown; shown above the table.">
        <textarea className="input code" name="announce" rows={5} defaultValue={values.announce} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Count submissions from" hint={`Times are in ${timeZone}.`}>
          <input className="input" type="datetime-local" name="startAt" defaultValue={isoToLocalInput(values.startAt, timeZone)} required />
        </Field>
        <Field label="Until">
          <input className="input" type="datetime-local" name="endAt" defaultValue={isoToLocalInput(values.endAt, timeZone)} required />
        </Field>
      </div>
      <Field label="Problems" hint='One per line: "<problem id> [note]". Columns appear in this order.'>
        <textarea className="input code" name="problems" rows={6} placeholder={'12\n15 warm-up\n9'} defaultValue={values.problems} />
      </Field>
      <Field label="Users" hint="Numeric user ids, separated by spaces, commas or new lines.">
        <textarea className="input code" name="users" rows={4} placeholder="3, 8, 21" defaultValue={values.users} />
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="allowJoin" defaultChecked={values.allowJoin} />
        Let users add themselves to this scoreboard
      </label>
      <button className="btn btn-primary" disabled={busy}>
        {busy ? 'Saving…' : submitLabel}
      </button>
    </Form>
  );
}
