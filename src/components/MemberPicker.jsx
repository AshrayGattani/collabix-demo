import React, { useEffect, useMemo, useRef, useState } from 'react';

// Searchable avatar-rich member picker. Keyboard-friendly.
export function MemberPicker({ members, value, onChange, allowUnassigned, compact }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const ref = useRef(null);

  useEffect(() => {
    function onDoc(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const selected = members.find((m) => m.user_id === value);

  const options = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = allowUnassigned
      ? [{ user_id: null, display_name: 'Unassigned', email: '' }, ...members]
      : members;
    if (!q) return base;
    return base.filter(
      (m) =>
        (m.display_name || '').toLowerCase().includes(q) ||
        (m.email || '').toLowerCase().includes(q)
    );
  }, [members, query, allowUnassigned]);

  function choose(m) {
    onChange(m.user_id);
    setOpen(false);
    setQuery('');
  }

  function onKey(e) {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(options.length - 1, a + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (options[active]) choose(options[active]); }
    else if (e.key === 'Escape') { setOpen(false); }
  }

  return (
    <div className={`member-picker ${compact ? 'compact' : ''}`} ref={ref}>
      <button type="button" className="member-picker-trigger" onClick={() => setOpen((o) => !o)} onKeyDown={onKey}>
        {selected ? (
          <>
            <Mini name={selected.display_name} url={selected.avatar_url} />
            <span>{selected.display_name}</span>
          </>
        ) : (
          <span className="muted">{allowUnassigned ? 'Unassigned' : 'Pick a member'}</span>
        )}
        <span className="caret">▾</span>
      </button>
      {open && (
        <div className="member-picker-pop">
          <input
            autoFocus
            placeholder="Search people…"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setActive(0); }}
            onKeyDown={onKey}
          />
          <div className="member-picker-list">
            {options.length === 0 && <div className="muted small pad">No matches</div>}
            {options.map((m, i) => (
              <button
                key={m.user_id || 'none'}
                type="button"
                className={`member-picker-item ${i === active ? 'active' : ''} ${value === m.user_id ? 'chosen' : ''}`}
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(m)}
              >
                <Mini name={m.display_name} url={m.avatar_url} />
                <div className="mp-text">
                  <div>{m.display_name}</div>
                  {m.email && <div className="muted small">{m.email}</div>}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Mini({ name, url }) {
  if (url) return <img className="mini-avatar" src={url} alt="" />;
  return <div className="mini-avatar mini-fallback">{(name || '?').charAt(0).toUpperCase()}</div>;
}
