import React, { useMemo, useState } from 'react';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

/**
 * CalendarView — month grid showing task deadlines + activity heatmap.
 * Props:
 *   tasks          — array of { id, title, status, priority, due_date, assignee_id }
 *   members        — array of member objects (with .daily, .display_name, .user_id)
 *   events         — flat array of { occurred_at, kind, actor_id } (all project events from snapshot)
 *   viewAsId       — if set, filters to that member
 *   onSelectMember — callback(user_id)
 *   projectDeadline— ISO string (project.deadline)
 */
export function CalendarView({ tasks = [], members = [], events = [], viewAsId, onSelectMember, projectDeadline }) {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [selectedDate, setSelectedDate] = useState(null);

  // Navigation
  function prev() { if (month === 0) { setMonth(11); setYear(year - 1); } else setMonth(month - 1); }
  function next() { if (month === 11) { setMonth(0); setYear(year + 1); } else setMonth(month + 1); }
  function goToday() { setYear(today.getFullYear()); setMonth(today.getMonth()); }

  // Build calendar grid
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const weeks = useMemo(() => {
    const rows = [];
    let row = new Array(firstDay).fill(null);
    for (let d = 1; d <= daysInMonth; d++) {
      row.push(d);
      if (row.length === 7) { rows.push(row); row = []; }
    }
    if (row.length) { while (row.length < 7) row.push(null); rows.push(row); }
    return rows;
  }, [firstDay, daysInMonth]);

  // Index tasks by due_date
  const tasksByDate = useMemo(() => {
    const map = {};
    const filtered = viewAsId ? tasks.filter((t) => t.assignee_id === viewAsId) : tasks;
    for (const t of filtered) {
      if (!t.due_date) continue;
      const key = t.due_date.slice(0, 10);
      (map[key] = map[key] || []).push(t);
    }
    return map;
  }, [tasks, viewAsId]);

  // Index events by date
  const eventsByDate = useMemo(() => {
    const map = {};
    const allEvents = [];
    // Reconstruct from members' recentEvents or from flat events
    if (events.length) {
      for (const e of events) {
        if (viewAsId && e.actor_id !== viewAsId) continue;
        const key = (e.occurred_at || '').slice(0, 10);
        if (!key) continue;
        (map[key] = map[key] || []).push(e);
      }
    } else {
      // Fallback: use members' recentEvents
      for (const m of members) {
        if (viewAsId && m.user_id !== viewAsId) continue;
        for (const e of (m.recentEvents || [])) {
          const key = (e.occurred_at || '').slice(0, 10);
          if (!key) continue;
          (map[key] = map[key] || []).push({ ...e, actor_id: m.user_id, name: m.display_name });
        }
      }
    }
    return map;
  }, [events, members, viewAsId]);

  // Name map for tooltips
  const nameMap = useMemo(() => Object.fromEntries(members.map((m) => [m.user_id, m.display_name])), [members]);

  // Max events per day for opacity scaling
  const maxEvents = useMemo(() => {
    let mx = 1;
    for (const v of Object.values(eventsByDate)) if (v.length > mx) mx = v.length;
    return mx;
  }, [eventsByDate]);

  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const deadlineKey = projectDeadline ? projectDeadline.slice(0, 10) : null;

  function dateKey(d) {
    return `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }

  // Selected date details
  const selKey = selectedDate ? dateKey(selectedDate) : null;
  const selTasks = selKey ? (tasksByDate[selKey] || []) : [];
  const selEvents = selKey ? (eventsByDate[selKey] || []) : [];

  return (
    <div className="cal-wrap fade-in">
      <div className="cal-header">
        <button className="btn btn-ghost small" onClick={prev}>&larr;</button>
        <h3 className="cal-month-year">{MONTHS[month]} {year}</h3>
        <button className="btn btn-ghost small" onClick={goToday}>Today</button>
        <button className="btn btn-ghost small" onClick={next}>&rarr;</button>
      </div>

      <div className="cal-legend">
        <span className="cal-leg-item"><span className="cal-dot cal-dot-task" /> Task due</span>
        <span className="cal-leg-item"><span className="cal-dot cal-dot-activity" /> Activity</span>
        <span className="cal-leg-item"><span className="cal-dot cal-dot-deadline" /> Project deadline</span>
        <span className="cal-leg-item"><span className="cal-dot cal-dot-overdue" /> Overdue</span>
      </div>

      <table className="cal-grid">
        <thead>
          <tr>{DAYS.map((d) => <th key={d}>{d}</th>)}</tr>
        </thead>
        <tbody>
          {weeks.map((week, wi) => (
            <tr key={wi}>
              {week.map((d, di) => {
                if (d === null) return <td key={di} className="cal-cell cal-empty" />;
                const key = dateKey(d);
                const dayTasks = tasksByDate[key] || [];
                const dayEvents = eventsByDate[key] || [];
                const isToday = key === todayKey;
                const isDeadline = key === deadlineKey;
                const isSelected = d === selectedDate;
                const hasOverdue = dayTasks.some((t) => t.status !== 'done' && new Date(t.due_date) < today);
                const intensity = dayEvents.length > 0 ? 0.15 + 0.85 * (dayEvents.length / maxEvents) : 0;

                return (
                  <td
                    key={di}
                    className={`cal-cell ${isToday ? 'cal-today' : ''} ${isDeadline ? 'cal-deadline' : ''} ${isSelected ? 'cal-selected' : ''} ${hasOverdue ? 'cal-overdue' : ''}`}
                    onClick={() => setSelectedDate(d === selectedDate ? null : d)}
                  >
                    <div className="cal-day-num">{d}</div>
                    {intensity > 0 && (
                      <div className="cal-heat" style={{ opacity: intensity }} />
                    )}
                    <div className="cal-indicators">
                      {dayTasks.length > 0 && <span className="cal-ind cal-ind-task">{dayTasks.length}</span>}
                      {dayEvents.length > 0 && <span className="cal-ind cal-ind-evt">{dayEvents.length}</span>}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      {selectedDate && (
        <div className="cal-detail fade-in">
          <div className="cal-detail-head">
            <h4>{MONTHS[month]} {selectedDate}, {year}</h4>
            <button className="btn btn-ghost small" onClick={() => setSelectedDate(null)}>&times;</button>
          </div>
          {selTasks.length === 0 && selEvents.length === 0 && (
            <div className="muted small">Nothing scheduled for this day.</div>
          )}
          {selTasks.length > 0 && (
            <div className="cal-detail-section">
              <div className="muted small" style={{ marginBottom: 4 }}>Tasks due ({selTasks.length})</div>
              <ul className="task-mini-list">
                {selTasks.map((t) => (
                  <li key={t.id}>
                    <span className={`pill pill-${t.priority} small`}>{t.priority}</span>
                    <span>{t.title}</span>
                    <span className={`pill pill-${t.status === 'done' ? 'ok' : 'muted'} small`}>{t.status.replace('_', ' ')}</span>
                    {t.assignee_id && nameMap[t.assignee_id] && (
                      <button className="btn btn-ghost small" onClick={() => onSelectMember?.(t.assignee_id)}>
                        {nameMap[t.assignee_id].split(' ')[0]}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {selEvents.length > 0 && (
            <div className="cal-detail-section">
              <div className="muted small" style={{ marginBottom: 4 }}>Activity ({selEvents.length})</div>
              <ul className="timeline">
                {selEvents.slice(0, 10).map((e, i) => (
                  <li key={i}>
                    <span className="tl-dot" />
                    <span className="small">
                      <b>{nameMap[e.actor_id] || 'Member'}</b> {e.kind?.replace(/_/g, ' ')}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * MiniCalendar — compact version for MemberDetail drawer.
 * Shows 21-day window with activity intensity + task due markers.
 */
export function MiniCalendar({ daily = [], tasks = [], startDate }) {
  const days = daily.length || 21;
  const max = Math.max(1, ...daily);
  const start = startDate ? new Date(startDate) : new Date(Date.now() - (days - 1) * 86400000);

  const cells = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(start.getTime() + i * 86400000);
    const key = d.toISOString().slice(0, 10);
    const tasksDue = tasks.filter((t) => t.due_date === key);
    const intensity = daily[i] > 0 ? 0.15 + 0.85 * (daily[i] / max) : 0;
    cells.push({
      date: d,
      key,
      dayOfWeek: d.getDay(),
      dayNum: d.getDate(),
      month: d.getMonth(),
      intensity,
      events: daily[i] || 0,
      tasksDue,
    });
  }

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="mini-cal">
      <div className="mini-cal-row mini-cal-head">
        {DAYS.map((d) => <span key={d} className="mini-cal-th">{d[0]}</span>)}
      </div>
      <div className="mini-cal-grid">
        {/* Pad first row */}
        {cells.length > 0 && new Array(cells[0].dayOfWeek).fill(null).map((_, i) => (
          <span key={`pad-${i}`} className="mini-cal-cell mini-cal-empty" />
        ))}
        {cells.map((c) => (
          <span
            key={c.key}
            className={`mini-cal-cell ${c.key === today ? 'mini-cal-today' : ''} ${c.tasksDue.length ? 'mini-cal-task' : ''}`}
            title={`${c.key}: ${c.events} events${c.tasksDue.length ? `, ${c.tasksDue.length} task(s) due` : ''}`}
          >
            <span className="mini-cal-num">{c.dayNum}</span>
            {c.intensity > 0 && <span className="mini-cal-heat" style={{ opacity: c.intensity }} />}
            {c.tasksDue.length > 0 && <span className="mini-cal-dot-task" />}
          </span>
        ))}
      </div>
    </div>
  );
}
