import { Children, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { BLOCKS } from './blocks/index.jsx';
import { parseBlockData } from './blocks/schema.js';
import { useStore } from '../state/store.js';
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

/** A JSON-bodied block (```stats, ```cards, ...); a parse or validation problem is shown in its place. */
export function Block({ type, data, source }) {
  const Component = BLOCKS[type];
  if (!Component) return <pre className="block-error">{`Unknown block type "${type}" (known: ${Object.keys(BLOCKS).join(', ')})`}</pre>;
  if (data === undefined && source !== undefined) {
    try { data = JSON.parse(source); } catch (e) { return <pre className="block-error">{`\`\`\`${type}: ${e.message}`}</pre>; }
  }
  const r = parseBlockData(type, data);
  if (!r.ok) return <pre className="block-error">{`\`\`\`${type}:\n` + r.issues.map(i => `  ${i.path.join('.') || '(root)'}: ${i.message}`).join('\n')}</pre>;
  return <Component data={r.data} />;
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
