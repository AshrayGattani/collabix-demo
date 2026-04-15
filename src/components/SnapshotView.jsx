import React, { useMemo, useState } from 'react';
import { RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, ResponsiveContainer } from 'recharts';
import { MemberDetail } from './MemberDetail.jsx';

const SIGNAL_LABEL = {
  quiet: { label: 'Quiet', tone: 'warn' },
  late_spike: { label: 'Late spike', tone: 'err' },
  overloaded: { label: 'Overloaded', tone: 'err' },
};

const RISK_TONE = {
  low: 'ok', medium: 'warn', high: 'err', critical: 'err', unknown: 'muted',
};

const PRIORITY_TONE = {
  low: 'muted', medium: 'info', high: 'warn', urgent: 'err',
};

export function SnapshotView({ snapshot, readOnly = false }) {
  const { project, members, signals, heatmap, tasks, generatedAt, priorityCounts, statusCounts, teamDaily, attention } = snapshot;
  const [selectedId, setSelectedId] = useState(null);
  const [filterSignal, setFilterSignal] = useState(null);

  const selected = useMemo(
    () => members.find((m) => m.user_id === selectedId) || null,
    [members, selectedId]
  );
  const teamTotalActivity = useMemo(
    () => members.reduce((a, m) => a + (m.activity || 0), 0),
    [members]
  );

  const maxHeat = Math.max(1, ...heatmap.flatMap((r) => r.values));
  const radarData = members.map((m) => ({
    name: (m.display_name || 'Member').split(' ')[0] || m.display_name,
    activity: m.activity,
    consistency: Math.round(m.consistency * 10),
    tasksDone: m.doneTasks,
  }));

  const filteredMembers = filterSignal
    ? members.filter((m) => m.signals.includes(filterSignal))
    : members;

  const taskTotal = Object.values(priorityCounts || {}).reduce((a, b) => a + b, 0) || 1;
  const statusTotal = Object.values(statusCounts || {}).reduce((a, b) => a + b, 0) || 1;
  const teamMax = Math.max(1, ...(teamDaily || [0]));

  return (
    <div className="stack">
      <section className="stat-row">
        <Stat label="Balance" value={`${Math.round(signals.balance * 100)}%`} hint="Workload distribution" tone={signals.balance < 0.6 ? 'warn' : 'ok'} />
        <Stat label="Consistency" value={`${Math.round(signals.consistency * 100)}%`} hint="Daily-activity steadiness" tone={signals.consistency < 0.4 ? 'warn' : 'ok'} />
        <Stat
          label="Deadline risk"
          value={signals.deadlineRisk.level.toUpperCase()}
          tone={RISK_TONE[signals.deadlineRisk.level]}
          hint={signals.deadlineRisk.daysLeft == null ? 'No deadline set' : `${signals.deadlineRisk.daysLeft} days · ${Math.round(signals.deadlineRisk.openRatio * 100)}% open`}
        />
        <Stat label="Tasks" value={`${tasks.filter((t) => t.status === 'done').length}/${tasks.length}`} hint="Done / total" />
      </section>

      {attention && attention.length > 0 && (
        <section className="card attention">
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
              <button key={a.user_id} className="attention-card" onClick={() => setSelectedId(a.user_id)}>
                <div className="attention-name">{a.display_name}</div>
                <div className="signals">
                  {a.signals.map((s) => (
                    <span key={s} className={`pill pill-${SIGNAL_LABEL[s]?.tone || 'muted'}`}>{SIGNAL_LABEL[s]?.label || s}</span>
                  ))}
                </div>
                <div className="muted small">{a.reasons[a.signals[0]]}</div>
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="grid-2">
        <div className="card">
          <div className="section-head">
            <h3>Contribution heatmap <span className="muted small">(last 21 days)</span></h3>
          </div>
          <div className="heatmap">
            {heatmap.map((row) => {
              const dimmed = filterSignal && !members.find((m) => m.user_id === row.user_id)?.signals.includes(filterSignal);
              return (
                <div key={row.user_id} className={`heatmap-row ${dimmed ? 'dim' : ''}`} onClick={() => setSelectedId(row.user_id)}>
                  <div className="heatmap-name">{row.name}</div>
                  <div className="heatmap-cells">
                    {row.values.map((v, i) => {
                      const a = v === 0 ? 0 : 0.15 + 0.85 * (v / maxHeat);
                      return <span key={i} className="heatmap-cell" style={{ background: `rgba(99,102,241,${a})` }} title={`${row.name} · day ${i + 1}: ${v} event${v === 1 ? '' : 's'}`} />;
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="card">
          <div className="section-head">
            <h3>Workload radar</h3>
          </div>
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

      <section className="grid-2">
        <div className="card">
          <div className="section-head">
            <h3>Task mix</h3>
            <span className="muted small">{tasks.length} total</span>
          </div>
          <div className="stack-sm">
            <BarRow label="Priority" segments={['low','medium','high','urgent'].map((k) => ({ key: k, tone: PRIORITY_TONE[k], value: priorityCounts?.[k] || 0 }))} total={taskTotal} />
            <BarRow label="Status"   segments={['todo','in_progress','review','done'].map((k) => ({ key: k, tone: k === 'done' ? 'ok' : k === 'review' ? 'warn' : 'muted', value: statusCounts?.[k] || 0 }))} total={statusTotal} />
          </div>
        </div>

        <div className="card">
          <div className="section-head">
            <h3>Team activity <span className="muted small">(last 21 days)</span></h3>
          </div>
          <div className="team-spark">
            {(teamDaily || []).map((v, i) => (
              <div key={i} className="team-spark-bar" style={{ height: `${(v / teamMax) * 100}%`, opacity: v === 0 ? 0.15 : 0.9 }} title={`Day ${i + 1}: ${v}`} />
            ))}
          </div>
        </div>
      </section>

      <section className="card">
        <div className="section-head">
          <h3>Team <span className="muted small">({filteredMembers.length})</span></h3>
          <span className="muted small">Click anyone to drill in</span>
        </div>
        <div className="member-list">
          {filteredMembers.map((m) => (
            <button
              type="button"
              key={m.user_id}
              className="member-row member-row-clickable"
              onClick={() => setSelectedId(m.user_id)}
            >
              <Avatar name={m.display_name} url={m.avatar_url} />
              <div className="member-main">
                <div className="member-name">
                  {m.display_name} <span className="muted small">· {m.role}</span>
                </div>
                <div className="muted small">Last active {relTime(m.last_active_at)}</div>
                <div className="signals">
                  {m.signals.length === 0
                    ? <span className="pill pill-ok">On track</span>
                    : m.signals.map((s) => (
                        <span key={s} className={`pill pill-${SIGNAL_LABEL[s]?.tone || 'muted'}`}>{SIGNAL_LABEL[s]?.label || s}</span>
                      ))}
                </div>
              </div>
              <div className="member-stats">
                <div><b>{m.activity}</b><span className="muted small"> activity</span></div>
                <div><b>{m.doneTasks}</b><span className="muted small"> done</span></div>
                <div><b>{m.openTasks}</b><span className="muted small"> open</span></div>
              </div>
            </button>
          ))}
          {filteredMembers.length === 0 && <div className="muted small">No members match this filter.</div>}
        </div>
      </section>

      <p className="muted small">Generated {new Date(generatedAt).toLocaleString()}{readOnly && ' · public snapshot'}</p>

      {selected && !readOnly && (
        <MemberDetail
          member={selected}
          teamTotalActivity={teamTotalActivity}
          onClose={() => setSelectedId(null)}
        />
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
          <span key={s.key} className="small">
            <span className={`dot dot-${s.tone}`} /> {s.key} <b>{s.value}</b>
          </span>
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
