import type { CompactAsset } from '../types/report';

/** Columns the verdicts table can be ordered by. */
export enum SortKey {
  /** The report's own order — by consensus, as the backend ranked it */
  Default = 'default',
  Label = 'label',
  Size = 'size',
  Change = 'change',
  Category = 'category',
  Trend = 'trend',
  Momentum = 'momentum',
  Agreement = 'agreement',
  Edge = 'edge',
  Return = 'return',
  Flow = 'flow',
  Verdict = 'verdict',
}

export enum SortDir {
  Asc = 'asc',
  Desc = 'desc',
}

/**
 * The value a column sorts on.
 *
 * Missing data sorts to the bottom in either direction rather than counting as
 * zero — an asset with no size figure is unknown, not small, and letting it
 * masquerade as zero would put it at the top of an ascending sort.
 */
const VALUE: Record<
  Exclude<SortKey, SortKey.Default | SortKey.Label | SortKey.Category>,
  (a: CompactAsset) => number | null
> = {
  [SortKey.Size]: (a) => a.size?.value ?? null,
  [SortKey.Change]: (a) => a.lastChangePct,
  [SortKey.Trend]: (a) => a.tsmom?.score ?? null,
  [SortKey.Momentum]: (a) => a.momentum ?? null,
  [SortKey.Agreement]: (a) => a.consensus.score,
  [SortKey.Edge]: (a) => a.top[0]?.edgeScore ?? null,
  // Ranked on the annual rate, not the modelled dollar figure — capital is a
  // constant multiplier across every row, so it cannot change the order.
  [SortKey.Return]: (a) => a.top[0]?.headline?.cagrPct ?? null,
  [SortKey.Flow]: (a) => a.consensus.freshEntries - a.consensus.freshExits,
  [SortKey.Verdict]: (a) => a.consensus.score,
};

export function sortAssets(
  assets: CompactAsset[],
  key: SortKey,
  dir: SortDir,
  categoryOf?: (asset: CompactAsset) => string
): CompactAsset[] {
  if (key === SortKey.Default) return assets;

  const sign = dir === SortDir.Asc ? 1 : -1;
  const sorted = [...assets];

  if (key === SortKey.Label) {
    return sorted.sort((a, b) => sign * a.label.localeCompare(b.label));
  }

  // Category sorts by name so the classes stay grouped. `categoryOf` is
  // supplied by the caller because the report carries no category — the guide
  // does, and duplicating the mapping here would let the two drift.
  if (key === SortKey.Category) {
    return sorted.sort(
      (a, b) => sign * (categoryOf?.(a) ?? '').localeCompare(categoryOf?.(b) ?? '')
    );
  }

  const read = VALUE[key];
  return sorted.sort((a, b) => {
    const left = read(a);
    const right = read(b);

    // Unknowns last, whichever way the column is pointing.
    if (left === null && right === null) return 0;
    if (left === null) return 1;
    if (right === null) return -1;

    return sign * (left - right);
  });
}

/**
 * Clicking a column cycles descending → ascending → back to the report's own
 * order. The third state matters: without it there is no way back to the
 * ranking the backend produced.
 */
export function nextSort(
  current: { key: SortKey; dir: SortDir },
  clicked: SortKey
): { key: SortKey; dir: SortDir } {
  if (current.key !== clicked) return { key: clicked, dir: SortDir.Desc };
  if (current.dir === SortDir.Desc) return { key: clicked, dir: SortDir.Asc };
  return { key: SortKey.Default, dir: SortDir.Desc };
}
