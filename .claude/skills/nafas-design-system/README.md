# Nafas Design System

## Company / Product Overview

**Nafas** (نفَس — Arabic for "breath") is a two-sided marketplace connecting **customers** who want authentic Egyptian home-cooked food with **homemaker chefs** who cook from their own kitchens. The tagline is:

> *"Homemade Egyptian food, delivered with love"* / *"أكل بيتي مصري، يوصلك بحب"*

The platform is mobile-first (React Native / Expo), fully bilingual (English + Arabic / RTL), and cash-on-delivery for v1. Chefs self-manage their kitchen availability, menus, and incoming orders. There is also an admin web dashboard (Next.js) for verifying chefs and platform analytics.

---

## Products

| Product | Description | Stack |
|---|---|---|
| **Customer Mobile App** | Browse chefs, cart, order, track, review | React Native + Expo (Expo Router v6) |
| **Chef Mobile App** | Same app, chef role: dashboard, orders, menu CRUD, analytics | Same bundle, role-gated |
| **Admin Web Dashboard** | Verify chefs, manage users, platform analytics | Next.js 14, Tailwind CSS |
| **Backend API** | REST API, JWT auth, NestJS modular monolith | NestJS, Prisma, PostgreSQL (Supabase) |

---

## Sources

- **Codebase**: Mounted at `nafas_food/` via File System Access API
  - Mobile app: `nafas_food/artifacts/mobile/`
  - Docs: `nafas_food/docs/`
- **No Figma file was provided** — design system derived from codebase + brand palette brief

---

## CONTENT FUNDAMENTALS

### Voice & Tone
- **Warm, personal, community-oriented.** The brand feels like a beloved family kitchen — not a tech company.
- Copy uses **first person ("I")** in chef bios and second person ("you / your") in UI copy directed at the user.
- **Bilingual parity**: every string has an English and Arabic version. Neither is a literal translation — each reads naturally in its language.
- Arabic copy uses **Egyptian colloquial dialect** (not Modern Standard Arabic): e.g. "مش عندك حساب؟" not "ألا تملك حساباً؟"; "دلوقتي" not "الآن".
- **No emoji** in UI strings (emoji appear incidentally in code, e.g. 👩‍🍳 in the chef dashboard greeting — but these are not a brand pattern).
- Tone is **friendly and direct** — imperative CTAs with warmth: "Create Account", "Explore Now", "Start Cooking", not "Get Started Today!" with exclamation spam.
- **Prices always in EGP** — never generic "$".
- Number formatting: Eastern Arabic numerals used in some Arabic contexts (١.٠.٠ in version string).
- **Casing**: Title Case for page titles and tab labels. Sentence case for body text and subtitles. ALL CAPS used sparingly — only for small eyebrow labels (e.g. "TODAY'S SPECIAL").
- Chef bios are written as personal stories — warmth, heritage, years of experience — not marketing copy.

### Example copy
- Tagline: "Homemade Egyptian food, delivered with love"
- Home greeting: "Craving something homemade?"
- Hero eyebrow: "TODAY'S SPECIAL" (10px, tracked, amber)
- Empty state: "Your homemade meal orders will appear here"
- Error: "Please enter your mobile number." (sentence case, instructive)

---

## VISUAL FOUNDATIONS

### Color System
The palette is **terracotta-forward** — a warm off-white background with terracotta as primary and saffron as accent. Inspired by Egyptian earthenware and spice markets. Distinct from Talabat (orange), Careem (green), and food-tech blue palettes.

**Primary Palette**
- **Primary**: Terracotta `#C4622D` — CTAs, active states, interactive elements, focus rings
- **Primary Light**: Cream `#F5ECD7` — button hover fills, chip backgrounds, secondary fills
- **Accent**: Saffron `#D4944A` — accent buttons, star ratings, eyebrow labels, warmth moments
- **Accent Light**: Warm Tint `#FDEEC8` — lightest accent fill

**Neutrals — Earthy & Warm**
- **Foreground**: Umber `#2C1F14` — primary text, near-black with warmth
- **Mocha**: `#6B5040` — secondary text, labels, muted foreground
- **Sand**: `#B8A898` — placeholders, icons, metadata, inactive tabs
- **Background**: `#FAF7F2` — warm off-white page surface
- **Card**: Pure white `#FFFFFF`
- **Border**: `#EDE6DA` — warm beige dividers
- **Muted Fill**: `#F2EDE4` — inactive zones, input background

**Semantic**
- **Success**: Green `#16A34A`
- **Destructive**: Red `#C0392B`
- **Warning**: Saffron `#D4944A`

Status lifecycle colors: Pending=Saffron `#D4944A`, Confirmed=Blue `#3B82F6`, Preparing=Purple `#8B5CF6`, Ready=Emerald `#10B981`, On the Way=Terracotta `#C4622D`, Delivered=Green `#16A34A`, Cancelled=Red `#C0392B`.

