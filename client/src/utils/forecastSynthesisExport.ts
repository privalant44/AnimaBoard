/** Lignes + exports Excel (CSV) / PDF (impression) pour le rapport synthèse Forecast. */

export type ForecastSynthesisRow = {
  resourceId: number;
  resourceName: string;
  nature: 'prestation' | 'scenario';
  natureLabel: string;
  reference: string;
  label: string;
  startDate: string;
  endDate: string;
  tjm: number | null;
  months: Record<string, number>;
  totalDays: number;
};

export type ForecastSynthesisReportModel = {
  title: string;
  notes: string;
  periodLabel: string;
  year: number;
  months: string[];
  monthLabels: string[];
  rows: ForecastSynthesisRow[];
  generatedAt: string;
};

const MONTH_SHORT_FR = [
  'Jan.',
  'Fév.',
  'Mars',
  'Avr.',
  'Mai',
  'Juin',
  'Juil.',
  'Août',
  'Sept.',
  'Oct.',
  'Nov.',
  'Déc.',
];

export function buildMonthKeys(year: number): string[] {
  const months: string[] = [];
  for (let m = 1; m <= 12; m++) {
    months.push(`${year}-${String(m).padStart(2, '0')}`);
  }
  return months;
}

export function monthShortLabels(year: number): string[] {
  return buildMonthKeys(year).map((ym) => {
    const monthIndex = Number(ym.slice(5, 7)) - 1;
    return MONTH_SHORT_FR[monthIndex] || ym;
  });
}

function escapeCsvCell(value: string | number | null | undefined): string {
  const raw = value == null ? '' : String(value);
  if (/[;"\n\r]/.test(raw)) {
    return `"${raw.replace(/"/g, '""')}"`;
  }
  return raw;
}

function formatDateFr(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatNumber(n: number): string {
  if (!n) return '';
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace('.', ',');
}

export function buildSynthesisCsv(model: ForecastSynthesisReportModel): string {
  const header = [
    'Ressource',
    'Nature',
    'Référence',
    'Libellé',
    'Date début',
    'Date fin',
    'TJM',
    ...model.monthLabels,
    'Total jours',
  ];

  const lines = [header.map(escapeCsvCell).join(';')];

  for (const row of model.rows) {
    lines.push(
      [
        row.resourceName,
        row.natureLabel,
        row.reference,
        row.label,
        formatDateFr(row.startDate),
        formatDateFr(row.endDate),
        row.tjm != null ? String(row.tjm).replace('.', ',') : '',
        ...model.months.map((m) => formatNumber(row.months[m] || 0)),
        formatNumber(row.totalDays),
      ]
        .map(escapeCsvCell)
        .join(';')
    );
  }

  return `\uFEFF${lines.join('\r\n')}`;
}

export function downloadSynthesisExcel(model: ForecastSynthesisReportModel): void {
  const csv = buildSynthesisCsv(model);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const stamp = model.generatedAt.slice(0, 10);
  a.href = url;
  a.download = `synthese-forecast-${model.year}-${stamp}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function buildPrintHtml(model: ForecastSynthesisReportModel): string {
  const headCells = model.monthLabels.map((l) => `<th>${l}</th>`).join('');
  const bodyRows = model.rows
    .map((row) => {
      const monthCells = model.months
        .map((m) => {
          const v = row.months[m] || 0;
          return `<td class="num">${v ? formatNumber(v) : ''}</td>`;
        })
        .join('');
      return `<tr>
        <td>${escapeHtml(row.resourceName)}</td>
        <td>${escapeHtml(row.natureLabel)}</td>
        <td>${escapeHtml(row.reference)}</td>
        <td>${escapeHtml(row.label)}</td>
        <td>${escapeHtml(formatDateFr(row.startDate))}</td>
        <td>${escapeHtml(formatDateFr(row.endDate))}</td>
        <td class="num">${row.tjm != null ? escapeHtml(String(row.tjm)) : ''}</td>
        ${monthCells}
        <td class="num">${formatNumber(row.totalDays)}</td>
      </tr>`;
    })
    .join('');

  const notesBlock = model.notes.trim()
    ? `<p class="notes"><strong>Notes :</strong> ${escapeHtml(model.notes.trim())}</p>`
    : '';

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(model.title)}</title>
  <style>
    @page { size: A4 landscape; margin: 12mm; }
    body { font-family: "Segoe UI", Calibri, Arial, sans-serif; font-size: 10px; color: #1a1a1a; }
    h1 { font-size: 16px; margin: 0 0 4px; }
    .meta { color: #555; margin: 0 0 12px; }
    .notes { margin: 0 0 12px; white-space: pre-wrap; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border: 1px solid #ccc; padding: 3px 4px; text-align: left; vertical-align: top; }
    th { background: #f0f0f0; font-weight: 600; }
    td.num, th.num { text-align: right; }
    tr:nth-child(even) td { background: #fafafa; }
  </style>
</head>
<body>
  <h1>${escapeHtml(model.title)}</h1>
  <p class="meta">Période filtres : ${escapeHtml(model.periodLabel)} — Année grille : ${model.year} — Généré le ${escapeHtml(
    new Date(model.generatedAt).toLocaleString('fr-FR')
  )}</p>
  ${notesBlock}
  <table>
    <thead>
      <tr>
        <th>Ressource</th>
        <th>Nature</th>
        <th>Référence</th>
        <th>Libellé</th>
        <th>Début</th>
        <th>Fin</th>
        <th>TJM</th>
        ${headCells}
        <th>Total</th>
      </tr>
    </thead>
    <tbody>${bodyRows}</tbody>
  </table>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Ouvre une fenêtre d’impression (enregistrer en PDF via le dialogue navigateur). */
export function exportSynthesisPdf(model: ForecastSynthesisReportModel): void {
  const html = buildPrintHtml(model);
  const w = window.open('', '_blank', 'noopener,noreferrer,width=1200,height=800');
  if (!w) {
    alert('Impossible d’ouvrir la fenêtre d’export PDF. Autorisez les pop-ups pour ce site.');
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
  w.focus();
  // Laisse le temps au moteur de rendu avant le dialogue d’impression.
  setTimeout(() => {
    w.print();
  }, 250);
}
