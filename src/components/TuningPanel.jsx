import React, { useState } from 'react';

const DEFAULTS = {
  quietWindowDays: 7,
  quietMaxEvents: 1,
  spikeRecentDays: 7,
  spikePriorDays: 21,
  spikeRecentMin: 3,
  spikeRatio: 2,
  overloadOpenTasks: 5,
  overloadUrgentTasks: 2,
};

const FIELDS = [
  { key: 'quietWindowDays',    label: 'Quiet window (days)',        min: 1,  max: 30, step: 1 },
  { key: 'quietMaxEvents',     label: 'Quiet: max events in window', min: 0,  max: 10, step: 1 },
  { key: 'spikeRecentDays',    label: 'Spike recent window (days)', min: 1,  max: 21, step: 1 },
  { key: 'spikePriorDays',     label: 'Spike prior window (days)',  min: 1,  max: 60, step: 1 },
  { key: 'spikeRecentMin',     label: 'Spike: min recent events',   min: 1,  max: 20, step: 1 },
  { key: 'spikeRatio',         label: 'Spike ratio (recent / prior)', min: 1, max: 10, step: 0.5 },
  { key: 'overloadOpenTasks',  label: 'Overload: open tasks >',     min: 1,  max: 20, step: 1 },
  { key: 'overloadUrgentTasks',label: 'Overload: urgent tasks ≥',   min: 1,  max: 10, step: 1 },
];

export function TuningPanel({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const th = { ...DEFAULTS, ...(value || {}) };

  function set(k, v) { onChange({ ...th, [k]: v }); }

  return (
    <section className="card tuning">
      <div className="tuning-head" onClick={() => setOpen((o) => !o)}>
        <div>
          <h3 style={{ margin: 0 }}>Signal tuning</h3>
          <div className="muted small">Change thresholds live — signals recompute on the server on each change.</div>
        </div>
        <button className="btn btn-ghost small">{open ? 'Hide' : 'Show'}</button>
      </div>
      {open && (
        <div className="tuning-grid">
          {FIELDS.map((f) => (
            <label key={f.key} className="tuning-field">
              <span>{f.label} <b>{th[f.key]}</b></span>
              <input
                type="range"
                min={f.min} max={f.max} step={f.step}
                value={th[f.key]}
                onChange={(e) => set(f.key, Number(e.target.value))}
              />
            </label>
          ))}
          <div className="tuning-actions">
            <button className="btn btn-ghost small" onClick={() => onChange({ ...DEFAULTS })}>Reset to defaults</button>
          </div>
        </div>
      )}
    </section>
  );
}
