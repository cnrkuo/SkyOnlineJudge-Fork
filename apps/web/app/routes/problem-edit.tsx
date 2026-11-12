import { AccessLevel, ScoreMode } from '@skyoj/contract';
import { Form, useNavigation, useSubmit } from 'react-router';
import { idParam } from '~/lib/params';
import { Button, ButtonLink, Card, CardBody, CheckField, Cluster, Control, css, Empty, Field, Grid, Muted, Notice, PageHeader, Split, Stack } from '~/ui';
import { DataTable, type Column } from '~/ui/data-table';
import { Confirm } from '~/ui/overlays';
import { api, load, submit, type ActionResult } from '~/lib/api.server';
import type { Route } from './+types/problem-edit';

export async function loader({ request, params }: Route.LoaderArgs) {
  const id = idParam(params.id);
  const problem = await load(request, (o) => api.problem.get({ id }, o));
  if (!problem.canEdit) throw new Response('You may not edit this problem', { status: 403 });
  const [testcases, attachments] = await Promise.all([
    load(request, (o) => api.problem.listTestcases({ problemId: id }, o)),
    load(request, (o) => api.problem.listAttachments({ problemId: id }, o)),
  ]);
  return { problem, testcases, attachments };
}

const ACCESS_OPTIONS = [
  [AccessLevel.OPEN, 'Everyone'],
  [AccessLevel.ADMIN, 'Administrators'],
  [AccessLevel.HIDDEN, 'Only me and higher-ranked admins'],
] as const;

function parseAccess(value: FormDataEntryValue | null): AccessLevel {
  return ACCESS_OPTIONS.find(([level]) => String(level) === value)?.[0] ?? AccessLevel.HIDDEN;
}

/** One subtask per line: `<points> <testcase count>`. */
function parseScoreGroups(text: string): [number, number][] | null {
  const groups: [number, number][] = [];
  for (const line of text.split('\n').map((l) => l.trim()).filter(Boolean)) {
    const [points, count, ...rest] = line.split(/[\s,]+/).map(Number);
    if (rest.length || points === undefined || count === undefined || !(points >= 0) || !Number.isInteger(count) || count < 1) {
      return null;
    }
    groups.push([points, count]);
  }
  return groups;
}

type Feedback = { intent: string; message?: string } & ({ ok: true } | { ok: false; error: string });

function feedback(intent: string, result: ActionResult<unknown>, message: string): Feedback {
  return result.ok ? { intent, ok: true, message } : { intent, ok: false, error: result.error };
}

export async function action({ request, params }: Route.ActionArgs): Promise<Feedback> {
  const problemId = idParam(params.id);
  const form = await request.formData();
  const intent = String(form.get('intent'));
  const file = form.get('file');

  switch (intent) {
    case 'save': {
      const scoreGroups = parseScoreGroups(String(form.get('scoreGroups') ?? ''));
      if (!scoreGroups) {
        return { intent, ok: false, error: 'Subtasks must be written one per line as "<points> <testcase count>"' };
      }
      const result = await submit(request, (o) =>
        api.problem.update(
          {
            id: problemId,
            title: String(form.get('title') ?? ''),
            content: String(form.get('content') ?? ''),
            contentAccess: parseAccess(form.get('contentAccess')),
            codeviewAccess: parseAccess(form.get('codeviewAccess')),
            submitOpen: form.get('submitOpen') === 'on',
            timeLimitMs: Number(form.get('timeLimitMs')),
            memoryLimitKb: Math.round(Number(form.get('memoryLimitMb')) * 1024),
            scoreMode: form.get('scoreMode') === ScoreMode.GROUP_MIN ? ScoreMode.GROUP_MIN : ScoreMode.AVERAGE,
            scoreGroups,
          },
          o,
        ),
      );
      return feedback(intent, result, 'Problem saved.');
    }
    case 'testdata': {
      if (!(file instanceof File) || file.size === 0) return { intent, ok: false, error: 'Choose a zip archive first' };
      const result = await submit(request, (o) => api.problem.uploadTestdata({ problemId, archive: file }, o));
      return feedback(intent, result, result.ok ? `Uploaded — the problem now has ${result.data.testcases} testcases.` : '');
    }
    case 'clear-testdata':
      return feedback('testdata', await submit(request, (o) => api.problem.clearTestdata({ problemId }, o)), 'All testcases removed.');
    case 'attach': {
      if (!(file instanceof File) || file.size === 0) return { intent, ok: false, error: 'Choose a file first' };
      return feedback(intent, await submit(request, (o) => api.problem.uploadAttachment({ problemId, file }, o)), `Uploaded ${file.name}.`);
    }
    case 'detach': {
      const name = String(form.get('name'));
      return feedback('attach', await submit(request, (o) => api.problem.deleteAttachment({ problemId, name }, o)), `Deleted ${name}.`);
    }
    case 'rejudge': {
      const result = await submit(request, (o) => api.submission.rejudgeProblem({ problemId }, o));
      return feedback(intent, result, result.ok ? `Queued ${result.data.count} submissions for rejudging.` : '');
    }
    default:
      return { intent, ok: false, error: 'Unknown action' };
  }
}

