import { UserLevel } from '@skyoj/contract';
import { Link } from 'react-router';
import { Card, Empty, idParam, PageHeader, Time } from '~/components/ui';
import { api, load } from '~/lib/api.server';
import type { Route } from './+types/user';

export async function loader({ request, params }: Route.LoaderArgs) {
  return load(request, (o) => api.user.get({ id: idParam(params.id) }, o));
}

export const meta: Route.MetaFunction = ({ loaderData }) => [{ title: loaderData?.nickname ?? 'User' }];

function role(level: UserLevel): string | null {
  if (level >= UserLevel.ROOT) return 'Site owner';
  if (level >= UserLevel.ADMIN) return 'Administrator';
  if (level <= UserLevel.BANNED) return 'Banned';
  return null;
}

function ProblemLinks({ ids }: { ids: number[] }) {
  if (ids.length === 0) return <Empty>Nothing here yet.</Empty>;
  return (
    <ul className="flex flex-wrap gap-1.5 p-4">
      {ids.map((id) => (
        <li key={id}>
          <Link to={`/problems/${id}`} className="btn px-2 py-0.5 tabular-nums">
            {id}
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default function User({ loaderData: user }: Route.ComponentProps) {
  const { stats } = user;
  const badge = role(user.level);
  return (
    <>
      <div className="mb-5 flex items-center gap-4">
        {user.avatarUrl ? (
          <img src={user.avatarUrl} alt="" className="size-16 rounded-full border border-line object-cover" />
        ) : (
          <div className="grid size-16 place-items-center rounded-full bg-sunken text-2xl font-semibold text-muted" aria-hidden>
            {user.nickname.slice(0, 1).toUpperCase()}
          </div>
        )}
        <PageHeader
          title={user.nickname}
          meta={
            <>
              {badge && <span className="mr-2 font-medium text-accent">{badge}</span>}
              {user.realname && <span className="mr-2">{user.realname}</span>}
              Joined <Time value={user.createdAt} />
            </>
          }
        />
      </div>
      {user.quote && (
        <blockquote className="mb-5 border-l-4 border-line pl-4 text-muted">
          <p className="whitespace-pre-wrap">{user.quote}</p>
          {user.quoteRef && <footer className="mt-1 text-sm">— {user.quoteRef}</footer>}
        </blockquote>
      )}

      <dl className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ['Solved', stats.solvedProblemIds.length],
          ['Tried, unsolved', stats.triedProblemIds.length],
          ['Submissions', stats.submissions],
          ['Accepted', stats.accepted],
        ].map(([label, value]) => (
          <div key={label} className="card px-4 py-3">
            <dt className="text-xs text-muted">{label}</dt>
            <dd className="text-2xl font-semibold tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>

      <div className="grid gap-6 md:grid-cols-2">
        <Card title="Solved problems">
          <ProblemLinks ids={stats.solvedProblemIds} />
        </Card>
        <Card title="Tried but not solved">
          <ProblemLinks ids={stats.triedProblemIds} />
        </Card>
      </div>
      <p className="mt-4 text-sm">
        <Link to={`/submissions?user=${user.id}`}>All submissions by {user.nickname} →</Link>
      </p>
    </>
  );
}
