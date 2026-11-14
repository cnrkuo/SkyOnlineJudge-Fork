import { UserLevel } from '@skyoj/contract';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { Form, Link, useSearchParams } from 'react-router';
import { api, prefetch, submit } from '~/lib/api.server';
import { orpc } from '~/lib/orpc';
import { paging } from '~/lib/params';
import { unlessOnlySearchChanged } from '~/lib/revalidate';
import {
  Badge,
  Button,
  Card,
  CardBody,
  Cluster,
  Control,
  css,
  Empty,
  Field,
  Muted,
  Notice,
  PageHeader,
  Stack,
  Time,
  UserLink,
  useRoot,
} from '~/ui';
import { languageName } from '~/ui/code';
import { type Column, DataTable, Pager } from '~/ui/data-table';
import { Confirm, SelectBox } from '~/ui/overlays';
import type { Route } from './+types/admin';

const LEVELS: { level: UserLevel; label: string }[] = [
  { level: UserLevel.BANNED, label: 'Banned' },
  { level: UserLevel.UNVERIFIED, label: 'Unverified' },
  { level: UserLevel.USER, label: 'User' },
  { level: UserLevel.ADMIN, label: 'Administrator' },
  { level: UserLevel.ROOT, label: 'Site owner' },
];

const levelOf = (value: string) => LEVELS.find((l) => String(l.level) === value)?.level;

function usersInput(params: URLSearchParams) {
  return { ...paging(params), search: params.get('q')?.trim() || undefined };
}

export async function loader({ request }: Route.LoaderArgs) {
  const input = usersInput(new URL(request.url).searchParams);
  const dehydrated = await prefetch(request, (context) => [
    orpc.admin.listUsers.queryOptions({ input, context }),
    orpc.admin.listJudges.queryOptions({ context }),
  ]);
  return { dehydrated };
}

export const shouldRevalidate = unlessOnlySearchChanged;

/** Creating a judge returns its token exactly once, so it is a form action. */
export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const result = await submit(request, (o) => api.admin.createJudge({ name: String(form.get('name') ?? '') }, o));
  if (!result.ok) return result;
  return { ok: true as const, message: `Judge "${result.data.judge.name}" created.`, token: result.data.token };
}

export const meta: Route.MetaFunction = () => [{ title: 'Administration' }];

type Judge = Awaited<ReturnType<typeof api.admin.listJudges>>[number];
type AdminUser = Awaited<ReturnType<typeof api.admin.listUsers>>['items'][number];

function Judges({ actionData }: { actionData: Route.ComponentProps['actionData'] }) {
  const queryClient = useQueryClient();
  const options = orpc.admin.listJudges.queryOptions();
  // Refresh often enough for the online indicator to mean something.
  const { data: judges = [] } = useQuery({ ...options, refetchInterval: 10_000 });
  const refresh = () => queryClient.invalidateQueries({ queryKey: options.queryKey });
  const toggle = useMutation(orpc.admin.setJudgeEnabled.mutationOptions({ onSuccess: refresh }));
  const remove = useMutation(orpc.admin.deleteJudge.mutationOptions({ onSuccess: refresh }));
  const failure = toggle.error ?? remove.error;

  const columns: Column<Judge>[] = [
    { id: 'name', header: 'Name', sortValue: (j) => j.name.toLowerCase(), cell: (j) => <strong>{j.name}</strong> },
    {
      id: 'status',
      header: 'Status',
      cell: (j) => {
        if (!j.enabled) return <Badge>Disabled</Badge>;
        // Decided by the API, on its own clock: the browser's may be off.
        return j.online ? <Badge tone="success">Online</Badge> : <Badge tone="warning">Offline</Badge>;
      },
    },
    {
      id: 'languages',
      header: 'Languages',
      cell: (j) => (j.languages.length > 0 ? j.languages.map(languageName).join(', ') : <Muted>not reported</Muted>),
    },
    {
      id: 'seen',
      header: 'Last seen',
      cell: (j) => <Muted>{j.lastSeenAt ? <Time value={j.lastSeenAt} /> : 'never'}</Muted>,
    },
    {
      id: 'actions',
      header: 'Actions',
      align: 'right',
      cell: (j) => (
        <Cluster justify="end">
          <Button variant="secondary" size="sm" onClick={() => toggle.mutate({ id: j.id, enabled: !j.enabled })}>
            {j.enabled ? 'Disable' : 'Enable'}
          </Button>
          <Confirm
            trigger={
              <Button variant="danger" size="sm">
                Delete
              </Button>
            }
            title={`Delete judge "${j.name}"?`}
            confirmLabel="Delete judge"
            onConfirm={() => remove.mutate({ id: j.id })}>
            Its token stops working immediately. Submissions it is judging are handed to another judge.
          </Confirm>
        </Cluster>
      ),
    },
  ];
  const token = actionData && 'token' in actionData ? actionData.token : null;

  return (
    <Card flush title="Judge machines">
      <CardBody>
        <Stack gap="sm">
          <Notice result={actionData} />
          {failure && <Notice result={{ ok: false, error: failure.message }} />}
          {token && (
            <div className={`${css.notice} ${css.toneFill.primary}`}>
              <strong>Copy this token into the judge's config now — it will not be shown again.</strong>
              <div>
                <code className={css.preWrap}>{token}</code>
              </div>
            </div>
          )}
          <Form method="post">
            <Cluster align="end" gap="md">
              <Field label="Register a new judge">
                <input className={css.inputWidth.md} name="name" placeholder="e.g. judge-01" maxLength={64} required />
              </Field>
              <Button>Create token</Button>
            </Cluster>
          </Form>
        </Stack>
      </CardBody>
      <DataTable
        caption="Judge machines"
        data={judges}
        columns={columns}
        rowKey={(j) => j.id}
        empty={<Empty>No judges registered. Submissions stay in the queue until a judge connects.</Empty>}
      />
    </Card>
  );
}

