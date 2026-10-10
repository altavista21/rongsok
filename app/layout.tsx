import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Rongsok Sejahtera | Deteksi & Nota',
  description: 'Identifikasi barang rongsok, hitung nilai timbang, dan cetak nota transaksi secara offline.',
  applicationName: 'Rongsok Sejahtera',
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#047857' };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="id"><body>{children}</body></html>;
}
