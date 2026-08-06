/**
 * Seed script — populates Supabase with stylist data for development.
 * Run: npm run seed -w server
 *
 * Safe to run multiple times (upserts by name).
 * Services are NOT seeded here — the catalog is owned by supabase/migrations.
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

// `specialties` is display copy and gates nothing. Which services a stylist can
// actually be booked for lives in the `stylist_services` join table, owned by
// migration 018 — the same split as the service catalogue, which this script
// also leaves alone. Editing the prose below changes nothing about bookability.
const stylists = [
  {
    name: 'Sumita Karki',
    title: 'Hair Stylist',
    bio: 'With over 10 years of experience, Sumita specializes in cuts, color, and styling. She is dedicated to helping every client look and feel their best.',
    specialties: ['Haircut & Style', 'Balayage', 'Color Correction', 'Blowout'],
    years_exp: 10,
    image_url: null,
    is_active: true,
  },
  {
    name: 'Sazana Aryal',
    title: 'Threading & Facial Specialist',
    bio: 'Sazana is an expert in eyebrow threading, facial threading, and facial hair design. Her precise technique delivers clean, long-lasting results every time.',
    specialties: [
      'Eyebrow Threading',
      'Facial Threading',
      'Waxing',
      'Facials',
      'Eyelash Extensions',
      'Eyebrow Lamination',
    ],
    years_exp: null,
    image_url: null,
    is_active: true,
  },
];

async function seed() {
  console.log('🌱 Seeding Icon Studio database...\n');

  // Deactivate old placeholder stylists
  console.log('Deactivating placeholder stylists...');
  await supabase
    .from('stylists')
    .update({ is_active: false })
    .in('name', ['Jasmine Rivera', 'Maya Patel']);

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

  console.log('\n✅ Seed complete!');
}

seed().catch((err) => {
  console.error('Seed error:', err);
  process.exit(1);
});
