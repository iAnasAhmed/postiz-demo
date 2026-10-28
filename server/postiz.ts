// Talks to the self-hosted Postiz public API. The API key never leaves the server.
export type Env = { apiUrl: string; apiKey: string };

export const coffees: Record<string, { origin: string; notes: string; brew: string }> = {
  Yirgacheffe: { origin: 'Ethiopia', notes: 'jasmine, bergamot and peach', brew: 'pour-over at 93°C' },
  Huila: { origin: 'Colombia', notes: 'red apple, caramel and cocoa', brew: 'AeroPress, 2-minute steep' },
  'Nyeri AA': { origin: 'Kenya', notes: 'blackcurrant and grapefruit', brew: 'V60, slightly finer grind' },
  Cerrado: { origin: 'Brazil', notes: 'hazelnut and milk chocolate', brew: 'espresso or French press' },
};

export const angles = ['Launch', 'Brew tip', 'Restock'] as const;
export type Angle = (typeof angles)[number];

// Bluesky allows 300 characters per post.
export const MAX_LEN = 300;

export function draftPost(coffee: string, angle: Angle) {
  const c = coffees[coffee] ?? coffees.Yirgacheffe;
  if (angle === 'Brew tip') return `Brew tip for our ${coffee} from ${c.origin}: try a ${c.brew}. Rest the beans 3–5 days after roasting and you'll taste the ${c.notes}. ☕`;
  if (angle === 'Restock') return `Back in stock: ${coffee} (${c.origin}). Notes of ${c.notes}. Roasted this Monday, shipping this week. ☕`;
  return `New on the roaster: ${coffee} from ${c.origin}. Expect ${c.notes}. Roasted every Monday, shipped fresh. ☕`;
}

async function api(env: Env, path: string, init?: RequestInit) {
  const res = await fetch(new URL(`/public/v1${path}`, env.apiUrl), {
    ...init,
    headers: { authorization: env.apiKey, 'content-type': 'application/json' },
    signal: AbortSignal.timeout(20000),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = (body && (body.error || body.msg || body.message)) || `Postiz ${res.status}`;
    throw new Error(String(msg));
  }
  return body;
}

export type Channel = { id: string; name: string; identifier: string; picture?: string; profile?: string; disabled: boolean };

export async function listChannels(env: Env) {
  const list = (await api(env, '/integrations')) as Channel[];
  return list.filter(c => !c.disabled).map(({ id, name, identifier, picture, profile }) => ({ id, name, identifier, picture, profile }));
}

export async function createPost(env: Env, input: { channel: string; content: string; when: 'now' | 'later' }) {
  const date = new Date(Date.now() + (input.when === 'later' ? 2 * 60_000 : 0)).toISOString();
  const r = (await api(env, '/posts', {
    method: 'POST',
    body: JSON.stringify({
      type: input.when === 'now' ? 'now' : 'schedule',
      date,
      shortLink: false,
      tags: [],
      posts: [{ integration: { id: input.channel }, value: [{ content: input.content, image: [] }], settings: {} }],
    }),
  })) as { postId?: string; integration?: string }[];
  return { ids: r.map(p => p.postId).filter(Boolean), date };
}

type RawPost = {
  id: string; content: string; publishDate: string; releaseURL?: string | null;
  state: string; error?: string | null; integration?: { name?: string; providerIdentifier?: string; picture?: string };
};

export async function listPosts(env: Env) {
  const start = new Date(Date.now() - 7 * 864e5).toISOString();
  const end = new Date(Date.now() + 7 * 864e5).toISOString();
  const r = (await api(env, `/posts?startDate=${encodeURIComponent(start)}&endDate=${encodeURIComponent(end)}`)) as { posts: RawPost[] };
  return (r.posts ?? [])
    .map(p => ({
      id: p.id,
      text: p.content.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim(),
      at: p.publishDate,
      state: p.state,
      url: p.releaseURL?.startsWith('https://') ? p.releaseURL : null,
      error: p.state === 'ERROR' ? 'Publishing failed' : null,
      channel: p.integration?.name ?? '',
    }))
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 8);
}
