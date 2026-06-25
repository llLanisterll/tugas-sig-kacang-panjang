# Web GIS Analisis Kesesuaian Lahan Kacang Panjang

Sistem Informasi Geografis (SIG) berbasis Web untuk menganalisis dan merekomendasikan lahan yang sesuai bagi budidaya **Kacang Panjang** di Kabupaten Soppeng, Sulawesi Selatan. 

Aplikasi ini mengintegrasikan **PostGIS** sebagai basis data geospasial, **FastAPI (Python)** sebagai backend REST API, dan **Leaflet.js** untuk antarmuka interaktif peta di frontend.

## 🚀 Fitur Utama
1. **Visualisasi Data Spasial**: Menampilkan 5 layer geospasial (Administrasi Wilayah, Curah Hujan, Kemiringan Lereng, Pola Ruang, dan Kesesuaian Lahan) dalam bentuk GeoJSON yang dinamis.
2. **Dashboard Statistik**: Menyajikan persentase total luasan area (Hektar) per kelas kesesuaian di seluruh wilayah menggunakan `Chart.js`.
3. **Smart Popup Information**: Cukup klik pada area mana pun di peta untuk mendapatkan detail informasi spasial gabungan (Desa, Curah Hujan, Lereng, Pola Ruang, dan Kelas Lahan).
4. **Custom Polygon Analysis (Draw Tool)**: Pengguna dapat menggambar area (poligon) sendiri di atas peta untuk menghitung irisan luasan lahan sesuai (S1, S2, S3, N) pada area tersebut. 
5. **Export ke CSV**: Hasil perhitungan gambar poligon dapat diunduh (di-*export*) secara real-time menjadi *file* `.csv`.
6. **Analisis Rekomendasi Spasial**:
   - Menampilkan area potensial yang "Sesuai" namun bukan merupakan zona pertanian eksisting (Rekomendasi Non-Pertanian).
   - Menampilkan "Rekomendasi Lahan Terbaik" yang memenuhi 4 syarat ketat: Sesuai, Curah hujan cukup, Kemiringan aman (<15%), dan berada di zona Pola Ruang Pertanian.

## 🛠️ Arsitektur Sistem (Tech Stack)
* **Database**: PostgreSQL dengan ekstensi **PostGIS**
* **Backend**: FastAPI (Python), `psycopg2`, Uvicorn
* **Frontend**: HTML5, Tailwind CSS, Leaflet.js, SweetAlert2, Chart.js

## 📂 Struktur Repositori
```text
├── sig_kacang_panjang_api/
│   ├── main.py       # Source code backend FastAPI & PostGIS queries
│   └── requirements.txt
├── frontend/
│   ├── index.html    # Antarmuka web utama
│   ├── app.js        # Logika sistem web GIS & interaksi peta Leaflet
│   └── style.css     # Kustomisasi animasi dan styling UI
└── README.md
```

## ⚙️ Panduan Instalasi & Menjalankan Aplikasi

### 1. Persiapan Database (PostGIS)
1. Pastikan Anda telah menginstal PostgreSQL dan PostGIS.
2. Buat database baru (contoh: `sig_kacang_panjang`).
3. Aktifkan ekstensi spasial: `CREATE EXTENSION postgis;`
4. Impor kelima *file* GeoJSON sumber data yang Anda miliki ke dalam tabel database menggunakan tools seperti *QGIS*, *shp2pgsql*, atau *GDAL ogr2ogr*. Pastikan sistem koordinat seragam ke EPSG:4326.

### 2. Menjalankan Backend API
1. Buka terminal dan masuk ke *folder* `sig_kacang_panjang_api`.
2. Install *library* Python yang dibutuhkan:
   ```bash
   pip install fastapi uvicorn psycopg2-binary pydantic
   ```
3. Sesuaikan konfigurasi koneksi database (DB_NAME, USER, PASSWORD) di bagian atas file `main.py`.
4. Jalankan server Uvicorn:
   ```bash
   python -m uvicorn main:app --reload
   ```
5. Server backend akan berjalan di `http://localhost:8000`.

### 3. Menjalankan Frontend
Karena frontend berupa *static files*, Anda bisa langsung membuka file `frontend/index.html` menggunakan *web browser*, atau menyajikannya menggunakan ekstensi seperti *Live Server* di VSCode.
 
---
*Proyek ini dikembangkan untuk memenuhi Tugas Mata Kuliah Sistem Informasi Geografis.*
