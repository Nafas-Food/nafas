import { en } from '../constants/i18n/en';
import { ar } from '../constants/i18n/ar';

function collectKeys(obj: Record<string, unknown>, prefix = ''): string[] {
  const keys: string[] = [];
  for (const key of Object.keys(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    const val = obj[key];
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      keys.push(...collectKeys(val as Record<string, unknown>, fullKey));
    } else {
      keys.push(fullKey);
    }
  }
  return keys;
}

const enKeys = new Set(collectKeys(en as unknown as Record<string, unknown>));
const arKeys = new Set(collectKeys(ar as unknown as Record<string, unknown>));

const missingInAr = [...enKeys].filter((k) => !arKeys.has(k));
const missingInEn = [...arKeys].filter((k) => !enKeys.has(k));

let hasError = false;

if (missingInAr.length > 0) {
  console.error('Keys in en.ts missing from ar.ts:');
  for (const k of missingInAr) {
    console.error(`  - ${k}`);
  }
  hasError = true;
}

if (missingInEn.length > 0) {
  console.error('Keys in ar.ts missing from en.ts:');
  for (const k of missingInEn) {
    console.error(`  - ${k}`);
  }
  hasError = true;
}

if (!hasError) {
  console.log(`i18n symmetry check passed. ${enKeys.size} keys verified.`);
}

process.exit(hasError ? 1 : 0);
