import { parse, parseVerbatim } from '@retorquere/bibtex-parser/js';
import { emptyCitation, type AcademicProjection, type CitationRecord } from './model';
export function bibliography(source: string, format: 'bibtex' | 'ris'): AcademicProjection {
  if (new TextEncoder().encode(source).length > 2 * 1024 * 1024)
    throw Error('Bibliography exceeds 2 MiB');
  const records: CitationRecord[] = [],
    diagnostics: string[] = [];
  if (format === 'bibtex') {
    const raw = parseVerbatim(source),
      library = parse(source, { sentenceCase: false });
    if (raw.errors.length)
      throw Error('Malformed BibTeX: ' + JSON.stringify(raw.errors).slice(0, 600));
    if (library.errors.length)
      diagnostics.push('Some TeX commands could not be normalized; exact original retained.');
    library.entries.forEach((entry, i) => {
      const f = entry.fields as any,
        c = emptyCitation(entry.key, String(f.title ?? entry.key), String(f.url ?? ''));
      c.providerType = entry.type;
      c.rawFields = Object.entries(raw.entries[i]?.fields ?? {}).map(([k, v]) => [k, String(v)]);
      c.creators = (f.author ?? []).map((a: any) => ({
        family: a.lastName ?? a.family,
        given: a.firstName ?? a.given,
        literal: a.name ?? a.literal,
      }));
      c.publisher = Array.isArray(f.publisher) ? f.publisher.join('; ') : f.publisher;
      c.venue = f.journal ?? f.booktitle;
      c.doi = f.doi;
      c.dates = { publication: String(f.year ?? f.date ?? '') };
      c.abstract = f.abstract;
      records.push(c);
    });
  } else {
    let fields: Array<[string, string]> | undefined;
    for (const line of source.replace(/^\ufeff/, '').split(/\r\n?|\n/)) {
      const m = line.match(/^([A-Z0-9]{2})  - ?(.*)$/);
      if (!m) {
        if (!line.trim()) continue;
        if (!fields?.length) throw Error('RIS continuation outside a record');
        fields.at(-1)![1] += '\n' + line.trim();
        continue;
      }
      const [, tag, v] = m;
      if (tag === 'TY') {
        if (fields) throw Error('RIS record missing ER');
        fields = [['TY', v]];
        continue;
      }
      if (!fields) throw Error('RIS record must start with TY');
      if (tag !== 'ER') {
        fields.push([tag, v]);
        continue;
      }
      const first = (...tags: string[]) => fields!.find(([k]) => tags.includes(k))?.[1] ?? '',
        all = (...tags: string[]) => fields!.filter(([k]) => tags.includes(k)).map(([, v]) => v),
        c = emptyCitation(
          first('ID') || 'record-' + (records.length + 1),
          first('TI', 'T1', 'CT') || 'Untitled record',
          first('UR')
        );
      c.providerType = first('TY');
      c.creators = all('AU', 'A1').map((literal) => ({ literal }));
      c.publisher = first('PB');
      c.venue = first('JO', 'JF', 'T2');
      c.dates = { publication: first('PY', 'Y1', 'DA') };
      c.doi = first('DO') || undefined;
      c.abstract = first('AB', 'N2');
      c.rawFields = fields;
      records.push(c);
      fields = undefined;
    }
    if (fields) throw Error('RIS record missing ER');
  }
  if (!records.length || records.length > 200) throw Error('Choose 1–200 bibliographic records');
  const seen = new Set<string>();
  for (const c of records) {
    if (seen.has(c.key))
      diagnostics.push(
        `Duplicate source key ${c.key}: retained independently; no merge performed.`
      );
    seen.add(c.key);
    if (c.doi) c.identifiers.push({ namespace: 'doi', key: c.doi });
    if (c.creators.length > 200) throw Error('Creator limit');
  }
  diagnostics.push(
    'Unmapped source fields are retained. Bibliography entries do not create accepted canonical facts.'
  );
  return {
    version: 1,
    kind: format,
    title: `${records.length} citations`,
    citations: records,
    diagnostics,
  };
}
export { exportBibliography } from './bibliography-export';
