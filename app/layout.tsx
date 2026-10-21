import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Newsreader } from "next/font/google";
import "./globals.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono" });
const newsreader = Newsreader({ subsets: ["latin"], variable: "--font-editorial" });

export const metadata: Metadata = {
  title: "The Daily Bread — Your Personal Morning Newspaper",
  description: "One calm, continuous daily briefing: wire facts, labeled political framing, Michigan and local reporting, technology, Screen & Cinema and meaningful good news."
};
export const viewport: Viewport = { themeColor: "#f4f1e8" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" className={`${geist.variable} ${mono.variable} ${newsreader.variable}`}><body>{children}</body></html>;
}
