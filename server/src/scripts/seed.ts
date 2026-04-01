/**
 * Seed script — populates Supabase with placeholder data for development.
 * Run: npm run seed -w server
 *
 * Safe to run multiple times (upserts by name).
 * Replace placeholder data with real content before launch.
 */

import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
import { createClient } from '@supabase/supabase-js';


const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const stylists = [
  {
    name: 'Jasmine Rivera',
    title: 'Senior Colorist & Stylist',
    bio: 'With over 8 years of experience, Jasmine specializes in balayage, color correction, and transformative cuts. She believes every client deserves a look that makes them feel like the best version of themselves.',
    specialties: ['Balayage', 'Color Correction', 'Keratin Treatments', 'Precision Cuts'],
    years_exp: 8,
    image_url: null,
    is_active: true,
  },
  {
    name: 'Maya Patel',
    title: 'Threading Specialist & Stylist',
    bio: 'Maya brings 6 years of expertise in eyebrow threading and facial hair design, along with a passion for blowouts and styling. Her meticulous technique ensures clean, long-lasting results every time.',
    specialties: ['Eyebrow Threading', 'Facial Threading', 'Blowouts', 'Updos'],
    years_exp: 6,
    image_url: null,
    is_active: true,
  },
];

const services = [
  // Hair services
  {
    category: 'hair',
    name: 'Women\'s Haircut & Style',
    description: 'Includes consultation, shampoo, cut, and blow dry finish.',
    price_min: 65,
    price_max: 95,
    duration_min: 60,
    is_active: true,
  },
  {
    category: 'hair',
    name: 'Men\'s Haircut',
    description: 'Precision cut with shampoo and style.',
    price_min: 45,
    price_max: 55,
    duration_min: 30,
    is_active: true,
  },
  {
    category: 'hair',
    name: 'Blowout & Style',
    description: 'Full shampoo, blowdry, and finishing style. No cut included.',
    price_min: 45,
    price_max: 65,
    duration_min: 45,
    is_active: true,
  },
  {
    category: 'hair',
    name: 'Balayage',
    description:
      'Hand-painted highlights for a natural, sun-kissed effect. Includes toner and blowout.',
    price_min: 150,
    price_max: 250,
    duration_min: 180,
    is_active: true,
  },
  {
    category: 'hair',
    name: 'Full Highlights',
    description: 'All-over foil highlights with toner and blowout finish.',
    price_min: 120,
    price_max: 200,
    duration_min: 150,
    is_active: true,
  },
  {
    category: 'hair',
    name: 'Keratin Treatment',
    description:
      'Smoothing treatment that eliminates frizz and adds shine for up to 3 months.',
    price_min: 200,
    price_max: 300,
    duration_min: 180,
    is_active: true,
  },
  // Threading services
  {
    category: 'threading',
    name: 'Eyebrow Threading',
    description:
      'Precise eyebrow shaping using traditional threading technique for clean, defined arches.',
    price_min: 18,
    price_max: null,
    duration_min: 15,
    is_active: true,
  },
  {
    category: 'threading',
    name: 'Upper Lip Threading',
    description: 'Quick and precise upper lip hair removal using threading.',
    price_min: 10,
    price_max: null,
    duration_min: 10,
    is_active: true,
  },
  {
    category: 'threading',
    name: 'Full Face Threading',
    description:
      'Eyebrows, upper lip, chin, and cheeks — a complete facial hair removal service.',
    price_min: 40,
    price_max: null,
    duration_min: 30,
    is_active: true,
  },
  {
    category: 'threading',
    name: 'Chin Threading',
    description: 'Targeted chin hair removal with threading for a clean finish.',
    price_min: 10,
    price_max: null,
    duration_min: 10,
    is_active: true,
  },
];

async function seed() {
  console.log('🌱 Seeding Icon Studio database...\n');

  // Insert stylists
  console.log('Inserting stylists...');
  const { data: insertedStylists, error: stylistError } = await supabase
    .from('stylists')
    .upsert(stylists, { onConflict: 'name', ignoreDuplicates: false })
    .select();

  if (stylistError) {
    console.error('❌ Stylist seed failed:', stylistError.message);
    process.exit(1);
  }
  console.log(`✓ ${insertedStylists?.length ?? 0} stylists seeded`);

  // Insert services
  console.log('Inserting services...');
  const { data: insertedServices, error: serviceError } = await supabase
    .from('services')
    .upsert(services, { onConflict: 'name', ignoreDuplicates: false })
    .select();

  if (serviceError) {
    console.error('❌ Service seed failed:', serviceError.message);
    process.exit(1);
  }
  console.log(`✓ ${insertedServices?.length ?? 0} services seeded`);

  console.log('\n✅ Seed complete!');
}

seed().catch((err) => {
  console.error('Seed error:', err);
  process.exit(1);
});
