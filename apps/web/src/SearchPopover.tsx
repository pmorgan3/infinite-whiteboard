import { useEffect, useMemo, useRef, useState } from 'react';
import type { Whiteboard } from '@whiteboard/core';
import { searchElements } from './navigationUtils';

interface Props { open: boolean; onClose: () => void; whiteboard: Whiteboard | null; contentRevision: number; navigate: (action: (wb: Whiteboard) => boolean | void) => void; }

export default function SearchPopover({ open, onClose, whiteboard, contentRevision, navigate }: Props) {
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const matches = useMemo(() => searchElements(whiteboard?.elements ?? [], query), [whiteboard, query, contentRevision]);
  useEffect(() => { setIndex((value) => matches.length ? Math.min(value, matches.length - 1) : 0); }, [matches.length]);
  useEffect(() => { if (open) requestAnimationFrame(() => inputRef.current?.focus()); }, [open]);
  const focus = (next: number) => {
    if (!whiteboard || matches.length === 0) return;
    const normalized = (next + matches.length) % matches.length;
    setIndex(normalized);
    whiteboard.selectedIds = new Set([matches[normalized].id]);
    whiteboard.scheduleRender();
    navigate((wb) => wb.fitSelection(80));
  };
  useEffect(() => { if (open && matches.length) focus(index); }, [matches.map((match) => match.id).join('|')]);
  if (!open) return null;
  return <div className="search-popover" role="search" onKeyDown={(event) => {
    if (event.key === 'Escape') { event.preventDefault(); onClose(); }
    if (event.key === 'Enter') { event.preventDefault(); focus(index + (event.shiftKey ? -1 : 1)); }
  }}>
    <input ref={inputRef} value={query} onChange={(event) => { setQuery(event.target.value); setIndex(0); }} placeholder="Search text and groups" aria-label="Search board" />
    <span aria-live="polite">{matches.length ? `${index + 1} of ${matches.length}` : 'No matches'}</span>
    <button onClick={() => focus(index - 1)} disabled={!matches.length} aria-label="Previous result">↑</button>
    <button onClick={() => focus(index + 1)} disabled={!matches.length} aria-label="Next result">↓</button>
    <button onClick={onClose} aria-label="Close search">×</button>
  </div>;
}
