import type { Metadata } from "next";
import "./globals.css";
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: {
    default: "K-AECS · Sistem Aduan KPSTI",
    template: "%s · K-AECS",
  },
  description:
    "Pusat Pengurusan Aduan & Penglibatan Warganegara — Kementerian Pendidikan, Sains dan Inovasi Negeri Sabah",
  applicationName: "K-AECS",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ms" className={cn("font-sans", geist.variable)}>
      <body className="antialiased">{children}</body>
    </html>
  );
}
