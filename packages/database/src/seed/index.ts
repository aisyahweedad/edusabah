import { getDb } from "../index.js";
import { districts, categories, officers } from "../schema/index.js";
import { hashPassword } from "@k-aecs/auth";

const SABAH_DISTRICTS = [
  "Beaufort", "Beluran", "Kalabakan", "Keningau", "Kinabatangan", "Kota Belud",
  "Kota Kinabalu", "Kota Marudu", "Kuala Penyu", "Kudat", "Kunak", "Lahad Datu",
  "Nabawan", "Papar", "Penampang", "Pitas", "Putatan", "Ranau", "Sandakan",
  "Semporna", "Sipitang", "Tambunan", "Tawau", "Telupid", "Tenom", "Tongod",
  "Tuaran",
];

const CATEGORIES = [
  { id: "facility", name: "Fasiliti Sekolah", description: "Bangunan, kelas, makmal, tandas, elektrik, air" },
  { id: "teacher", name: "Guru & Pengajaran", description: "Kekurangan guru, kualiti pengajaran, guru ganti" },
  { id: "bullying", name: "Buli & Disiplin", description: "Kes buli, ganggu rakan, keselamatan pelajar" },
  { id: "transport", name: "Pengangkut Pelajar", description: "Bas sekolah, van, laluan, subsidi" },
  { id: "canteen", name: "Kantin & Makanan", description: "Kebersihan kantin, harga makanan, menu" },
  { id: "admission", name: "Kemasukan & Pendaftaran", description: "Pendaftaran pelajar, pindah sekolah" },
  { id: "funding", name: "Kewangan & Bantuan", description: "Bantuan persekolahan, tabung, KPM/KPSTI bantuan" },
  { id: "welfare", name: "Kebajikan Pelajar", description: "BAK, KWAPM, keperluan khas, murid OKU" },
  { id: "curriculum", name: "Kurikulum & Kokurikulum", description: "Sukatan pelajaran, aktiviti kokurikulum, peperiksaan" },
  { id: "other", name: "Lain-lain", description: "Soalan dan aduan lain berkaitan pendidikan" },
];

/**
 * Default admin accounts (passwords from env with safe demo defaults).
 * Seeding is idempotent: existing emails are left untouched.
 */
const DEFAULT_OFFICERS = [
  {
    email: "superadmin@kaecs.test",
    name: "Superadmin KPSTI",
    role: "system_admin",
    passwordEnv: "SEED_SUPERADMIN_PASSWORD",
    fallback: "superadmin123",
  },
  {
    email: "secretary@kaecs.test",
    name: "Setiausaha Politik",
    role: "political_secretary",
    passwordEnv: "SEED_SECRETARY_PASSWORD",
    fallback: "secretary123",
  },
  {
    email: "officer@kaecs.test",
    name: "Pegawai KPSTI",
    role: "kpsti_officer",
    passwordEnv: "SEED_OFFICER_PASSWORD",
    fallback: "officer123",
  },
];

export async function migrateAndSeed() {
  const db = getDb();
  await db
    .insert(districts)
    .values(SABAH_DISTRICTS.map((name, i) => ({
      id: String(i + 1),
      name,
      code: `D${String(i + 1).padStart(3, "0")}`,
    })))
    .onConflictDoNothing();
  await db.insert(categories).values(CATEGORIES).onConflictDoNothing();

  for (const officer of DEFAULT_OFFICERS) {
    const password = process.env[officer.passwordEnv] ?? officer.fallback;
    const passwordHash = await hashPassword(password);
    await db
      .insert(officers)
      .values({
        email: officer.email,
        name: officer.name,
        role: officer.role,
        passwordHash,
      })
      .onConflictDoNothing({ target: officers.email });
  }
}

if (import.meta.url === process.argv[1]?.replace(/\.js$/, "") || !!process.env.DATABASE_URL) {
  migrateAndSeed()
    .then(() => {
      console.log("seed complete");
      process.exit(0);
    })
    .catch((err) => {
      console.error("seed failed", err);
      process.exit(1);
    });
}
