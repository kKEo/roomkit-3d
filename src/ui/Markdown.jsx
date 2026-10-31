import { Children, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { BLOCKS } from './blocks/index.jsx';
import { parseBlockData, feedBlockSchema, FEED_BLOCKS } from './blocks/schema.js';
import { useStore } from '../state/store.js';
import { useFeed } from '../data/useFeed.js';
import { scramble } from '../lib/scramble.js';

const textOf = children => Children.toArray(children).map(c => (typeof c === 'string' || typeof c === 'number' ? c : '')).join('');

/** h1 with the decode/scramble reveal. */
export function ScrambleHeading({ children }) {
  const ref = useRef(null);
  const glyphs = useStore(s => s.scene.theme.glyphs);
  const text = textOf(children);
  useEffect(() => { scramble(ref.current, text, 650, glyphs); }, [text, glyphs]);
  return <h1 ref={ref}>{text}</h1>;
}

const issuesText = (type, issues) => `\`\`\`${type}:\n` + issues.map(i => `  ${i.path.join('.') || '(root)'}: ${i.message}`).join('\n');

/**
 * A JSON-bodied block (```stats, ```cards, ...); a parse or validation problem is shown in its place.
 * With a `feed` (in `content.blocks`, or a fenced body `{ "feed": …, "data": … }`) its data is live.
 */
export function Block({ type, data, feed, source }) {
  const Component = BLOCKS[type];
  if (!Component) return <pre className="block-error">{`Unknown block type "${type}" (known: ${Object.keys(BLOCKS).join(', ')})`}</pre>;
  if (data === undefined && feed === undefined && source !== undefined) {
    try { data = JSON.parse(source); } catch (e) { return <pre className="block-error">{`\`\`\`${type}: ${e.message}`}</pre>; }
    // the usual body is an array; an object with "feed" is a live block
    if (FEED_BLOCKS.includes(type) && data && typeof data === 'object' && !Array.isArray(data) && 'feed' in data) {
      const r = feedBlockSchema(type).safeParse(data);
      if (!r.success) return <pre className="block-error">{issuesText(type, r.error.issues)}</pre>;
      ({ data, feed } = r.data);
    }
  }
  if (feed) return <FeedBlock type={type} data={data} feed={feed} />;
  const r = parseBlockData(type, data);
  if (!r.ok) return <pre className="block-error">{issuesText(type, r.issues)}</pre>;
  return <Component data={r.data} />;
}

/**
 * A block whose data comes from a feed: `data` (if given) shows until the first answer, and stays,
 * marked "not updating", if the feed fails. Not announced to screen readers on every update.
 */
function FeedBlock({ type, data, feed }) {
  const ui = useStore(s => s.scene.ui);
  const snap = useFeed(feed);
  const Component = BLOCKS[type];
  const value = snap.value ?? data;
  let body;
  if (value === undefined) {
    body = snap.status === 'error'
      ? <p className="feed-error">{ui.feedError}: {snap.error}</p>
      : <p className="feed-loading">{ui.feedLoading}</p>;
  } else {
    const r = parseBlockData(type, value);
    body = r.ok ? <Component data={r.data} /> : <pre className="block-error">{issuesText(type, r.issues)}</pre>;
  }
  return (
    <div className="feed-block" aria-live="off" aria-busy={snap.status === 'loading'}>
      {body}
      {snap.status === 'error' && value !== undefined && <small className="feed-stale" title={snap.error}>{ui.feedStale}</small>}
    </div>
  );
}

function Pre({ node, children }) {
  const code = node?.children?.[0];
  const lang = (code?.properties?.className || []).map(String).find(c => c.startsWith('language-'))?.slice(9);
  if (lang && BLOCKS[lang]) return <Block type={lang} source={(code.children || []).map(c => c.value || '').join('')} />;
  return <pre>{children}</pre>;
}

function Link({ href, children }) {
  const external = /^https?:/i.test(href || '');
  return <a href={href} {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>{children}</a>;
}

const COMPONENTS = { h1: ScrambleHeading, pre: Pre, a: Link };

export function Markdown({ text }) {
  return <ReactMarkdown remarkPlugins={[remarkGfm]} components={COMPONENTS}>{text}</ReactMarkdown>;
}
