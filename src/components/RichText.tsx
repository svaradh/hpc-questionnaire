/**
 * RichText — renders question text, turning glossary markup (`{term}`,
 * `{shown text|id}`) into terms with a definition pop-up. The pop-up opens
 * on hover or keyboard focus, and stays open when clicked or tapped until
 * Esc, a second click, or a click elsewhere.
 */

import { createContext, useContext, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import type { GlossaryEntry } from '../types/schema'
import { segments } from '../utils/glossary'

export const GlossaryContext = createContext<Map<string, GlossaryEntry>>(new Map())

export function RichText({ text }: { text: string }) {
  const index = useContext(GlossaryContext)
  return (
    <>
      {segments(text, index).map((seg, i) =>
        seg.entry ? <Term key={i} text={seg.text} entry={seg.entry} /> : <span key={i}>{seg.text}</span>
      )}
    </>
  )
}

function Term({ text, entry }: { text: string; entry: GlossaryEntry }) {
  const [hovered, setHovered] = useState(false)
  const [pinned, setPinned] = useState(false)
  const [shift, setShift] = useState(0)
  const wrapRef = useRef<HTMLSpanElement>(null)
  const popRef = useRef<HTMLSpanElement>(null)
  const id = useId()
  const open = hovered || pinned

  // Close a pinned pop-up on Esc or a click elsewhere.
  useEffect(() => {
    if (!pinned) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setPinned(false); setHovered(false) } }
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) { setPinned(false); setHovered(false) }
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('touchstart', onDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('touchstart', onDown)
    }
  }, [pinned])

  // Keep the pop-up inside the viewport horizontally.
  useLayoutEffect(() => {
    if (!open || !popRef.current) { setShift(0); return }
    const r = popRef.current.getBoundingClientRect()
    const over = r.right - shift - (window.innerWidth - 12)
    setShift(over > 0 ? over : 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  return (
    <span className="term" ref={wrapRef}>
      <button
        type="button"
        className="term-trigger"
        aria-describedby={open ? id : undefined}
        aria-expanded={open}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onFocus={() => setHovered(true)}
        onBlur={() => setHovered(false)}
        onKeyDown={e => { if (e.key === 'Escape') { setPinned(false); setHovered(false) } }}
        onClick={e => {
          // Inside a <label>, a click must not toggle the option.
          e.preventDefault()
          e.stopPropagation()
          if (pinned) { setPinned(false); setHovered(false) } else setPinned(true)
        }}
      >
        {text}
      </button>
      {open && (
        <span role="tooltip" id={id} ref={popRef} className="term-popover" style={shift ? { transform: `translateX(-${shift}px)` } : undefined}>
          <strong className="term-popover-title">{entry.term}</strong>
          <span className="term-popover-text">{entry.definition}</span>
        </span>
      )}
    </span>
  )
}

/** Full list of terms, for the "Terms used in this form" panel. */
export function GlossaryList({ entries }: { entries: GlossaryEntry[] }) {
  return (
    <dl className="glossary-list">
      {entries.map(e => (
        <div key={e.id} className="glossary-item">
          <dt>{e.term}</dt>
          <dd>{e.definition}</dd>
        </div>
      ))}
    </dl>
  )
}
