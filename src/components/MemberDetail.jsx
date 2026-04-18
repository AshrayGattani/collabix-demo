import React, { useEffect } from 'react';
import { MiniCalendar } from './CalendarView.jsx';

const SIGNAL = {
  quiet:      { label: 'Quiet',       tone: 'warn', blurb: 'Low activity in the recent window' },
  late_spike: { label: 'Late spike',  tone: 'err',  blurb: 'Sudden surge after a quieter stretch' },
  overloaded: { label: 'Overloaded',  tone: 'err',  blurb: 'Too many open or urgent tasks' },
};

const STATUS = {
  todo:        { label: 'To do',       tone: 'muted' },
  in_progress: { label: 'In progress', tone: 'info' },
  review:      { label: 'Review',      tone: 'warn' },
  done:        { label: 'Done',        tone: 'ok' },
};

const PRIORITY = {
  low:    'low', medium: 'medium', high: 'high', urgent: 'urgent',
};

export function MemberDetail({ member, onClose, teamTotalActivity }) {
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!member) return null;
  const share = teamTotalActivity > 0 ? member.activity / teamTotalActivity : 0;
  const tasksByStatus = (member.tasks || []).reduce((acc, t) => {
    (acc[t.status] = acc[t.status] || []).push(t);
    return acc;
  }, {});
  const max = Math.max(1, ...(member.daily || [1]));

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside className="drawer" onClick={(e) => e.stopPropagation()}>
        <header className="drawer-head">
          <div className="drawer-title">
            <Avatar name={member.display_name} url={member.avatar_url} size={48} />
            <div>
              <h2 style={{ margin: 0 }}>{member.display_name}</h2>
              <div className="muted small">
                {member.role} · {member.email || '—'} · last active {relTime(member.last_active_at)}
              </div>
            </div>
          </div>
          <button className="btn btn-ghost" onClick={onClose}>✕</button>
        </header>

        <section className="drawer-grid">
          <Stat label="Activity (14d)" value={member.activity} />
          <Stat label="Consistency" value={`${Math.round(member.consistency * 100)}%`} />
          <Stat label="Share of team" value={`${Math.round(share * 100)}%`} />
          <Stat label="Open / Done" value={`${member.openTasks} / ${member.doneTasks}`} />
        </section>

        <section className="drawer-section">
          <div className="section-head">
            <h3>Signals</h3>
            <span className="muted small">Why this member is flagged</span>
          </div>
          {member.signals.length === 0 ? (
            <div className="pill pill-ok">On track — no signals firing.</div>
          ) : (
            <div className="stack-sm">
              {member.signals.map((s) => (
                <div key={s} className={`signal-card signal-${SIGNAL[s]?.tone || 'muted'}`}>
                  <div className="signal-head">
                    <span className={`pill pill-${SIGNAL[s]?.tone}`}>{SIGNAL[s]?.label || s}</span>
                    <span className="muted small">{SIGNAL[s]?.blurb}</span>
                  </div>
                  <p className="small">{member.reasons?.[s] || ''}</p>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="drawer-section">
          <div className="section-head">
            <h3>21-day activity</h3>
            <span className="muted small">Daily events, oldest → newest</span>
          </div>
          <Sparkline values={member.daily || []} max={max} />
        </section>

        <section className="drawer-section">
          <div className="section-head">
            <h3>Calendar</h3>
            <span className="muted small">Activity + deadlines</span>
          </div>
          <MiniCalendar
            daily={member.daily || []}
            tasks={member.tasks || []}
            startDate={new Date(Date.now() - 20 * 86400000).toISOString()}
          />
        </section>

        <section className="drawer-section">
          <div className="section-head">
            <h3>Tasks <span className="muted small">({(member.tasks || []).length})</span></h3>
          </div>
          {(member.tasks || []).length === 0 ? (
            <div className="muted small">No tasks assigned.</div>
          ) : (
            <div className="stack-sm">
              {['todo', 'in_progress', 'review', 'done'].map((st) => (
                (tasksByStatus[st] || []).length > 0 && (
                  <div key={st}>
                    <div className="muted small" style={{ marginBottom: 4 }}>
                      {STATUS[st].label} · {tasksByStatus[st].length}
                    </div>
                    <ul className="task-mini-list">
                      {tasksByStatus[st].map((t) => (
                        <li key={t.id}>
                          <span className={`pill pill-${PRIORITY[t.priority] || 'muted'} small`}>{t.priority}</span>
                          <span>{t.title}</span>
                          {t.due_date && <span className="muted small">· due {t.due_date}</span>}
                        </li>
                      ))}
                    </ul>
                  </div>
                )
              ))}
            </div>
          )}
        </section>

        <section className="drawer-section">
          <div className="section-head">
            <h3>Recent activity</h3>
          </div>
          {(member.recentEvents || []).length === 0 ? (
            <div className="muted small">No events recorded yet.</div>
          ) : (
            <ul className="timeline">
              {member.recentEvents.map((e, i) => (
                <li key={i}>
                  <span className="tl-dot" />
                  <span className="small">
                    <b>{e.kind}</b> <span className="muted">· {relTime(e.occurred_at)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </aside>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="drawer-stat">
      <div className="muted small">{label}</div>
      <div className="drawer-stat-value">{value}</div>
    </div>
  );
}

function Sparkline({ values, max }) {
  const w = 100, h = 28, step = values.length > 1 ? w / (values.length - 1) : 0;
  const pts = values.map((v, i) => `${(i * step).toFixed(2)},${(h - (v / max) * h).toFixed(2)}`).join(' ');
  const barW = values.length ? w / values.length : 0;
  return (
    <div className="sparkline-wrap">
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="sparkline">
        {values.map((v, i) => (
          <rect
            key={i}
            x={i * barW + 0.2}
            y={h - (v / max) * h}
            width={Math.max(0.1, barW - 0.4)}
            height={(v / max) * h}
            fill="rgba(99,102,241,0.7)"
          />
        ))}
        <polyline fill="none" stroke="#22d3ee" strokeWidth="1" points={pts} />
      </svg>
      <div className="sparkline-axis muted small">
        <span>21d ago</span><span>today</span>
      </div>
    </div>
  );
}

function Avatar({ name, url, size = 32 }) {
  if (url) return <img className="avatar" src={url} alt={name} style={{ width: size, height: size }} />;
  const letter = (name || '?').trim().charAt(0).toUpperCase();
  return <div className="avatar avatar-fallback" style={{ width: size, height: size, fontSize: size / 2.2 }}>{letter}</div>;
}

function relTime(iso) {
  if (!iso) return 'never';
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 0) return 'just now';
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}
