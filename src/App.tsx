import { useCallback, useEffect, useState, type FormEvent } from 'react';

const coffees = ['Yirgacheffe', 'Huila', 'Nyeri AA', 'Cerrado'];
const angles = ['Launch', 'Brew tip', 'Restock'];
const MAX = 300;
type Channel = { id: string; name: string; identifier: string; picture?: string; profile?: string };
type Post = { id: string; text: string; at: string; state: string; url: string | null; error: string | null; channel: string };

const stateLabel: Record<string, string> = { QUEUE: 'Scheduled', PUBLISHED: 'Published', ERROR: 'Failed', DRAFT: 'Draft' };
const when = (iso: string) =>
  new Date(iso).toLocaleString('en', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

export function App() {
  const [channels, setChannels] = useState<Channel[] | null>(null);
  const [channel, setChannel] = useState('');
  const [coffee, setCoffee] = useState(coffees[0]);
  const [angle, setAngle] = useState(angles[0]);
  const [text, setText] = useState('');
  const [timing, setTiming] = useState<'now' | 'later'>('later');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [posts, setPosts] = useState<Post[]>([]);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    fetch('/api/channels').then(async r => {
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setChannels(j);
      setChannel(c => c || j[0]?.id || '');
    }).catch(() => { setChannels([]); setOffline(true); });
  }, []);

  useEffect(() => {
    fetch(`/api/draft?coffee=${encodeURIComponent(coffee)}&angle=${encodeURIComponent(angle)}`)
      .then(r => r.json()).then(j => j.text && setText(j.text)).catch(() => {});
  }, [coffee, angle]);

  const refresh = useCallback(() => {
    fetch('/api/posts').then(r => (r.ok ? r.json() : Promise.reject())).then(setPosts).catch(() => {});
  }, []);

  // Keep the queue fresh so scheduled posts flip to "Published" on their own.
  useEffect(() => {
    refresh();
    const t = window.setInterval(refresh, 5000);
    return () => window.clearInterval(t);
  }, [refresh]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError(''); setNotice('');
    try {
      const r = await fetch('/api/posts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ channel, content: text, when: timing }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? 'Something went wrong.');
      setNotice(timing === 'now' ? 'Sent to Postiz. It will publish in a few seconds.' : `Scheduled for ${when(j.date)}.`);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  const length = [...text].length;
  const current = channels?.find(c => c.id === channel);

  return (
    <>
      <header className="top">
        <a className="logo" href="#">Kiln<span>.</span></a>
        <span className="tag">Social scheduling demo</span>
      </header>

      <main className="wrap">
        <section className="intro">
          <p className="eyebrow">Social publishing</p>
          <h1>Write it once.<br /><em>Let my server post it.</em></h1>
          <p className="lead">Pick a coffee and an angle, tweak the post, then publish now or schedule it. A self-hosted Postiz queues the post and publishes it to Bluesky on time, and the queue below updates as it goes live.</p>
        </section>

        <div className="grid">
          <form className="card form" onSubmit={submit} noValidate>
            <h2>New post</h2>

            <div className="channel">
              {channels === null ? <span className="muted">Loading channel…</span>
                : offline ? <span className="error">Postiz isn’t reachable. Start it, then reload.</span>
                : !current ? <span className="muted">No channel connected. Connect a Bluesky account in Postiz first.</span>
                : <>
                    {current.picture && <img src={current.picture} alt="" width={36} height={36} />}
                    <span><b>{current.name}</b><small>{current.identifier}{current.profile ? ` · @${current.profile}` : ''}</small></span>
                  </>}
            </div>

            <fieldset>
              <legend>Coffee</legend>
              <div className="chips">
                {coffees.map(c => (
                  <label key={c} className={`chip ${coffee === c ? 'on' : ''}`}>
                    <input type="radio" name="coffee" checked={coffee === c} onChange={() => setCoffee(c)} />{c}
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend>Angle</legend>
              <div className="chips">
                {angles.map(a => (
                  <label key={a} className={`chip ${angle === a ? 'on' : ''}`}>
                    <input type="radio" name="angle" checked={angle === a} onChange={() => setAngle(a)} />{a}
                  </label>
                ))}
              </div>
            </fieldset>

            <label>Post
              <textarea value={text} onChange={e => setText(e.target.value)} rows={5} />
              <span className={`count ${length > MAX ? 'over' : ''}`}>{length} / {MAX}</span>
            </label>

            <fieldset>
              <legend>When</legend>
              <div className="chips">
                <label className={`chip ${timing === 'later' ? 'on' : ''}`}><input type="radio" name="when" checked={timing === 'later'} onChange={() => setTiming('later')} />In 2 minutes</label>
                <label className={`chip ${timing === 'now' ? 'on' : ''}`}><input type="radio" name="when" checked={timing === 'now'} onChange={() => setTiming('now')} />Right now</label>
              </div>
            </fieldset>

            {error && <p className="error" role="alert">{error}</p>}
            {notice && <p className="notice" role="status">{notice}</p>}
            <button className="primary" disabled={busy || !current || length === 0 || length > MAX}>
              {busy ? 'Sending…' : timing === 'now' ? 'Publish now' : 'Schedule post'}
            </button>
            <p className="fine">This posts publicly to the connected Bluesky account.</p>
          </form>

          <section className="card" aria-live="polite">
            <h2>Queue</h2>
            {posts.length === 0 ? (
              <p className="muted">No posts in the last week. Schedule one to see it here.</p>
            ) : (
              <ul className="queue">
                {posts.map(p => (
                  <li key={p.id}>
                    <div className="queue-head">
                      <span className={`state s-${p.state.toLowerCase()}`}>{stateLabel[p.state] ?? p.state}</span>
                      <time>{when(p.at)}</time>
                    </div>
                    <p>{p.text}</p>
                    {p.url && <a href={p.url} target="_blank" rel="noopener noreferrer">View on Bluesky ↗</a>}
                    {p.error && <small className="error">{p.error}</small>}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </main>

      <footer className="foot">
        <p>Built by <a href="https://github.com/iAnasAhmed" target="_blank" rel="noopener noreferrer">Anas Ahmed</a> · Scheduling by a self-hosted Postiz fork.</p>
      </footer>
    </>
  );
}
