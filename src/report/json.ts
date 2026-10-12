import type { Report } from '../types.ts';
import { VERSION } from '../version.ts';

const round = (n: number): number => Math.round(n * 100) / 100;

/** Stable, versioned, machine-readable output. See schema/report.schema.json. */
export function toJson(report: Report): Record<string, unknown> {
  return {
    schema_version: 1,
    tool: { name: 'semantic-diff', version: VERSION },
    target: report.target,
    base: report.base,
    feature: report.feature,
    totals: {
      total: report.total,
      semantic: report.semantic,
      noise: report.noise,
      ratio: round(report.ratio),
    },
    breakdown: report.breakdown,
    files: report.files.map(f => ({
      file: f.file,
      old_file: f.oldFile,
      status: f.status,
      engine: f.engine,
      total: f.total,
      semantic: f.semantic,
      noise: f.noise,
      ratio: round(f.ratio),
      breakdown: f.breakdown,
    })),
    skipped: report.skipped,
    failed: report.failed,
  };
}

export function renderJson(report: Report): string {
  return `${JSON.stringify(toJson(report), null, 2)}\n`;
}
