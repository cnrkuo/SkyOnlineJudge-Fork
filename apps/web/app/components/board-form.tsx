import { Form, useNavigation } from 'react-router';
import { isoToLocalInput } from '~/lib/time';
import { Button, Card, CheckField, css, Field, Grid, Notice, Stack, useRoot } from '~/ui';

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
    <Card>
      <Form method="post">
        <Stack>
          <Notice result={result} />
          <Field label="Title">
            <input name="title" defaultValue={values.title} maxLength={200} required />
          </Field>
          <Field label="Announcement" hint="Markdown; shown above the table.">
            <textarea className={css.monoInput} name="announce" rows={5} defaultValue={values.announce} />
          </Field>
          <Grid columns={2}>
            <Field label="Count submissions from" hint={`Times are in ${timeZone}.`}>
              <input
                type="datetime-local"
                name="startAt"
                defaultValue={isoToLocalInput(values.startAt, timeZone)}
                required
              />
            </Field>
            <Field label="Until" hint="Not included: submissions count up to this moment.">
              <input
                type="datetime-local"
                name="endAt"
                defaultValue={isoToLocalInput(values.endAt, timeZone)}
                required
              />
            </Field>
          </Grid>
          <Field label="Problems" hint='One per line: "<problem id> [note]". Columns appear in this order.'>
            <textarea
              className={css.monoInput}
              name="problems"
              rows={6}
              placeholder={'12\n15 warm-up\n9'}
              defaultValue={values.problems}
            />
          </Field>
          <Field label="Users" hint="Numeric user ids, separated by spaces, commas or new lines.">
            <textarea
              className={css.monoInput}
              name="users"
              rows={4}
              placeholder="3, 8, 21"
              defaultValue={values.users}
            />
          </Field>
          <CheckField
            name="allowJoin"
            defaultChecked={values.allowJoin}
            label="Let users add themselves to this scoreboard"
          />
          <div>
            <Button busy={busy}>{submitLabel}</Button>
          </div>
        </Stack>
      </Form>
    </Card>
  );
}