### Typography
**Font**: Inter (Google Fonts) — 400, 500, 600, 700 weights only.
No display/serif typeface. Inter is used for everything — the brand identity lives in spacing and color, not font pairing.

| Role | Size | Weight |
|---|---|---|
| Page title (h1) | 26–28px | 700 Bold |
| Section title (h2) | 17–20px | 700 Bold |
| Card title (h3) | 14–15px | 600 SemiBold |
| Body large | 16px | 400 Regular |
| Body | 14–15px | 400 Regular |
| Caption | 12–13px | 400–500 |
| Micro / tag | 10–12px | 500–600 |

### Spacing
Token scale: 4, 8, 12, 14, 16, 20, 24, 28, 32px. Container padding: 20px horizontal.

### Border Radius
- Pill (buttons, tags, tabs): `100px`
- Card / modal: `16–18px`
- Input: `14px`
- Icon container: `10–12px`
- Logo box: `12–16px`
- Floating tab bar: `100px` (full pill)

### Cards
Cards use `backgroundColor: white`, `borderWidth: 1px`, `borderColor: #E4E2F8`, `borderRadius: 16px`, subtle shadow (iOS: `shadowOpacity 0.06 / shadowRadius 8`). No colored left-border accents. No heavy drop shadows.

### Backgrounds
- Default: warm off-white `#FAF7F2`
- No full-bleed gradient backgrounds
- Hero banners use full-bleed photography with a dark overlay (`rgba(20,10,0,0.45)`)
- Cream secondary fills (`#F5ECD7`) used for chef hero sections and secondary surfaces

### Animations & Interactions
- **Press states**: `opacity: 0.85–0.92` + very subtle `scale: 0.98–0.99` on cards and CTAs. No color changes on press.
- **Haptics**: Light impact on navigation/add; Medium on toggles; Success/Error/Warning notifications on form outcomes.
- No complex animations — the app is functional and fast, not flashy.
- Status pill backgrounds use `statusColor + "20"` (hex 20% opacity) — a consistent pattern throughout.

### Icons
**Feather icon set** exclusively (via `@expo/vector-icons`). Consistent stroke weight. No filled icons. No emoji as icons.

### Imagery
- Photography: warm-toned Egyptian home cooking (natural light, domestic warmth)
- No illustrations, hand-drawn elements, or brand mascots
- Chef avatars are circular (`borderRadius: 50%`) with a 3px white border on the hero

### RTL
Full RTL support when Arabic is active: `flexDirection` flips, `textAlign` flips, back arrows flip. Language toggle is a pill component (EN / عربي) with an active white segment and blur background.

---

## ICONOGRAPHY

All icons use the **Feather set** from `@expo/vector-icons` (CDN: https://feathericons.com). Consistent 1.5px stroke weight, no fills. Icon size: 11–22px depending on context. Color always matches its semantic role (primary for interactive, mutedForeground for meta, statusColor for status).

No custom SVG icons, no icon font, no PNG icon sprites. No emoji as icons.

Key icon mappings documented in `docs/05_DESIGN_SYSTEM.md` and `colors_and_type.css`.

Logos and brand assets:
- `assets/images/icon.png` — app icon / logo mark (used in 40×40 terracotta rounded square)
- `assets/images/hero_banner.png` — hero food photography
- `assets/images/koshary.png`, `mahshi.png`, `molokheya.png` — dish photography

---

## FILE INDEX

```
README.md                    ← this file
colors_and_type.css          ← CSS custom properties: colors, type, spacing, radius tokens
SKILL.md                     ← Agent skill definition

assets/
  images/
    icon.png                 ← App logo mark
    hero_banner.png          ← Hero food photography
    koshary.png              ← Dish photo
    mahshi.png               ← Dish photo
    molokheya.png            ← Dish photo

preview/                     ← Design System tab preview cards
  colors-primary.html
  colors-semantic.html
  colors-status.html
  type-scale.html
  type-weights.html
  spacing-tokens.html
  radius-shadow.html
  components-buttons.html
  components-inputs.html
  components-cards.html
  components-chips.html
  components-status-pills.html
  brand-logo.html
  brand-imagery.html

ui_kits/
  customer/
    README.md
    index.html               ← Customer app: Welcome → Home → Chef Profile → Cart
    WelcomeScreen.jsx
    HomeScreen.jsx
    ChefProfileScreen.jsx
    CartScreen.jsx
    OrdersScreen.jsx

  chef/
    README.md
    index.html               ← Chef app: Dashboard → Orders → Menu
    DashboardScreen.jsx
    OrdersScreen.jsx
    MenuScreen.jsx
```
