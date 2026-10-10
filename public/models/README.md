# Model TensorFlow.js

Folder ini disediakan untuk model GraphModel hasil ekspor TensorFlow.js.

Letakkan `model.json` dan seluruh binary shard yang dirujuk model di folder ini.

**Penting:** PRD tidak menyertakan file model terlatih, nama input/output tensor, atau format output spesifik. Karena itu model produksi belum dapat disertakan atau divalidasi di repository ini. Komponen kamera akan menampilkan status model secara jujur dan tetap mendukung pemilihan kategori manual. Agar deteksi bounding box aktif, gunakan model deteksi yang menghasilkan tensor boxes, scores, dan classes dengan urutan kelas yang dipetakan pada aplikasi: kertas, plastik, besi, tembaga. Arsitektur dan indeks kelas perlu disesuaikan dengan model sebenarnya sebelum penggunaan operasional.