function Users() {
  const { user: me } = useRoot();
  const myLevel = me?.level ?? 0;
  const [params] = useSearchParams();
  const input = usersInput(params);
  const queryClient = useQueryClient();
  const query = useQuery({ ...orpc.admin.listUsers.queryOptions({ input }), placeholderData: keepPreviousData });
  const setLevel = useMutation(
    orpc.admin.setUserLevel.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries({ queryKey: orpc.admin.listUsers.key() }),
    }),
  );
  const list = query.data;

  const columns = useMemo<Column<AdminUser>[]>(
    () => [
      { id: 'id', header: '#', fixed: true, sortValue: (u) => u.id, cell: (u) => <Muted>{u.id}</Muted> },
      {
        id: 'nickname',
        header: 'Nickname',
        fixed: true,
        sortValue: (u) => u.nickname.toLowerCase(),
        cell: (u) => <UserLink user={u} />,
      },
      { id: 'email', header: 'E-mail', sortValue: (u) => u.email, cell: (u) => <Muted>{u.email}</Muted> },
      { id: 'realname', header: 'Real name', hidden: true, cell: (u) => u.realname },
      {
        id: 'joined',
        header: 'Joined',
        sortValue: (u) => u.createdAt,
        cell: (u) => (
          <Muted>
            <Time value={u.createdAt} />
          </Muted>
        ),
      },
      {
        id: 'level',
        header: 'Level',
        sortValue: (u) => u.level,
        cell: (u) => {
          const editable = u.id !== me?.id && u.level < myLevel;
          if (!editable) return LEVELS.find((l) => l.level === u.level)?.label;
          return (
            <SelectBox
              size="sm"
              label={`Level of ${u.nickname}`}
              value={String(u.level)}
              options={LEVELS.filter((l) => l.level < myLevel).map(({ level, label }) => ({
                value: String(level),
                label,
              }))}
              onChange={(value) => {
                const level = levelOf(value);
                if (level !== undefined) setLevel.mutate({ userId: u.id, level });
              }}
            />
          );
        },
      },
      {
        id: 'edit',
        header: 'Account',
        align: 'right',
        cell: (u) => (u.id === me?.id || u.level < myLevel ? <Link to={`/admin/users/${u.id}`}>Edit</Link> : null),
      },
    ],
    [me?.id, myLevel, setLevel],
  );

  return (
    <Card flush title={`Users${list ? ` (${list.total})` : ''}`}>
      {setLevel.isError && (
        <CardBody>
          <Notice result={{ ok: false, error: setLevel.error.message }} />
        </CardBody>
      )}
      <DataTable
        caption="Users"
        data={list?.items ?? []}
        columns={columns}
        rowKey={(u) => u.id}
        columnMenu
        stale={query.isPlaceholderData}
        toolbar={
          <Form method="get" role="search">
            <Cluster>
              <Control>
                <input
                  className={css.inputWidth.md}
                  type="search"
                  name="q"
                  defaultValue={input.search ?? ''}
                  placeholder="Nickname or e-mail"
                  aria-label="Search users"
                />
              </Control>
              <Button variant="secondary">Search</Button>
            </Cluster>
          </Form>
        }
        empty={<Empty>No users match.</Empty>}
        footer={list && <Pager page={list.page} pageSize={list.pageSize} total={list.total} sizes />}
      />
    </Card>
  );
}

export default function Admin({ actionData }: Route.ComponentProps) {
  return (
    <>
      <PageHeader title="Administration" />
      <Stack gap="lg">
        <Judges actionData={actionData} />
        <Users />
      </Stack>
    </>
  );
}
