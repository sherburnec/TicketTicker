import { buildCityPdf, type CityReportModel } from '../pdf/cityReport.ts';
import { money } from './ratesPanel.ts';
import { el, emptyState, heading } from './dom.ts';

export const CONFIRMATION_TEXT = 'I confirm this report includes no officer data and that the assumptions shown are correct.';

/** What the city will see, as lines for the pre-export preview (FR-27). */
export function previewLines(m: CityReportModel): string[] {
  const p = m.projected;
  return [
    `${m.cityName}, as of ${m.asOf}, ${m.citationCount.toLocaleString()} citations`,
    `Realized: ${money(m.realized)}`,
    `Projected (average): ${money(p.avg)}`,
    p.low !== null && p.high !== null ? `Projected range: ${money(p.low)} to ${money(p.high)}` : (p.rangeNotice ?? ''),
    ...m.rates.map((r) => `${r.name}: ${r.applied} (${r.status}; computed ${r.computed})`),
    ...m.warnings,
    `Sections: type mix (${m.typeMix.length}), monthly trend (${m.monthly.length}), highlighted blocks (${m.blocks.length}), named locations (${m.namedLocations.length})`,
  ].filter(Boolean);
}

/** Export is allowed only with data loaded and the confirmation checked (FR-27, AS6). */
export function createExportState(model: () => CityReportModel | undefined) {
  let confirmed = false;
  return {
    setConfirmed(value: boolean): void {
      confirmed = value;
    },
    canExport(): boolean {
      return confirmed && model() !== undefined;
    },
    async exportPdf(): Promise<Blob | undefined> {
      const m = model();
      return confirmed && m ? buildCityPdf(m) : undefined;
    },
    /** A fresh preview needs a fresh confirmation. */
    reset(): void {
      confirmed = false;
    },
  };
}

export function mountExportPanel(root: HTMLElement, model: () => CityReportModel | undefined): { refresh(): void } {
  const state = createExportState(model);

  function render(): void {
    state.reset();
    root.replaceChildren(heading('City report (PDF)'));
    const m = model();
    if (!m) {
      root.append(emptyState('Load citation data to export the city PDF.'));
      return;
    }
    const ul = el('ul', undefined, 'preview');
    for (const l of previewLines(m)) ul.append(el('li', l));
    const preview = el('div', undefined, 'card');
    preview.append(el('h3', 'What the city will see'), ul);
    const box = el('input');
    box.type = 'checkbox';
    const label = el('label', undefined, 'confirm');
    label.append(box, el('span', CONFIRMATION_TEXT));
    const button = el('button', 'Export PDF');
    button.type = 'button';
    button.disabled = true;
    box.addEventListener('change', () => {
      state.setConfirmed(box.checked);
      button.disabled = !state.canExport();
    });
    button.addEventListener('click', async () => {
      const blob = await state.exportPdf();
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = el('a');
      a.href = url;
      a.download = `${m.cityName.toLowerCase().replace(/\W+/g, '-')}-citation-report-${m.asOf}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    });
    root.append(preview, label, button);
  }

  render();
  return { refresh: render };
}
