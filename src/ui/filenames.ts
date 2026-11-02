/** Download names carry the active city id, so files from two cities never look alike. */
export const pdfFileName = (cityId: string, asOf: string) => `${cityId}-citation-report-${asOf}.pdf`;
export const csvFileName = (cityId: string | undefined, name: string) => (cityId ? `${cityId}-${name}.csv` : `${name}.csv`);
