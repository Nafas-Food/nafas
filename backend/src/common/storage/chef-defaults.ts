/**
 * Phase 3 chef-row default placeholders (FR-023 / SC-011).
 *
 * Production: set DEFAULT_CHEF_LOGO_URL / DEFAULT_CHEF_BANNER_URL in
 * backend/.env to the public Supabase Storage URLs that Phase 0.6
 * uploaded to the chef-logos / chef-banners buckets.
 *
 * Dev fallback: a placeholder service so the chef-apply flow still
 * produces a rendering URL when the env vars are blank. Saffron
 * (#D4944A) is the Nafas design-system accent.
 *
 * `||` (not `??`) so an empty-string env value also falls back —
 * `.env.example` declares the vars as `""`.
 */
const DEV_LOGO_FALLBACK = 'https://placehold.co/400x400/D4944A/FFFFFF.png?text=Chef';
const DEV_BANNER_FALLBACK = 'https://placehold.co/1200x400/D4944A/FFFFFF.png?text=Nafas';

export const DEFAULT_CHEF_LOGO_URL =
  process.env.DEFAULT_CHEF_LOGO_URL || DEV_LOGO_FALLBACK;

export const DEFAULT_CHEF_BANNER_URL =
  process.env.DEFAULT_CHEF_BANNER_URL || DEV_BANNER_FALLBACK;
