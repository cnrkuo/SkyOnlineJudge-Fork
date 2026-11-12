import { AccessLevel, ScoreMode } from '@skyoj/contract';
import { Form, Link, useNavigation } from 'react-router';
import { Card, Empty, Field, idParam, Notice, PageHeader } from '~/components/ui';
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

export default function ProblemEdit({ loaderData, actionData }: Route.ComponentProps) {
  const { problem, testcases, attachments } = loaderData;
  const navigation = useNavigation();
  const pending = navigation.state !== 'idle' ? String(navigation.formData?.get('intent') ?? '') : '';
  const noticeFor = (intent: string) => (actionData?.intent === intent ? <Notice result={actionData} /> : null);

  return (
    <>
      <PageHeader
        title={`Edit problem #${problem.id}`}
        actions={
          <Link className="btn" to={`/problems/${problem.id}`}>
            View problem
          </Link>
        }
      />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <Card title="Statement and settings">
          <Form method="post" className="space-y-4 p-4">
            <input type="hidden" name="intent" value="save" />
            {noticeFor('save')}
            <Field label="Title">
              <input className="input" name="title" defaultValue={problem.title} maxLength={200} required />
            </Field>
            <Field
              label="Statement"
              hint={
                <>
                  Markdown with GitHub extensions and TeX math (<code>$x^2$</code>, <code>$$…$$</code>). Reference attachments by
                  file name, e.g. <code>![figure](figure.png)</code>.
                </>
              }
            >
              <textarea className="input code" name="content" rows={22} defaultValue={problem.content} spellCheck={false} />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Statement visible to">
                <select className="input" name="contentAccess" defaultValue={problem.contentAccess}>
                  {ACCESS_OPTIONS.map(([level, label]) => (
                    <option key={level} value={level}>
                      {label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Other users' source code visible to" hint="Authors and administrators can always read it.">
                <select className="input" name="codeviewAccess" defaultValue={problem.codeviewAccess}>
                  <option value={AccessLevel.OPEN}>Everyone</option>
                  <option value={AccessLevel.HIDDEN}>Nobody else</option>
                </select>
              </Field>
              <Field label="Time limit (ms)" hint="CPU time per testcase.">
                <input className="input" name="timeLimitMs" type="number" min={100} max={60000} step={100} defaultValue={problem.timeLimitMs} required />
              </Field>
              <Field label="Memory limit (MB)">
                <input className="input" name="memoryLimitMb" type="number" min={4} max={4096} defaultValue={Math.round(problem.memoryLimitKb / 1024)} required />
              </Field>
              <Field label="Scoring">
                <select className="input" name="scoreMode" defaultValue={problem.scoreMode}>
                  <option value={ScoreMode.AVERAGE}>Average — 100 × passed ÷ total</option>
                  <option value={ScoreMode.GROUP_MIN}>Subtasks — a group scores only if all its testcases pass</option>
                </select>
              </Field>
              <Field label="Subtasks" hint='One per line: "<points> <testcase count>", in testcase order. Used by subtask scoring.'>
                <textarea
                  className="input code"
                  name="scoreGroups"
                  rows={3}
                  placeholder={'40 2\n60 3'}
                  defaultValue={problem.scoreGroups.map(([points, count]) => `${points} ${count}`).join('\n')}
                />
              </Field>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="submitOpen" defaultChecked={problem.submitOpen} />
              Open for submissions outside contests
            </label>
            <button className="btn btn-primary" disabled={pending === 'save'}>
              {pending === 'save' ? 'Saving…' : 'Save'}
            </button>
          </Form>
        </Card>

        <div className="space-y-6">
          <Card title={`Testcases (${testcases.length})`}>
            <div className="space-y-3 p-4">
              {noticeFor('testdata')}
              <Form method="post" encType="multipart/form-data" className="space-y-2">
                <input type="hidden" name="intent" value="testdata" />
                <input className="input" type="file" name="file" accept=".zip,application/zip" aria-label="Testdata archive" required />
                <p className="hint">
                  A zip of <code>name.in</code> + <code>name.ans</code> (or <code>.out</code>) pairs. Uploading adds to the
                  existing testcases and overwrites those with the same name; they run in natural order of their names.
                </p>
                <button className="btn" disabled={pending === 'testdata'}>
                  {pending === 'testdata' ? 'Uploading…' : 'Upload testcases'}
                </button>
              </Form>
            </div>
            {testcases.length === 0 ? (
              <Empty>No testcases yet — submissions will get a Judge Error.</Empty>
            ) : (
              <div className="max-h-72 overflow-y-auto border-t border-line">
                <table className="table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Name</th>
                      <th className="num">Input</th>
                      <th className="num">Answer</th>
                    </tr>
                  </thead>
                  <tbody>
                    {testcases.map((testcase) => (
                      <tr key={testcase.id}>
                        <td className="tabular-nums">{testcase.ordinal + 1}</td>
                        <td className="code">{testcase.name}</td>
                        <td className="num">{testcase.inputSize} B</td>
                        <td className="num">{testcase.outputSize} B</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {testcases.length > 0 && (
              <Form method="post" className="border-t border-line p-3" onSubmit={(event) => confirm('Remove every testcase of this problem?') || event.preventDefault()}>
                <button className="btn btn-danger" name="intent" value="clear-testdata">
                  Remove all testcases
                </button>
              </Form>
            )}
          </Card>

          <Card title="Attachments">
            <div className="space-y-3 p-4">
              {noticeFor('attach')}
              <Form method="post" encType="multipart/form-data" className="flex flex-wrap items-center gap-2">
                <input type="hidden" name="intent" value="attach" />
                <input className="input min-w-0 flex-1" type="file" name="file" aria-label="Attachment" required />
                <button className="btn" disabled={pending === 'attach'}>
                  Upload
                </button>
              </Form>
              {attachments.length > 0 && (
                <ul className="space-y-1 text-sm">
                  {attachments.map((file) => (
                    <li key={file.name} className="flex items-center gap-2">
                      <a className="min-w-0 flex-1 truncate" href={`/problems/${problem.id}/attachments/${file.name}`}>
                        {file.name}
                      </a>
                      <span className="text-muted">{Math.ceil(file.size / 1024)} KB</span>
                      <Form method="post">
                        <input type="hidden" name="name" value={file.name} />
                        <button className="cursor-pointer text-bad hover:underline" name="intent" value="detach" aria-label={`Delete ${file.name}`}>
                          Delete
                        </button>
                      </Form>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>

          <Card title="Rejudge">
            <Form method="post" className="space-y-3 p-4">
              {noticeFor('rejudge')}
              <p className="text-sm text-muted">Puts every submission of this problem back into the judge queue.</p>
              <button className="btn" name="intent" value="rejudge" disabled={pending === 'rejudge'}>
                Rejudge all submissions
              </button>
            </Form>
          </Card>
        </div>
      </div>
    </>
  );
}
