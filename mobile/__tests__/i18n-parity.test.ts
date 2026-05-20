import { en } from '../constants/i18n/en';
import { ar } from '../constants/i18n/ar';

function flatten(obj: Record<string, unknown>, prefix = ''): string[] {
  const keys: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    const full = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'object' && v !== null) keys.push(...flatten(v as Record<string, unknown>, full));
    else keys.push(full);
  }
  return keys.sort();
}

test('en and ar have identical key sets', () => {
  const enKeys = flatten(en);
  const arKeys = flatten(ar);

  if (enKeys.join(',') !== arKeys.join(',')) {
    const enSet = new Set(enKeys);
    const arSet = new Set(arKeys);
    const missingInAr = enKeys.filter((k) => !arSet.has(k));
    const missingInEn = arKeys.filter((k) => !enSet.has(k));
    const msg = [
      missingInAr.length ? `Missing in ar.ts: ${missingInAr.join(', ')}` : '',
      missingInEn.length ? `Missing in en.ts: ${missingInEn.join(', ')}` : '',
    ]
      .filter(Boolean)
      .join('\n');
    throw new Error(`i18n key mismatch:\n${msg}`);
  }
});
