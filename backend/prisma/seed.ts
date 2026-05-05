import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

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
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
