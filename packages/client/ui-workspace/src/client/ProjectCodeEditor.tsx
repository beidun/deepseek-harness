import { useMemo, useRef, useSyncExternalStore } from 'react'
import {
  grammarLoadCount, highlightLines, subscribeGrammarLoaded, type HighlightSpan,
} from '@deepseek-ai/dsh-client-ui-primitives'
import css from './WorkspaceBrowser.module.css'

function languageFromPath(path: string): string | undefined {
  const extension = path.split('.').pop()?.toLowerCase()
  const languages: Record<string, string> = {
    ts: 'ts', tsx: 'tsx', js: 'js', jsx: 'jsx', json: 'json', md: 'markdown', mdx: 'mdx',
    py: 'python', rs: 'rust', go: 'go', java: 'java', c: 'c', cc: 'cpp', cpp: 'cpp', h: 'cpp',
    css: 'css', scss: 'scss', html: 'html', xml: 'xml', yml: 'yaml', yaml: 'yaml',
    sh: 'shell', bash: 'shell', sql: 'sql', toml: 'toml', ini: 'ini', lua: 'lua',
  }
  return extension === undefined ? undefined : languages[extension]
}

function spans(runs: readonly HighlightSpan[] | undefined, text: string) {
  return runs === undefined ? text : runs.map((run, index) => <span key={index} style={run.style}>{run.text}</span>)
}

/** Editable, line-numbered Shiki surface with a transparent native input layer. */
export function ProjectCodeEditor({ path, value, onChange, onSave, saving }: {
  path: string
  value: string
  onChange: (value: string) => void
  onSave: () => void
  saving: boolean
}) {
  const textarea = useRef<HTMLTextAreaElement>(null)
  const highlighted = useRef<HTMLPreElement>(null)
  const gutter = useRef<HTMLDivElement>(null)
  const language = languageFromPath(path)
  const grammarVersion = useSyncExternalStore(subscribeGrammarLoaded, grammarLoadCount, grammarLoadCount)
  const lines = useMemo(() => value.split('\n'), [value])
  const tokens = useMemo(() => highlightLines(value, language), [value, language, grammarVersion])

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
      event.preventDefault()
      if (!saving) onSave()
      return
    }
    if (event.key !== 'Tab') return
    event.preventDefault()
    const input = event.currentTarget
    const start = input.selectionStart
    const end = input.selectionEnd
    const before = value.slice(0, start)
    const selected = value.slice(start, end)
    const after = value.slice(end)
    if (event.shiftKey && selected.includes('\n')) {
      const unindented = selected.replaceAll(/^\t/gm, '')
      onChange(before + unindented + after)
      requestAnimationFrame(() => input.setSelectionRange(start, start + unindented.length))
      return
    }
    const inserted = selected.includes('\n') ? selected.replaceAll(/(^|\n)/g, '$1\t') : `\t${selected}`
    onChange(before + inserted + after)
    requestAnimationFrame(() => input.setSelectionRange(start + 1, start + inserted.length))
  }

  return <div className={css.projectCodeEditor} data-saving={saving || undefined}>
    <div className={css.projectCodeGutter} aria-hidden="true">
      <div ref={gutter}>{lines.map((_, index) => <span key={index}>{index + 1}</span>)}</div>
    </div>
    <div className={css.projectCodeStage}>
      <pre ref={highlighted} className={css.projectCodeHighlight} aria-hidden="true">
        {lines.map((line, index) => <span className={css.projectCodeLine} key={index}>{spans(tokens?.[index], line)}{'\n'}</span>)}
      </pre>
      <textarea
        ref={textarea}
        className={css.projectCodeInput}
        aria-label={path}
        spellCheck={false}
        wrap="off"
        value={value}
        onChange={event => onChange(event.currentTarget.value)}
        onKeyDown={onKeyDown}
        onScroll={event => {
          const target = event.currentTarget
          if (highlighted.current !== null) highlighted.current.style.transform = `translate(${-target.scrollLeft}px, ${-target.scrollTop}px)`
          if (gutter.current !== null) gutter.current.style.transform = `translateY(${-target.scrollTop}px)`
        }}
      />
    </div>
  </div>
}
