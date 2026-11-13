import { AccessLevel, ScoreMode } from '@skyoj/contract';
import type { ReactNode } from 'react';
import { Form, useNavigation, useSubmit } from 'react-router';
import { type ActionResult, api, load, submit } from '~/lib/api.server';
import { idParam } from '~/lib/params';
import { ACCESS_OPTIONS, formatScoreGroups, parseAccess, parseScoreGroups } from '~/lib/problem-form';
import {
  Button,
  ButtonLink,
  Card,
  CardBody,
  CheckField,
  Cluster,
  Control,
  css,
  Empty,
  Field,
  Grid,
  Muted,
  Notice,
  PageHeader,
  Split,
  Stack,
} from '~/ui';
import { type Column, DataTable } from '~/ui/data-table';
import { Confirm } from '~/ui/overlays';
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

/** What each form on the page asks the action to do. */
const Intent = {
  SAVE: 'save',
  UPLOAD_TESTDATA: 'upload-testdata',
  CLEAR_TESTDATA: 'clear-testdata',
  ATTACH: 'attach',
  DETACH: 'detach',
  REJUDGE: 'rejudge',
} as const;

/** Each card of the page shows the outcome of the forms inside it. */
type Section = 'statement' | 'testdata' | 'attachments' | 'rejudge';

type Feedback = { section: Section } & ({ ok: true; message: string } | { ok: false; error: string });

function feedback<T>(section: Section, result: ActionResult<T>, message: (data: T) => string): Feedback {
  return result.ok ? { section, ok: true, message: message(result.data) } : { section, ok: false, error: result.error };
}

const failure = (section: Section, error: string): Feedback => ({ section, ok: false, error });

export async function action({ request, params }: Route.ActionArgs): Promise<Feedback> {
  const problemId = idParam(params.id);
  const form = await request.formData();
  const file = form.get('file');

  switch (form.get('intent')) {
    case Intent.SAVE: {
      const scoreGroups = parseScoreGroups(String(form.get('scoreGroups') ?? ''));
      if (!scoreGroups) {
        return failure('statement', 'Subtasks must be written one per line as "<points> <testcase count>"');
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
      return feedback('statement', result, () => 'Problem saved.');
    }
    case Intent.UPLOAD_TESTDATA: {
      if (!(file instanceof File) || file.size === 0) return failure('testdata', 'Choose a zip archive first');
      const result = await submit(request, (o) => api.problem.uploadTestdata({ problemId, archive: file }, o));
      return feedback('testdata', result, ({ testcases }) => `Uploaded — the problem now has ${testcases} testcases.`);
    }
    case Intent.CLEAR_TESTDATA: {
      const result = await submit(request, (o) => api.problem.clearTestdata({ problemId }, o));
      return feedback('testdata', result, () => 'All testcases removed.');
    }
    case Intent.ATTACH: {
      if (!(file instanceof File) || file.size === 0) return failure('attachments', 'Choose a file first');
      const result = await submit(request, (o) => api.problem.uploadAttachment({ problemId, file }, o));
      return feedback('attachments', result, ({ name }) => `Uploaded ${name}.`);
    }
    case Intent.DETACH: {
      const name = String(form.get('name'));
      const result = await submit(request, (o) => api.problem.deleteAttachment({ problemId, name }, o));
      return feedback('attachments', result, () => `Deleted ${name}.`);
    }
    case Intent.REJUDGE: {
      const result = await submit(request, (o) => api.submission.rejudgeProblem({ problemId }, o));
      return feedback('rejudge', result, ({ count }) => `Queued ${count} submissions for rejudging.`);
    }
    default:
      return failure('statement', 'Unknown action');
  }
}

export const meta: Route.MetaFunction = ({ loaderData }) => [
  { title: `Edit: ${loaderData?.problem.title ?? 'problem'}` },
];

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
  const pending = navigation.state !== 'idle' ? String(navigation.formData?.get('intent') ?? '') : '';
  const notice = (section: Section) => (actionData?.section === section ? <Notice result={actionData} /> : null);

  return (
    <>
      <PageHeader
        title={`Edit problem #${problem.id}`}
        actions={<ButtonLink to={`/problems/${problem.id}`}>View problem</ButtonLink>}
      />
      <Split aside="wide">
        <StatementCard problem={problem} notice={notice('statement')} pending={pending} />
        <Stack gap="lg">
          <TestcasesCard testcases={testcases} notice={notice('testdata')} pending={pending} />
          <AttachmentsCard
            problemId={problem.id}
            attachments={attachments}
            notice={notice('attachments')}
            pending={pending}
          />
          <RejudgeCard notice={notice('rejudge')} pending={pending} />
        </Stack>
      </Split>
    </>
  );
}

type Problem = Route.ComponentProps['loaderData']['problem'];
type Attachment = Route.ComponentProps['loaderData']['attachments'][number];

