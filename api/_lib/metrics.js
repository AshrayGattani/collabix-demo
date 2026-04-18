// Pure signal + scoring functions. No DB dependencies.
// Inputs are plain arrays of events/tasks so these are easy to unit-test.

const DAY = 86400 * 1000;

export function daysAgo(n, from = Date.now()) {
  return new Date(from - n * DAY);
}

// Activity score: weighted sum of events over last 14 days, normalized.
export function activityScore(events, now = Date.now()) {
  const cutoff = now - 14 * DAY;
  let sum = 0;
  for (const e of events) {
    const t = new Date(e.occurred_at).getTime();
    if (t >= cutoff) sum += Number(e.weight || 1);
  }
  return sum;
}

// Consistency: 1 - normalized variance of daily activity over last 14 days.
export function consistencyScore(events, now = Date.now()) {
  const days = 14;
  const buckets = new Array(days).fill(0);
  const cutoff = now - days * DAY;
  for (const e of events) {
    const t = new Date(e.occurred_at).getTime();
    if (t < cutoff) continue;
    const idx = Math.min(days - 1, Math.floor((t - cutoff) / DAY));
    buckets[idx] += Number(e.weight || 1);
  }
  const mean = buckets.reduce((a, b) => a + b, 0) / days;
  if (mean === 0) return 0;
  const variance = buckets.reduce((a, b) => a + (b - mean) ** 2, 0) / days;
  const cv = Math.sqrt(variance) / mean; // coefficient of variation
  return Math.max(0, 1 - Math.min(cv, 1));
}

// Balance: Shannon entropy of per-member activity shares, normalized to [0,1].
export function balanceScore(perMember) {
  const total = perMember.reduce((a, b) => a + (b.activity || 0), 0);
  if (total === 0 || perMember.length < 2) return 0;
  let H = 0;
  for (const m of perMember) {
    const p = (m.activity || 0) / total;
    if (p > 0) H -= p * Math.log2(p);
  }
  const Hmax = Math.log2(perMember.length);
  return Hmax === 0 ? 0 : H / Hmax;
}

export const DEFAULT_THRESHOLDS = {
  quietWindowDays: 7,
  quietMaxEvents: 1, // "< 2 events" → threshold 1
  spikeRecentDays: 7,
  spikePriorDays: 21,
  spikeRecentMin: 3,
  spikeRatio: 2,
  overloadOpenTasks: 5,
  overloadUrgentTasks: 2,
};

// Quiet: fewer than (quietMaxEvents+1) events in the last quietWindowDays days.
export function isQuiet(memberEvents, now = Date.now(), th = DEFAULT_THRESHOLDS) {
  const cutoff = now - th.quietWindowDays * DAY;
  const recent = memberEvents.filter((e) => new Date(e.occurred_at).getTime() >= cutoff).length;
  return recent <= th.quietMaxEvents;
}

// Late spike: recent events >= spikeRecentMin AND > spikeRatio x prior window AND prior >= 1.
export function hasLateSpike(memberEvents, now = Date.now(), th = DEFAULT_THRESHOLDS) {
  const recentCutoff = now - th.spikeRecentDays * DAY;
  const priorCutoff = now - (th.spikeRecentDays + th.spikePriorDays) * DAY;
  let recent = 0, earlier = 0;
  for (const e of memberEvents) {
    const t = new Date(e.occurred_at).getTime();
    if (t >= recentCutoff) recent += 1;
    else if (t >= priorCutoff) earlier += 1;
  }
  return recent >= th.spikeRecentMin && earlier >= 1 && recent > earlier * th.spikeRatio;
}

// Overloaded: assignee has > overloadOpenTasks open tasks OR >= overloadUrgentTasks urgent open tasks.
export function isOverloaded(memberTasks, th = DEFAULT_THRESHOLDS) {
  const open = memberTasks.filter((t) => t.status !== 'done');
  const urgent = open.filter((t) => t.priority === 'urgent');
  return open.length > th.overloadOpenTasks || urgent.length >= th.overloadUrgentTasks;
}

