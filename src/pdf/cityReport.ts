import { PDFDocument, StandardFonts, type PDFFont, type PDFPage, rgb } from 'pdf-lib';
import { buildMatchIndex, type BlockInfo } from '../geo/matcher.ts';
import { buildOverview } from '../reports/r1.ts';
import { buildHotspots } from '../reports/r3.ts';
import type { RateContext, RateOverrides } from '../revenue/rates.ts';
import type { Citation, NamedLocation } from '../types.ts';

export const TOP_BLOCKS = 10;

/**
 * Everything R7 prints. It holds aggregates only: no officer number, patrol data or citation rows can reach the
 * PDF through it (RPT-5, FR-40).
 */
export interface CityReportModel {
  cityName: string;
  asOf: string;
  citationCount: number;
  realized: number;
  projected: { avg: number; low: number | null; high: number | null; rangeNotice?: string };
  pending: { count: number; amount: number };
  outstanding: { count: number; expected: number };
  rates: { name: string; computed: string; applied: string; status: 'Computed' | 'Manually set' }[];
  warnings: string[];
  typeMix: { code: string; name: string; total: number }[];
  monthly: { month: string; citations: number; collectionRate: string }[];
  blocks: { label: string; count: number }[];
  namedLocations: { name: string; count: number }[];
}

const pct = (r: number | null) => (r === null ? 'n/a' : `${(r * 100).toFixed(1)}%`);

