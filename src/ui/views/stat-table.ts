import { createElement } from '../dom';
import type { StatRow } from '../reel-format';
import { LABELS } from '../ui-config';

/** Before / after / delta table of one edit preview. */
export function createStatTable(rows: readonly StatRow[]): HTMLElement {
  const table = createElement('table', 'stats');
  const header = createElement('tr');
  header.append(...LABELS.statHeader.map((label) => createElement('th', undefined, label)));
  table.createTHead().append(header);
  const body = table.createTBody();
  for (const row of rows) {
    const line = createElement('tr', row.secondary ? 'stats__row stats__row--secondary' : 'stats__row');
    const after = createElement('td', 'stats__after', row.after);
    if (row.impossible) {
      line.classList.add('stats__row--impossible');
      after.append(createElement('span', 'stats__badge', LABELS.impossible));
    }
    line.append(
      createElement('th', 'stats__label', row.label),
      createElement('td', 'stats__before', row.before),
      after,
      createElement('td', `stats__delta stats__delta--${row.trend}`, row.delta),
    );
    body.append(line);
  }
  return table;
}
