import React, { useMemo, useState } from 'react';
import { RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { MemberDetail } from './MemberDetail.jsx';
import { CalendarView } from './CalendarView.jsx';

const SIGNAL_LABEL = {
  quiet: { label: 'Quiet', tone: 'warn' },
  late_spike: { label: 'Late spike', tone: 'err' },
  overloaded: { label: 'Overloaded', tone: 'err' },
};
const RISK_TONE = { low: 'ok', medium: 'warn', high: 'err', critical: 'err', unknown: 'muted' };
const PRIORITY_TONE = { low: 'muted', medium: 'info', high: 'warn', urgent: 'err' };

export function SnapshotView({ snapshot, readOnly = false, viewAsId = null }) {
  const { project, members, signals, heatmap, tasks, generatedAt, priorityCounts, statusCounts, teamDaily, attention } = snapshot;
  const [selectedId, setSelectedId] = useState(null);
  const [filterSignal, setFilterSignal] = useState(null);
  const [compareIds, setCompareIds] = useState([]); // [idA, idB]
  const [heatMode, setHeatMode] = useState('heatmap'); // 'heatmap' | 'calendar'

  const selected = useMemo(() => members.find((m) => m.user_id === selectedId) || null, [members, selectedId]);
  const teamTotalActivity = useMemo(() => members.reduce((a, m) => a + (m.activity || 0), 0), [members]);

  // When "view as" is active, highlight that member
  const viewAsMember = viewAsId ? members.find((m) => m.user_id === viewAsId) : null;

  const maxHeat = Math.max(1, ...heatmap.flatMap((r) => r.values));
  const radarData = members.map((m) => ({
    name: (m.display_name || 'Member').split(' ')[0],
    activity: m.activity,
    consistency: Math.round(m.consistency * 10),
    tasksDone: m.doneTasks,
  }));

  const filteredMembers = filterSignal ? members.filter((m) => m.signals.includes(filterSignal)) : members;
  const taskTotal = Object.values(priorityCounts || {}).reduce((a, b) => a + b, 0) || 1;
  const statusTotal = Object.values(statusCounts || {}).reduce((a, b) => a + b, 0) || 1;
  const teamMax = Math.max(1, ...(teamDaily || [0]));

  // Burndown data: cumulative done tasks over 21 days
  const burndown = useMemo(() => {
    const days = 21;
    const now = Date.now();
    const DAY = 86400000;
    const doneTasks = tasks.filter((t) => t.status === 'done');
    const totalTasks = tasks.length;
    const data = [];
    for (let i = 0; i < days; i++) {
      const dayEnd = now - (days - 1 - i) * DAY;
      const events = members.flatMap((m) => (m.recentEvents || []).filter(
        (e) => e.kind === 'task_completed' && new Date(e.occurred_at).getTime() <= dayEnd
      ));
      // Approximate: count total events as completed so far up to that day
      const open = Math.max(0, totalTasks - events.length);
      data.push({ day: `D${i + 1}`, open, target: Math.round(totalTasks * (1 - i / (days - 1))) });
    }
    return data;
  }, [tasks, members]);

  // Compare members
  const compareMembers = compareIds.map((id) => members.find((m) => m.user_id === id)).filter(Boolean);

  function toggleCompare(id) {
    setCompareIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 2) return [prev[1], id];
      return [...prev, id];
    });
  }

  return (
    <div className="stack">
      {/* View-as personal summary */}
      {viewAsMember && (
        <section className="card view-as-card fade-in">
          <div className="section-head">
            <h3>{viewAsMember.display_name}'s view</h3>
            <div className="signals">
              {viewAsMember.signals.length === 0
                ? <span className="pill pill-ok">On track</span>
                : viewAsMember.signals.map((s) => (
                    <span key={s} className={`pill pill-${SIGNAL_LABEL[s]?.tone}`}>{SIGNAL_LABEL[s]?.label}</span>
                  ))}
            </div>
          </div>
          <div className="view-as-stats">
            <MiniStat label="My activity" value={viewAsMember.activity} />
            <MiniStat label="Consistency" value={`${Math.round(viewAsMember.consistency * 100)}%`} />
            <MiniStat label="Open tasks" value={viewAsMember.openTasks} />
            <MiniStat label="Done" value={viewAsMember.doneTasks} />
            <MiniStat label="Urgent" value={viewAsMember.urgentOpen || 0} />
            <MiniStat label="Share of team" value={`${teamTotalActivity ? Math.round((viewAsMember.activity / teamTotalActivity) * 100) : 0}%`} />
          </div>
          {viewAsMember.signals.length > 0 && (
            <div className="stack-sm" style={{ marginTop: 10 }}>
              {viewAsMember.signals.map((s) => (
                <div key={s} className={`signal-card signal-${SIGNAL_LABEL[s]?.tone}`}>
                  <span className={`pill pill-${SIGNAL_LABEL[s]?.tone}`}>{SIGNAL_LABEL[s]?.label}</span>
                  <span className="muted small" style={{ marginLeft: 8 }}>{viewAsMember.reasons?.[s]}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      <section className="stat-row fade-in">
        <Stat label="Balance" value={`${Math.round(signals.balance * 100)}%`} hint="Workload distribution" tone={signals.balance < 0.6 ? 'warn' : 'ok'} />
        <Stat label="Consistency" value={`${Math.round(signals.consistency * 100)}%`} hint="Daily-activity steadiness" tone={signals.consistency < 0.4 ? 'warn' : 'ok'} />
        <Stat
          label="Deadline risk"
          value={signals.deadlineRisk.level.toUpperCase()}
          tone={RISK_TONE[signals.deadlineRisk.level]}
          hint={signals.deadlineRisk.daysLeft == null ? 'No deadline set' : `${signals.deadlineRisk.daysLeft} days \u00b7 ${Math.round(signals.deadlineRisk.openRatio * 100)}% open`}
        />
        <Stat label="Tasks" value={<ProgressRing done={tasks.filter((t) => t.status === 'done').length} total={tasks.length} />} hint="Done / total" />
      </section>

      {attention && attention.length > 0 && (
        <section className="card attention fade-in">
          <div className="section-head">
            <h3>Needs attention <span className="muted small">({attention.length})</span></h3>
            <div className="filter-chips">
              <button className={`chip ${!filterSignal ? 'active' : ''}`} onClick={() => setFilterSignal(null)}>All</button>
              {['quiet', 'late_spike', 'overloaded'].map((s) => (
                <button key={s} className={`chip ${filterSignal === s ? 'active' : ''}`} onClick={() => setFilterSignal(filterSignal === s ? null : s)}>
                  {SIGNAL_LABEL[s].label}
                </button>
              ))}
            </div>
          </div>
          <div className="attention-grid">
            {attention.map((a) => (
              <button key={a.user_id} className={`attention-card ${viewAsId === a.user_id ? 'attention-you' : ''}`} onClick={() => setSelectedId(a.user_id)}>
                <div className="attention-name">{a.display_name}{viewAsId === a.user_id ? ' (you)' : ''}</div>
                <div className="signals">
                  {a.signals.map((s) => (
                    <span key={s} className={`pill pill-${SIGNAL_LABEL[s]?.tone}`}>{SIGNAL_LABEL[s]?.label}</span>
                  ))}
                </div>
                <div className="muted small">{a.reasons[a.signals[0]]}</div>
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="grid-2 fade-in">
        <div className="card">
          <div className="section-head">
            <h3>{heatMode === 'heatmap' ? 'Contribution heatmap' : 'Activity calendar'} <span className="muted small">(last 21 days)</span></h3>
            <div className="filter-chips">
              <button className={`chip ${heatMode === 'heatmap' ? 'active' : ''}`} onClick={() => setHeatMode('heatmap')}>Heatmap</button>
              <button className={`chip ${heatMode === 'calendar' ? 'active' : ''}`} onClick={() => setHeatMode('calendar')}>Calendar</button>
            </div>
          </div>
          {heatMode === 'heatmap' ? (
            <div className="heatmap">
              {heatmap.map((row) => {
                const dimmed = filterSignal && !members.find((m) => m.user_id === row.user_id)?.signals.includes(filterSignal);
                const isViewAs = viewAsId === row.user_id;
                return (
                  <div key={row.user_id} className={`heatmap-row ${dimmed ? 'dim' : ''} ${isViewAs ? 'heatmap-highlight' : ''}`} onClick={() => setSelectedId(row.user_id)}>
                    <div className="heatmap-name">{row.name}{isViewAs ? ' *' : ''}</div>
                    <div className="heatmap-cells">
                      {row.values.map((v, i) => {
                        const a = v === 0 ? 0 : 0.15 + 0.85 * (v / maxHeat);
                        return <span key={i} className="heatmap-cell" style={{ background: `rgba(99,102,241,${a})` }} title={`${row.name} \u00b7 day ${i + 1}: ${v} event${v === 1 ? '' : 's'}`} />;
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <CalendarView
              tasks={tasks}
              members={members}
              events={members.flatMap((m) => (m.recentEvents || []).map((e) => ({ ...e, actor_id: m.user_id, name: m.display_name })))}
              viewAsId={viewAsId}
              onSelectMember={(id) => setSelectedId(id)}
              projectDeadline={project.deadline}
            />
          )}
        </div>
        <div className="card">
          <div className="section-head"><h3>Workload radar</h3></div>
          <div style={{ width: '100%', height: 280 }}>
            <ResponsiveContainer>
              <RadarChart data={radarData}>
                <PolarGrid stroke="rgba(255,255,255,0.12)" />
                <PolarAngleAxis dataKey="name" tick={{ fill: 'rgba(230,232,240,0.8)', fontSize: 12 }} />
                <PolarRadiusAxis tick={false} axisLine={false} />
                <Radar name="Activity" dataKey="activity" stroke="#6366f1" fill="#6366f1" fillOpacity={0.35} />
                <Radar name="Consistency" dataKey="consistency" stroke="#22d3ee" fill="#22d3ee" fillOpacity={0.25} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      <section className="grid-2 fade-in">
        <div className="card">
          <div className="section-head"><h3>Task mix</h3><span className="muted small">{tasks.length} total</span></div>
          <div className="stack-sm">
            <BarRow label="Priority" segments={['low','medium','high','urgent'].map((k) => ({ key: k, tone: PRIORITY_TONE[k], value: priorityCounts?.[k] || 0 }))} total={taskTotal} />
            <BarRow label="Status" segments={['todo','in_progress','review','done'].map((k) => ({ key: k, tone: k === 'done' ? 'ok' : k === 'review' ? 'warn' : 'muted', value: statusCounts?.[k] || 0 }))} total={statusTotal} />
          </div>
        </div>
        <div className="card">
          <div className="section-head"><h3>Team activity <span className="muted small">(last 21 days)</span></h3></div>
          <div className="team-spark">
            {(teamDaily || []).map((v, i) => (
              <div key={i} className="team-spark-bar" style={{ height: `${(v / teamMax) * 100}%`, opacity: v === 0 ? 0.15 : 0.9 }} title={`Day ${i + 1}: ${v}`} />
            ))}
          </div>
        </div>
      </section>

      {/* Burndown chart */}
      <section className="card fade-in">
        <div className="section-head"><h3>Burndown</h3><span className="muted small">Open tasks vs ideal over 21 days</span></div>
        <div style={{ width: '100%', height: 200 }}>
          <ResponsiveContainer>
            <AreaChart data={burndown}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
              <XAxis dataKey="day" tick={{ fill: 'rgba(230,232,240,0.5)', fontSize: 11 }} interval={4} />
              <YAxis tick={{ fill: 'rgba(230,232,240,0.5)', fontSize: 11 }} />
              <Tooltip contentStyle={{ background: '#1e1e2e', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, fontSize: 12 }} />
              <Area type="monotone" dataKey="target" stroke="#22d3ee" fill="none" strokeDasharray="4 4" name="Ideal" />
              <Area type="monotone" dataKey="open" stroke="#6366f1" fill="#6366f1" fillOpacity={0.2} name="Open" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* Team with compare mode */}
      <section className="card fade-in">
        <div className="section-head">
          <h3>Team <span className="muted small">({filteredMembers.length})</span></h3>
          <div className="section-head-right">
            {compareIds.length > 0 && (
              <button className="btn btn-ghost small" onClick={() => setCompareIds([])}>Clear compare</button>
            )}
            <span className="muted small">Click to drill in \u00b7 use checkboxes to compare</span>
          </div>
        </div>
        <div className="member-list">
          {filteredMembers.map((m) => {
            const isViewAs = viewAsId === m.user_id;
            const isCompared = compareIds.includes(m.user_id);
            return (
              <div key={m.user_id} className={`member-row member-row-clickable ${isViewAs ? 'member-you' : ''} ${isCompared ? 'member-compared' : ''}`}>
                <label className="compare-check" title="Compare" onClick={(e) => e.stopPropagation()}>
                  <input type="checkbox" checked={isCompared} onChange={() => toggleCompare(m.user_id)} />
                </label>
                <button type="button" className="member-row-btn" onClick={() => setSelectedId(m.user_id)}>
                  <Avatar name={m.display_name} url={m.avatar_url} />
                  <div className="member-main">
                    <div className="member-name">
                      {m.display_name}{isViewAs ? ' (you)' : ''} <span className="muted small">\u00b7 {m.role}</span>
                    </div>
                    <div className="muted small">Last active {relTime(m.last_active_at)}</div>
                    <div className="signals">
                      {m.signals.length === 0
                        ? <span className="pill pill-ok">On track</span>
                        : m.signals.map((s) => (
                            <span key={s} className={`pill pill-${SIGNAL_LABEL[s]?.tone}`}>{SIGNAL_LABEL[s]?.label}</span>
                          ))}
                    </div>
                  </div>
                  <div className="member-stats">
                    <div><b>{m.activity}</b><span className="muted small"> activity</span></div>
                    <div><b>{m.doneTasks}</b><span className="muted small"> done</span></div>
                    <div><b>{m.openTasks}</b><span className="muted small"> open</span></div>
                  </div>
                </button>
              </div>
            );
          })}
          {filteredMembers.length === 0 && <div className="muted small">No members match this filter.</div>}
        </div>
      </section>

      {/* Member comparison overlay */}
      {compareMembers.length === 2 && (
        <section className="card compare-card fade-in">
          <div className="section-head">
            <h3>Comparing: {compareMembers[0].display_name} vs {compareMembers[1].display_name}</h3>
            <button className="btn btn-ghost small" onClick={() => setCompareIds([])}>Close</button>
          </div>
          <div className="compare-grid">
            {compareMembers.map((m) => (
              <div key={m.user_id} className="compare-col">
                <div className="compare-name"><Avatar name={m.display_name} url={m.avatar_url} /> {m.display_name}</div>
                <div className="compare-stats">
                  <CompStat label="Activity (14d)" value={m.activity} />
                  <CompStat label="Consistency" value={`${Math.round(m.consistency * 100)}%`} />
                  <CompStat label="Open tasks" value={m.openTasks} />
                  <CompStat label="Done tasks" value={m.doneTasks} />
                  <CompStat label="Urgent" value={m.urgentOpen || 0} />
                  <CompStat label="Share" value={`${teamTotalActivity ? Math.round((m.activity / teamTotalActivity) * 100) : 0}%`} />
                </div>
                <div className="signals" style={{ marginTop: 8 }}>
                  {m.signals.length === 0 ? <span className="pill pill-ok">On track</span>
                    : m.signals.map((s) => <span key={s} className={`pill pill-${SIGNAL_LABEL[s]?.tone}`}>{SIGNAL_LABEL[s]?.label}</span>)}
                </div>
                <div className="sparkline-compare">
                  <MiniSparkline values={m.daily || []} />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <p className="muted small">Generated {new Date(generatedAt).toLocaleString()}{readOnly && ' \u00b7 public snapshot'}</p>

      {selected && !readOnly && (
        <MemberDetail member={selected} teamTotalActivity={teamTotalActivity} onClose={() => setSelectedId(null)} />
      )}
    </div>
  );
}

function Stat({ label, value, hint, tone }) {
  return (
    <div className={`stat stat-${tone || 'default'}`}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {hint && <div className="stat-hint">{hint}</div>}
    </div>
  );
}

function MiniStat({ label, value }) {
  return <div className="mini-stat"><span className="muted small">{label}</span><b>{value}</b></div>;
}

function CompStat({ label, value }) {
  return <div className="comp-stat"><span className="muted small">{label}</span><span className="comp-val">{value}</span></div>;
}

function ProgressRing({ done, total }) {
  const pct = total ? done / total : 0;
  const r = 16, c = 2 * Math.PI * r, offset = c * (1 - pct);
  return (
    <span className="progress-ring-wrap">
      <svg width="40" height="40" viewBox="0 0 40 40">
        <circle cx="20" cy="20" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="4" />
        <circle cx="20" cy="20" r={r} fill="none" stroke="#10b981" strokeWidth="4" strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round" transform="rotate(-90 20 20)" />
      </svg>
      <span className="progress-ring-text">{done}/{total}</span>
    </span>
  );
}

function MiniSparkline({ values }) {
  const max = Math.max(1, ...values);
  const w = 100, h = 24;
  const barW = values.length ? w / values.length : 0;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ width: '100%', height: 32 }}>
      {values.map((v, i) => (
        <rect key={i} x={i * barW + 0.2} y={h - (v / max) * h} width={Math.max(0.1, barW - 0.4)} height={(v / max) * h} fill="rgba(99,102,241,0.6)" />
      ))}
    </svg>
  );
}

function BarRow({ label, segments, total }) {
  return (
    <div className="barrow">
      <div className="barrow-label">{label}</div>
      <div className="barrow-bar">
        {segments.map((s) => {
          const pct = total ? (s.value / total) * 100 : 0;
          if (pct === 0) return null;
          return <span key={s.key} className={`barrow-seg barrow-${s.tone}`} style={{ width: `${pct}%` }} title={`${s.key}: ${s.value}`} />;
        })}
      </div>
      <div className="barrow-legend">
        {segments.map((s) => (
          <span key={s.key} className="small"><span className={`dot dot-${s.tone}`} /> {s.key} <b>{s.value}</b></span>
        ))}
      </div>
    </div>
  );
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

function Avatar({ name, url }) {
  if (url) return <img className="avatar" src={url} alt={name} />;
  const letter = (name || '?').trim().charAt(0).toUpperCase();
  return <div className="avatar avatar-fallback">{letter}</div>;
}