/** Builds the R7 model from the loaded data (FR-26, RPT-4). Officer fields are never read. */
export function buildCityReportModel(
  cityName: string,
  citations: Citation[],
  blocks: BlockInfo[],
  namedLocations: NamedLocation[],
  ctx: RateContext,
  asOf: string,
  overrides: RateOverrides = {},
): CityReportModel {
  const overview = buildOverview(citations, ctx, asOf, overrides);
  const p = overview.projection;
  const hotspots = buildHotspots(citations, blocks, namedLocations, buildMatchIndex(blocks, namedLocations), new Map());

  const perMonth = new Map<string, number>();
  for (const c of citations) perMonth.set(c.date.slice(0, 7), (perMonth.get(c.date.slice(0, 7)) ?? 0) + 1);

  const locCounts = new Map<string, number>();
  for (const c of citations) if (c.namedLocationId) locCounts.set(c.namedLocationId, (locCounts.get(c.namedLocationId) ?? 0) + 1);

  const warnings: string[] = [];
  if (p.lowCountWarning) warnings.push(`Rates rest on fewer than ${p.threshold} settled citations and may be unreliable.`);

  const rate = (name: string, r: typeof p.rates.collection) => ({ name, computed: pct(r.computed), applied: pct(r.applied), status: r.status });
  return {
    cityName,
    asOf,
    citationCount: citations.length,
    realized: p.realized.amount,
    projected: { avg: p.projected.avg, low: p.projected.low, high: p.projected.high, rangeNotice: p.projected.rangeNotice },
    pending: p.pending,
    outstanding: p.outstanding,
    rates: [rate('Collection rate', p.rates.collection), rate('Escalation rate', p.rates.escalation), rate('Reversal rate', p.rates.reversal)],
    warnings,
    typeMix: overview.byType.map((t) => ({ code: t.code, name: t.name, total: t.total })),
    monthly: p.months.map((m) => ({ month: m.month, citations: perMonth.get(m.month) ?? 0, collectionRate: pct(m.rate) })),
    blocks: hotspots.ranked.slice(0, TOP_BLOCKS).map((b) => ({ label: b.label, count: b.count })),
    namedLocations: namedLocations.map((l) => ({ name: l.name, count: locCounts.get(l.id) ?? 0 })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
  };
}

const money = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
/** Standard PDF fonts cover WinAnsi only; anything else prints as "?". */
const safe = (s: string) => s.replace(/[^\x20-\x7e\xa0-\xff]/g, '?');

const PAGE: [number, number] = [612, 792];
const MARGIN = 54;

/** Renders R7 as a PDF (FR-26, RPT-4, RPT-5, FR-40). Fully client-side. */
export async function buildCityPdf(model: CityReportModel): Promise<Blob> {
  const doc = await PDFDocument.create();
  doc.setTitle(`${model.cityName} parking citation report`);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  let page!: PDFPage;
  let y = 0;
  const ensure = (h: number) => {
    if (!page || y - h < MARGIN) {
      page = doc.addPage(PAGE);
      y = PAGE[1] - MARGIN;
    }
  };
  const line = (text: string, opts: { size?: number; font?: PDFFont; gap?: number; indent?: number } = {}) => {
    const size = opts.size ?? 10;
    ensure(size + (opts.gap ?? 4));
    y -= size;
    page.drawText(safe(text), { x: MARGIN + (opts.indent ?? 0), y, size, font: opts.font ?? font, color: rgb(0.1, 0.1, 0.1) });
    y -= opts.gap ?? 4;
  };
  const heading = (text: string) => {
    y -= 8;
    line(text, { size: 13, font: bold, gap: 6 });
  };
  const row = (cols: string[], widths: number[], f: PDFFont = font) => {
    ensure(14);
    y -= 10;
    let x = MARGIN;
    cols.forEach((c, i) => {
      page.drawText(safe(c), { x, y, size: 10, font: f, color: rgb(0.1, 0.1, 0.1) });
      x += widths[i];
    });
    y -= 4;
  };

  line(`${model.cityName} parking citation report`, { size: 18, font: bold, gap: 8 });
  line(`As of ${model.asOf}`, { size: 11 });
  line(`${model.citationCount} citations in the data. Revenue figures use the assumptions below.`);

  heading('Revenue');
  line(`Realized revenue: ${money(model.realized)}`, { font: bold });
  line('Realized is the amount actually paid on paid citations.', { indent: 12 });
  line(`Projected revenue: ${money(model.projected.avg)} (average)`, { font: bold });
  if (model.projected.low !== null && model.projected.high !== null) {
    line(`Projected range: ${money(model.projected.low)} to ${money(model.projected.high)}`, { indent: 12 });
  } else if (model.projected.rangeNotice) line(model.projected.rangeNotice, { indent: 12 });
  line(`Projected is an estimate for ${model.outstanding.count} outstanding unpaid citations (${money(model.outstanding.expected)} before the collection rate).`, { indent: 12 });
  line(`Pending (not yet counted as outstanding): ${model.pending.count} citations, ${money(model.pending.amount)}.`, { indent: 12 });

  heading('Rates used');
  row(['Rate', 'Computed', 'Applied', 'Status'], [150, 90, 90, 120], bold);
  for (const r of model.rates) row([r.name, r.computed, r.applied, r.status], [150, 90, 90, 120]);
  for (const w of model.warnings) line(`Note: ${w}`, { gap: 3 });

  heading('Citation type mix');
  row(['Code', 'Type', 'Citations'], [110, 280, 80], bold);
  for (const t of model.typeMix) row([t.code, t.name, String(t.total)], [110, 280, 80]);

  heading('Monthly trend');
  row(['Month', 'Citations', 'Collection rate'], [110, 110, 140], bold);
  for (const m of model.monthly) row([m.month, String(m.citations), m.collectionRate], [110, 110, 140]);

  heading(`Highlighted blocks (top ${TOP_BLOCKS} by citations)`);
  row(['Block', 'Citations'], [380, 80], bold);
  for (const b of model.blocks) row([b.label, String(b.count)], [380, 80]);

  heading('Named locations');
  row(['Location', 'Citations'], [380, 80], bold);
  for (const l of model.namedLocations) row([l.name, String(l.count)], [380, 80]);

  const bytes = await doc.save();
  return new Blob([bytes as BlobPart], { type: 'application/pdf' });
}
