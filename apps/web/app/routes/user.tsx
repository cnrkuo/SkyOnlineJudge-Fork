import { UserLevel } from '@skyoj/contract';
import { Link } from 'react-router';
import { api, load } from '~/lib/api.server';
import { idParam } from '~/lib/params';
import { Badge, ButtonLink, Card, Cluster, css, Empty, Grid, PageHeader, Stack, Stats, Time } from '~/ui';
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
    <Cluster gap="xs">
      {ids.map((id) => (
        <ButtonLink key={id} to={`/problems/${id}`} size="sm">
          {id}
        </ButtonLink>
      ))}
    </Cluster>
  );
}

export default function User({ loaderData: user }: Route.ComponentProps) {
  const { stats } = user;
  const badge = role(user.level);
  return (
    <Stack gap="lg">
      <Cluster gap="md">
        {user.avatarUrl && <img src={user.avatarUrl} alt="" className={css.avatar} />}
        <PageHeader
          title={user.nickname}
          meta={
            <Cluster>
              {badge && <Badge tone="primary">{badge}</Badge>}
              {user.realname && <span>{user.realname}</span>}
              <span>
                Joined <Time value={user.createdAt} />
              </span>
            </Cluster>
          }
        />
      </Cluster>

      {user.quote && (
        <blockquote>
          <p className={css.preWrap}>{user.quote}</p>
          {user.quoteRef && <small>— {user.quoteRef}</small>}
        </blockquote>
      )}

      <Stats
        items={[
          ['Solved', stats.solvedProblemIds.length],
          ['Tried, unsolved', stats.triedProblemIds.length],
          ['Submissions', stats.submissions],
          ['Accepted', stats.accepted],
        ]}
      />

      <Grid columns={2}>
        <Card title="Solved problems">
          <ProblemLinks ids={stats.solvedProblemIds} />
        </Card>
        <Card title="Tried but not solved">
          <ProblemLinks ids={stats.triedProblemIds} />
        </Card>
      </Grid>
      <p>
        <Link to={`/submissions?user=${user.id}`}>All submissions by {user.nickname} →</Link>
      </p>
    </Stack>
  );
}