// Deadline risk based on open tasks + days to deadline.
export function deadlineRisk({ deadline, tasks }) {
  if (!deadline) return { level: 'unknown', daysLeft: null, openRatio: 0 };
  const daysLeft = Math.ceil((new Date(deadline).getTime() - Date.now()) / DAY);
  const total = tasks.length || 1;
  const open = tasks.filter((t) => t.status !== 'done').length;
  const openRatio = open / total;
  let level = 'low';
  if (daysLeft < 0) level = 'critical';
  else if (daysLeft <= 3 && openRatio > 0.3) level = 'high';
  else if (daysLeft <= 7 && openRatio > 0.5) level = 'high';
  else if (openRatio > 0.6) level = 'medium';
  return { level, daysLeft, openRatio: Number(openRatio.toFixed(2)) };
}

// Compute full dashboard snapshot.
export function computeSnapshot({ project, members, tasks, events, thresholds }) {
  const th = { ...DEFAULT_THRESHOLDS, ...(thresholds || {}) };
  const now = Date.now();
  const eventsByMember = new Map();
  for (const m of members) eventsByMember.set(m.user_id, []);
  for (const e of events) {
    if (!eventsByMember.has(e.actor_id)) eventsByMember.set(e.actor_id, []);
    eventsByMember.get(e.actor_id).push(e);
  }
  const tasksByMember = new Map();
  for (const m of members) tasksByMember.set(m.user_id, []);
  for (const t of tasks) {
    if (t.assignee_id && tasksByMember.has(t.assignee_id)) {
      tasksByMember.get(t.assignee_id).push(t);
    }
  }

  const days = 21;
  const memberStats = members.map((m) => {
    const mEvents = eventsByMember.get(m.user_id) || [];
    const mTasks = tasksByMember.get(m.user_id) || [];
    const activity = activityScore(mEvents, now);
    const consistency = consistencyScore(mEvents, now);
    const quiet = isQuiet(mEvents, now, th);
    const spike = hasLateSpike(mEvents, now, th);
    const overloaded = isOverloaded(mTasks, th);
    const openTasks = mTasks.filter((t) => t.status !== 'done').length;
    const doneTasks = mTasks.filter((t) => t.status === 'done').length;
    const urgentOpen = mTasks.filter((t) => t.status !== 'done' && t.priority === 'urgent').length;

    // daily activity array for sparkline (21 days, oldest→newest)
    const daily = new Array(days).fill(0);
    const cutoff = now - days * DAY;
    for (const e of mEvents) {
      const t = new Date(e.occurred_at).getTime();
      if (t < cutoff) continue;
      const idx = Math.min(days - 1, Math.floor((t - cutoff) / DAY));
      daily[idx] += Number(e.weight || 1);
    }

    // recent window counts (for explanations)
    const recentW = th.quietWindowDays;
    const recentCutoff = now - recentW * DAY;
    const recentCount = mEvents.filter((e) => new Date(e.occurred_at).getTime() >= recentCutoff).length;
    const spikeRecent = mEvents.filter((e) => new Date(e.occurred_at).getTime() >= now - th.spikeRecentDays * DAY).length;
    const spikePriorCutoffLo = now - (th.spikeRecentDays + th.spikePriorDays) * DAY;
    const spikePriorCutoffHi = now - th.spikeRecentDays * DAY;
    const spikePrior = mEvents.filter((e) => {
      const t = new Date(e.occurred_at).getTime();
      return t >= spikePriorCutoffLo && t < spikePriorCutoffHi;
    }).length;

    const signals = [];
    const reasons = {};
    if (quiet) { signals.push('quiet'); reasons.quiet = `${recentCount} event${recentCount === 1 ? '' : 's'} in last ${recentW}d (threshold ≤ ${th.quietMaxEvents}).`; }
    if (spike) { signals.push('late_spike'); reasons.late_spike = `${spikeRecent} events in last ${th.spikeRecentDays}d vs ${spikePrior} in the prior ${th.spikePriorDays}d — ratio ${spikePrior ? (spikeRecent / spikePrior).toFixed(1) : '∞'}×.`; }
    if (overloaded) { signals.push('overloaded'); reasons.overloaded = `${openTasks} open task${openTasks === 1 ? '' : 's'}${urgentOpen ? `, ${urgentOpen} urgent` : ''} (limits: > ${th.overloadOpenTasks} open or ≥ ${th.overloadUrgentTasks} urgent).`; }

    let lastActiveAt = null;
    for (const e of mEvents) {
      const t = new Date(e.occurred_at).getTime();
      if (!lastActiveAt || t > lastActiveAt) lastActiveAt = t;
    }
    const recentEvents = [...mEvents]
      .sort((a, b) => new Date(b.occurred_at) - new Date(a.occurred_at))
      .slice(0, 8)
      .map((e) => ({ kind: e.kind, occurred_at: e.occurred_at, weight: e.weight }));

    return {
      user_id: m.user_id,
      display_name: m.display_name || m.email || 'Member',
      email: m.email,
      role: m.role,
      avatar_url: m.avatar_url,
      activity,
      consistency: Number(consistency.toFixed(2)),
      openTasks,
      doneTasks,
      urgentOpen,
      signals,
      reasons,
      daily,
      tasks: mTasks.map((t) => ({ id: t.id, title: t.title, status: t.status, priority: t.priority, due_date: t.due_date })),
      recentEvents,
      last_active_at: lastActiveAt ? new Date(lastActiveAt).toISOString() : (m.joined_at || null),
    };
  });

  const balance = Number(balanceScore(memberStats).toFixed(2));
  const consistency = memberStats.length
    ? Number(
        (memberStats.reduce((a, b) => a + b.consistency, 0) / memberStats.length).toFixed(2)
      )
    : 0;
  const risk = deadlineRisk({ deadline: project.deadline, tasks });

  // Heatmap: last 21 days per member
  const heatmap = memberStats.map((s) => {
    const mEvents = eventsByMember.get(s.user_id) || [];
    const row = new Array(days).fill(0);
    const cutoff = now - days * DAY;
    for (const e of mEvents) {
      const t = new Date(e.occurred_at).getTime();
      if (t < cutoff) continue;
      const idx = Math.min(days - 1, Math.floor((t - cutoff) / DAY));
      row[idx] += Number(e.weight || 1);
    }
    return { user_id: s.user_id, name: s.display_name, values: row };
  });

  // Team totals by priority & status
  const priorityCounts = { low: 0, medium: 0, high: 0, urgent: 0 };
  const statusCounts = { todo: 0, in_progress: 0, review: 0, done: 0 };
  for (const t of tasks) {
    if (priorityCounts[t.priority] != null) priorityCounts[t.priority] += 1;
    if (statusCounts[t.status] != null) statusCounts[t.status] += 1;
  }

  // Daily team activity (21 days)
  const teamDaily = new Array(days).fill(0);
  const teamCutoff = now - days * DAY;
  for (const e of events) {
    const t = new Date(e.occurred_at).getTime();
    if (t < teamCutoff) continue;
    const idx = Math.min(days - 1, Math.floor((t - teamCutoff) / DAY));
    teamDaily[idx] += Number(e.weight || 1);
  }

  // Attention list — members with ≥1 signal, ranked by severity
  const severity = { overloaded: 3, late_spike: 2, quiet: 1 };
  const attention = memberStats
    .filter((m) => m.signals.length > 0)
    .map((m) => ({
      user_id: m.user_id,
      display_name: m.display_name,
      signals: m.signals,
      reasons: m.reasons,
      score: m.signals.reduce((a, s) => a + (severity[s] || 0), 0),
    }))
    .sort((a, b) => b.score - a.score);

  return {
    project,
    members: memberStats,
    tasks,
    signals: { balance, consistency, deadlineRisk: risk },
    thresholds: th,
    heatmap,
    priorityCounts,
    statusCounts,
    teamDaily,
    attention,
    generatedAt: new Date(now).toISOString(),
  };
}