/** What every card gets: the notice for its forms, and the intent being submitted. */
interface SectionProps {
  notice: ReactNode;
  pending: string;
}

function StatementCard({ problem, notice, pending }: SectionProps & { problem: Problem }) {
  return (
    <Card title="Statement and settings">
      <Form method="post">
        <Stack>
          <input type="hidden" name="intent" value={Intent.SAVE} />
          {notice}
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
            }>
            <textarea
              className={css.monoInput}
              name="content"
              rows={22}
              defaultValue={problem.content}
              spellCheck={false}
            />
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
              <input
                name="timeLimitMs"
                type="number"
                min={100}
                max={60000}
                step={100}
                defaultValue={problem.timeLimitMs}
                required
              />
            </Field>
            <Field label="Memory limit (MB)">
              <input
                name="memoryLimitMb"
                type="number"
                min={4}
                max={4096}
                defaultValue={Math.round(problem.memoryLimitKb / 1024)}
                required
              />
            </Field>
            <Field label="Scoring">
              <select name="scoreMode" defaultValue={problem.scoreMode}>
                <option value={ScoreMode.AVERAGE}>Average — 100 × passed ÷ total</option>
                <option value={ScoreMode.GROUP_MIN}>Subtasks — a group scores only if all its testcases pass</option>
              </select>
            </Field>
            <Field
              label="Subtasks"
              hint='One per line: "<points> <testcase count>", in testcase order. Used by subtask scoring.'>
              <textarea
                className={css.monoInput}
                name="scoreGroups"
                rows={3}
                placeholder={'40 2\n60 3'}
                defaultValue={formatScoreGroups(problem.scoreGroups)}
              />
            </Field>
          </Grid>

          <CheckField
            name="submitOpen"
            defaultChecked={problem.submitOpen}
            label="Open for submissions outside contests"
          />
          <div>
            <Button busy={pending === Intent.SAVE}>Save</Button>
          </div>
        </Stack>
      </Form>
    </Card>
  );
}

function TestcasesCard({ testcases, notice, pending }: SectionProps & { testcases: Testcase[] }) {
  const submit = useSubmit();
  return (
    <Card flush title={`Testcases (${testcases.length})`}>
      <CardBody>
        <Form method="post" encType="multipart/form-data">
          <Stack gap="sm">
            {notice}
            <input type="hidden" name="intent" value={Intent.UPLOAD_TESTDATA} />
            <Control>
              <input type="file" name="file" accept=".zip,application/zip" aria-label="Testdata archive" required />
            </Control>
            <small>
              A zip of <code>name.in</code> + <code>name.ans</code> (or <code>.out</code>) pairs. Uploading adds to the
              existing testcases and overwrites those with the same name; they run in natural order of their names.
            </small>
            <Cluster justify="between">
              <Button variant="secondary" busy={pending === Intent.UPLOAD_TESTDATA}>
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
                  onConfirm={() => submit({ intent: Intent.CLEAR_TESTDATA }, { method: 'post' })}>
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
  );
}

function AttachmentsCard({
  problemId,
  attachments,
  notice,
  pending,
}: SectionProps & { problemId: number; attachments: Attachment[] }) {
  return (
    <Card title="Attachments">
      <Stack gap="sm">
        {notice}
        <Form method="post" encType="multipart/form-data">
          <Cluster>
            <input type="hidden" name="intent" value={Intent.ATTACH} />
            <div className={css.grow}>
              <Control>
                <input type="file" name="file" aria-label="Attachment" required />
              </Control>
            </div>
            <Button variant="secondary" busy={pending === Intent.ATTACH}>
              Upload
            </Button>
          </Cluster>
        </Form>
        {attachments.map((file) => (
          <Cluster key={file.name} justify="between">
            <a href={`/problems/${problemId}/attachments/${file.name}`}>{file.name}</a>
            <Cluster>
              <Muted small>{Math.ceil(file.size / 1024)} KB</Muted>
              <Form method="post">
                <input type="hidden" name="name" value={file.name} />
                <Button variant="link" name="intent" value={Intent.DETACH} aria-label={`Delete ${file.name}`}>
                  Delete
                </Button>
              </Form>
            </Cluster>
          </Cluster>
        ))}
      </Stack>
    </Card>
  );
}

function RejudgeCard({ notice, pending }: SectionProps) {
  return (
    <Card title="Rejudge">
      <Form method="post">
        <Stack gap="sm">
          {notice}
          <Muted small>Puts every submission of this problem back into the judge queue.</Muted>
          <div>
            <Button variant="secondary" name="intent" value={Intent.REJUDGE} busy={pending === Intent.REJUDGE}>
              Rejudge all submissions
            </Button>
          </div>
        </Stack>
      </Form>
    </Card>
  );
}
