import { COMPLAINT_CATEGORIES, type ComplaintCategory } from "@k-aecs/shared";

export const CONSENT_VERSION = "v1";

export const CONSENT_TEXT =
  "K-AECS — Helaian Persetujuan Data\n\n" +
  "KPSTI (Kementerian Pendidikan, Sains dan Inovasi Negeri Sabah) memproses " +
  "mesej anda untuk menjawab soalan pendidikan dan mengurus aduan. " +
  "Kami mengumpul nama akaun Telegram, nombor ID, kandungan mesej, dan " +
  "maklumat yang anda berikan. Data digunakan untuk tujuan perkhidmatan, " +
  "sokongan dan penambahbaikan sahaja. Anda boleh menarik balik persetujuan " +
  "pada bila-bila masa. Dengan mengetik \"Saya Setuju\", anda mengesahkan " +
  "anda berumur 18 tahun ke atas atau mendapat kebenaran ibu bapa/penjaga.\n\n" +
  `Versi: ${CONSENT_VERSION}`;

export const MENU_TEXT =
  "Selamat datang ke <b>K-AECS</b> — perkhidmatan AI Kementerian Pendidikan, " +
  "Sains dan Inovasi Negeri Sabah untuk isu pendidikan.\n\n" +
  "Pilih pilihan di bawah:";

export const CATEGORY_LABELS: Record<ComplaintCategory, string> = {
  facility: "Fasiliti Sekolah",
  teacher: "Guru & Pengajaran",
  bullying: "Buli & Disiplin",
  transport: "Pengangkutan Pelajar",
  canteen: "Kantin & Makanan",
  admission: "Kemasukan & Pendaftaran",
  funding: "Kewangan & Bantuan",
  welfare: "Kebajikan Pelajar",
  curriculum: "Kurikulum & Kokurikulum",
  other: "Lain-lain",
};

export const CATEGORY_LABELS_INV = Object.fromEntries(
  Object.entries(CATEGORY_LABELS).map(([k, v]) => [v, k]),
) as Record<string, ComplaintCategory>;

export const STATUS_LABELS: Record<string, string> = {
  submitted: "Diterima",
  in_review: "Dalam Semakan",
  assigned: "Ditugaskan",
  in_progress: "Sedang Diproses",
  pending_info: "Menunggu Maklumat",
  awaiting_ministry: "Menunggu Kementerian",
  resolved: "Diselesaikan",
  closed: "Ditutup",
  escalated: "Dinaikkan Tahap",
  rejected: "Ditolak",
};

export const COMPLAINT_CATEGORIES_UI = COMPLAINT_CATEGORIES.map((c) => CATEGORY_LABELS[c]);

export function formatDate(value: string | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  return isNaN(d.getTime()) ? value : d.toLocaleString("ms-MY", { timeZone: "Asia/Kuching" });
}
