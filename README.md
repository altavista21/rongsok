# Sistem Deteksi Rongsok

Aplikasi mobile browser untuk identifikasi barang rongsok, pencatatan berat, kalkulasi harga, dan nota pembayaran. Dibangun mengikuti PRD CV. Rongsok Sejahtera.

## Teknologi
- Next.js App Router dengan static export
- React dan TypeScript
- Tailwind CSS
- TensorFlow.js (inferensi lokal di browser)
- LocalForage / IndexedDB
- Lucide React

## Model AI
Letakkan model TensorFlow.js yang kompatibel di `public/models/` dengan `model.json` dan binary shards. Konfigurasi nama kelas harus sesuai kategori: `kertas`, `plastik`, `besi`, `tembaga`. Tanpa model yang valid, aplikasi tetap menyediakan pemilihan kategori manual dan tidak mengklaim deteksi AI aktif.

## Menjalankan lokal
```bash
npm install
npm run dev
```

Build static export:
```bash
npm run build
```

Aplikasi tidak menggunakan backend API maupun database eksternal. Riwayat transaksi disimpan di browser/perangkat yang digunakan. Akses kamera memerlukan HTTPS atau localhost.
