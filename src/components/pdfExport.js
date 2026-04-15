import { jsPDF } from 'jspdf';

export function exportReportPdf(snap) {
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const margin = 48;
  let y = margin;
  const W = doc.internal.pageSize.getWidth();

  function line(text, size = 12, weight = 'normal', color = '#111') {
    doc.setFont('helvetica', weight);
    doc.setFontSize(size);
    doc.setTextColor(color);
    const lines = doc.splitTextToSize(text, W - margin * 2);
    doc.text(lines, margin, y);
    y += lines.length * (size + 2);
  }

  function spacer(h = 10) { y += h; }
  function rule() {
    doc.setDrawColor('#ddd');
    doc.line(margin, y, W - margin, y);
    y += 8;
  }

  line('Collabix Project Report', 20, 'bold');
  line(snap.project.name, 14, 'bold', '#333');
  line(`Generated ${new Date(snap.generatedAt).toLocaleString()}`, 10, 'normal', '#666');
  spacer(); rule();

  line('Signals', 14, 'bold');
  const risk = snap.signals.deadlineRisk;
  line(`Balance: ${Math.round(snap.signals.balance * 100)}%`);
  line(`Consistency: ${Math.round(snap.signals.consistency * 100)}%`);
  line(`Deadline risk: ${risk.level.toUpperCase()}${risk.daysLeft != null ? ` · ${risk.daysLeft} days left · ${Math.round(risk.openRatio * 100)}% tasks open` : ''}`);
  spacer(); rule();

  line('Team', 14, 'bold');
  for (const m of snap.members) {
    const sig = m.signals.length ? m.signals.join(', ') : 'on track';
    line(`${m.display_name} (${m.role}) — activity ${m.activity}, consistency ${Math.round(m.consistency * 100)}%, ${m.doneTasks} done / ${m.openTasks} open — ${sig}`, 11);
    if (y > doc.internal.pageSize.getHeight() - margin) { doc.addPage(); y = margin; }
  }
  spacer(); rule();

  line('Tasks', 14, 'bold');
  const byStatus = { todo: [], in_progress: [], review: [], done: [] };
  for (const t of snap.tasks) (byStatus[t.status] || byStatus.todo).push(t);
  for (const [status, items] of Object.entries(byStatus)) {
    line(`${status.toUpperCase()} (${items.length})`, 12, 'bold');
    for (const t of items) {
      const assignee = snap.members.find((m) => m.user_id === t.assignee_id);
      line(`• ${t.title} — ${t.priority}${assignee ? ` · ${assignee.display_name}` : ''}${t.due_date ? ` · due ${t.due_date}` : ''}`, 11);
      if (y > doc.internal.pageSize.getHeight() - margin) { doc.addPage(); y = margin; }
    }
    spacer(6);
  }

  doc.save(`collabix-${snap.project.name.replace(/\s+/g, '-').toLowerCase()}.pdf`);
}
