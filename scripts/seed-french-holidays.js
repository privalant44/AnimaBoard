/**
 * Peuple public.french_public_holiday pour les N prochaines années (défaut 10).
 * Usage: node scripts/seed-french-holidays.js [année_début] [nombre_années]
 */
const path = require('path');
require('dotenv').config();
require(path.join(__dirname, '..', 'lib', 'secretEnv'));

const { getSupabase } = require(path.join(__dirname, '..', 'lib', 'supabaseClient'));
const { getHolidayRowsForYearRange } = require(path.join(__dirname, '..', 'lib', 'frenchHolidays'));

async function seedFrenchHolidays(startYear, numYears) {
  const supabase = getSupabase();
  if (!supabase) {
    throw new Error('Supabase non configuré (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)');
  }

  const endYear = startYear + numYears - 1;
  const rows = getHolidayRowsForYearRange(startYear, endYear);
  console.log(`📅 Insertion de ${rows.length} jours fériés (${startYear} → ${endYear})…`);

  const chunk = 50;
  for (let i = 0; i < rows.length; i += chunk) {
    const part = rows.slice(i, i + chunk).map((r) => ({
      holiday_date: r.holiday_date,
      label: r.label,
      year: r.year
    }));
    const { error } = await supabase.from('french_public_holiday').upsert(part, {
      onConflict: 'holiday_date'
    });
    if (error) {
      console.error('❌ Erreur upsert:', error.message);
      process.exit(1);
    }
  }

  console.log('✅ Jours fériés à jour.');
}

module.exports = { seedFrenchHolidays };

if (require.main === module) {
  const y0 = parseInt(process.argv[2], 10) || new Date().getFullYear();
  const n = parseInt(process.argv[3], 10) || 10;
  seedFrenchHolidays(y0, n)
    .then(() => process.exit(0))
    .catch((e) => {
      console.error('❌', e.message || e);
      process.exit(1);
    });
}
