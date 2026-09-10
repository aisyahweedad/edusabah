import { getDb } from "../index.js";
import { districts, categories } from "../schema/index.js";

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

export async function migrateAndSeed() {
  await getDb()
    .insert(districts)
    .values(SABAH_DISTRICTS.map((name, i) => ({
      id: String(i + 1),
      name,
      code: `D${String(i + 1).padStart(3, "0")}`,
    })));
  await getDb().insert(categories).values(CATEGORIES);
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
