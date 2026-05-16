import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Phase 3 categories seed (FR-025). Each id is pre-generated so re-runs are no-ops.
const PHASE3_CATEGORIES: Array<{
  id: string;
  name: { en: string; ar: string };
  icon: string;
  displayOrder: number;
}> = [
  { id: '00000000-0000-4000-8000-000000000c01', name: { en: 'Koshary',   ar: 'كشري'   }, icon: 'coffee',          displayOrder: 0 },
  { id: '00000000-0000-4000-8000-000000000c02', name: { en: 'Mahshi',    ar: 'محشي'   }, icon: 'leaf',            displayOrder: 1 },
  { id: '00000000-0000-4000-8000-000000000c03', name: { en: 'Molokheya', ar: 'ملوخية' }, icon: 'feather',         displayOrder: 2 },
  { id: '00000000-0000-4000-8000-000000000c04', name: { en: 'Hawawshi',  ar: 'حواوشي' }, icon: 'pie-chart',       displayOrder: 3 },
  { id: '00000000-0000-4000-8000-000000000c05', name: { en: 'Sweets',    ar: 'حلويات' }, icon: 'gift',            displayOrder: 4 },
  { id: '00000000-0000-4000-8000-000000000c06', name: { en: 'Feteer',    ar: 'فطير'   }, icon: 'square',          displayOrder: 5 },
  { id: '00000000-0000-4000-8000-000000000c07', name: { en: 'Fattah',    ar: 'فتة'    }, icon: 'layers',          displayOrder: 6 },
  { id: '00000000-0000-4000-8000-000000000c08', name: { en: 'Other',     ar: 'أخرى'   }, icon: 'more-horizontal', displayOrder: 7 },
];

async function main() {
  const supabaseUrl = process.env.SUPABASE_URL;
  if (!supabaseUrl) {
    throw new Error(
      'SUPABASE_URL is required to seed settings. Refusing to write a relative URL for WELCOME_BACKGROUND_IMAGE.',
    );
  }

  const defaults = [
    {
      key: 'WELCOME_BACKGROUND_IMAGE',
      value:
        supabaseUrl +
        '/storage/v1/object/public/welcome-screen/hero_vertical.png',
    },
    {
      key: 'CHEF_LOGO_PLACEHOLDER',
      value: process.env.DEFAULT_CHEF_LOGO_URL ?? '',
    },
    {
      key: 'CHEF_BANNER_PLACEHOLDER',
      value: process.env.DEFAULT_CHEF_BANNER_URL ?? '',
    },
  ];

  for (const { key, value } of defaults) {
    await prisma.setting.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    });
    console.log(`Seeded setting: ${key}`);
  }

  for (const c of PHASE3_CATEGORIES) {
    await prisma.category.upsert({
      where:  { id: c.id },
      create: { id: c.id, name: c.name, icon: c.icon, displayOrder: c.displayOrder, isActive: true },
      update: { name: c.name, icon: c.icon, displayOrder: c.displayOrder, isActive: true, deletedAt: null },
    });
    console.log(`Seeded category: ${c.name.en}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
