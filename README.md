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

### Pelatihan model (Google Colab)
Notebook awal untuk mengunduh dataset publik, melatih YOLOv8n, mengevaluasi metrik, dan mencoba ekspor TensorFlow.js tersedia di [`notebooks/rongsok_ai_training_colab.ipynb`](notebooks/rongsok_ai_training_colab.ipynb). Buka notebook dari GitHub melalui [Google Colab](https://colab.research.google.com/github/altavista21/rongsok/blob/main/notebooks/rongsok_ai_training_colab.ipynb). Runtime gratis tidak menjamin GPU selalu tersedia.

**Status AI:** model terlatih belum disertakan. Notebook harus benar-benar dijalankan dan hasil ekspor diuji. Output YOLO TensorFlow.js mungkin tidak sesuai dengan parser aplikasi saat ini, jadi jangan menyalin model ke `public/models/` sebelum preprocessing, bentuk output tensor, pemetaan kelas, dan deteksi di browser diverifikasi. Label `metal` dari dataset publik juga bukan bukti bahwa objek adalah besi; kategori dan harga harus dikonfirmasi manual.

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