export const meta: Route.MetaFunction = ({ loaderData }) => [{ title: `Edit: ${loaderData?.problem.title ?? 'problem'}` }];

type Testcase = Route.ComponentProps['loaderData']['testcases'][number];

const testcaseColumns: Column<Testcase>[] = [
  { id: 'n', header: '#', cell: (t) => t.ordinal + 1 },
  { id: 'name', header: 'Name', cell: (t) => <code>{t.name}</code> },
  { id: 'input', header: 'Input', align: 'right', cell: (t) => `${t.inputSize} B` },
  { id: 'answer', header: 'Answer', align: 'right', cell: (t) => `${t.outputSize} B` },
];

export default function ProblemEdit({ loaderData, actionData }: Route.ComponentProps) {
  const { problem, testcases, attachments } = loaderData;
  const navigation = useNavigation();
  const submit = useSubmit();
  const pending = navigation.state !== 'idle' ? String(navigation.formData?.get('intent') ?? '') : '';
  const noticeFor = (intent: string) => (actionData?.intent === intent ? <Notice result={actionData} /> : null);

  return (
    <>
      <PageHeader title={`Edit problem #${problem.id}`} actions={<ButtonLink to={`/problems/${problem.id}`}>View problem</ButtonLink>} />
      <Split aside="wide">
        <Card title="Statement and settings">
          <Form method="post">
            <Stack>
              <input type="hidden" name="intent" value="save" />
              {noticeFor('save')}
              <Field label="Title">
                <input name="title" defaultValue={problem.title} maxLength={200} required />
              </Field>
              <Field
                label="Statement"
                hint={
                  <>
                    Markdown with GitHub extensions, TeX math (<code>$x^2$</code>, <code>$$…$$</code>) and highlighted code
                    blocks. Reference attachments by file name, e.g. <code>![figure](figure.png)</code>.
                  </>
                }
              >
                <textarea className={css.monoInput} name="content" rows={22} defaultValue={problem.content} spellCheck={false} />
              </Field>

              <Grid columns={2}>
                <Field label="Statement visible to">
                  <select name="contentAccess" defaultValue={problem.contentAccess}>
                    {ACCESS_OPTIONS.map(([level, label]) => (
                      <option key={level} value={level}>
                        {label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Other users' source code visible to" hint="Authors and administrators can always read it.">
                  <select name="codeviewAccess" defaultValue={problem.codeviewAccess}>
                    <option value={AccessLevel.OPEN}>Everyone</option>
                    <option value={AccessLevel.HIDDEN}>Nobody else</option>
                  </select>
                </Field>
                <Field label="Time limit (ms)" hint="CPU time per testcase.">
                  <input name="timeLimitMs" type="number" min={100} max={60000} step={100} defaultValue={problem.timeLimitMs} required />
                </Field>
                <Field label="Memory limit (MB)">
                  <input name="memoryLimitMb" type="number" min={4} max={4096} defaultValue={Math.round(problem.memoryLimitKb / 1024)} required />
                </Field>
                <Field label="Scoring">
                  <select name="scoreMode" defaultValue={problem.scoreMode}>
                    <option value={ScoreMode.AVERAGE}>Average — 100 × passed ÷ total</option>
                    <option value={ScoreMode.GROUP_MIN}>Subtasks — a group scores only if all its testcases pass</option>
                  </select>
                </Field>
                <Field label="Subtasks" hint='One per line: "<points> <testcase count>", in testcase order. Used by subtask scoring.'>
                  <textarea
                    className={css.monoInput}
                    name="scoreGroups"
                    rows={3}
                    placeholder={'40 2\n60 3'}
                    defaultValue={problem.scoreGroups.map(([points, count]) => `${points} ${count}`).join('\n')}
                  />
                </Field>
              </Grid>

              <CheckField name="submitOpen" defaultChecked={problem.submitOpen} label="Open for submissions outside contests" />
              <div>
                <Button busy={pending === 'save'}>Save</Button>
              </div>
            </Stack>
          </Form>
        </Card>

        <Stack gap="lg">
          <Card flush title={`Testcases (${testcases.length})`}>
            <CardBody>
              <Form method="post" encType="multipart/form-data">
                <Stack gap="sm">
                  {noticeFor('testdata')}
                  <input type="hidden" name="intent" value="testdata" />
                  <Control>
                    <input type="file" name="file" accept=".zip,application/zip" aria-label="Testdata archive" required />
                  </Control>
                  <small>
                    A zip of <code>name.in</code> + <code>name.ans</code> (or <code>.out</code>) pairs. Uploading adds to the existing
                    testcases and overwrites those with the same name; they run in natural order of their names.
                  </small>
                  <Cluster justify="between">
                    <Button variant="secondary" busy={pending === 'testdata'}>
                      Upload testcases
                    </Button>
                    {testcases.length > 0 && (
                      <Confirm
                        trigger={
                          <Button type="button" variant="danger">
                            Remove all
                          </Button>
                        }
                        title="Remove every testcase?"
                        confirmLabel="Remove all testcases"
                        onConfirm={() => submit({ intent: 'clear-testdata' }, { method: 'post' })}
                      >
                        Submissions to this problem will get a Judge Error until new testcases are uploaded.
                      </Confirm>
                    )}
                  </Cluster>
                </Stack>
              </Form>
            </CardBody>
            <DataTable
              data={testcases}
              columns={testcaseColumns}
              rowKey={(t) => t.id}
              empty={<Empty>No testcases yet — submissions will get a Judge Error.</Empty>}
            />
          </Card>

          <Card title="Attachments">
            <Stack gap="sm">
              {noticeFor('attach')}
              <Form method="post" encType="multipart/form-data">
                <Cluster>
                  <input type="hidden" name="intent" value="attach" />
                  <div className={css.grow}>
                    <Control>
                      <input type="file" name="file" aria-label="Attachment" required />
                    </Control>
                  </div>
                  <Button variant="secondary" busy={pending === 'attach'}>
                    Upload
                  </Button>
                </Cluster>
              </Form>
              {attachments.map((file) => (
                <Cluster key={file.name} justify="between">
                  <a href={`/problems/${problem.id}/attachments/${file.name}`}>{file.name}</a>
                  <Cluster>
                    <Muted small>{Math.ceil(file.size / 1024)} KB</Muted>
                    <Form method="post">
                      <input type="hidden" name="name" value={file.name} />
                      <Button variant="link" name="intent" value="detach" aria-label={`Delete ${file.name}`}>
                        Delete
                      </Button>
                    </Form>
                  </Cluster>
                </Cluster>
              ))}
            </Stack>
          </Card>

          <Card title="Rejudge">
            <Form method="post">
              <Stack gap="sm">
                {noticeFor('rejudge')}
                <Muted small>Puts every submission of this problem back into the judge queue.</Muted>
                <div>
                  <Button variant="secondary" name="intent" value="rejudge" busy={pending === 'rejudge'}>
                    Rejudge all submissions
                  </Button>
                </div>
              </Stack>
            </Form>
          </Card>
        </Stack>
      </Split>
    </>
  );
}
