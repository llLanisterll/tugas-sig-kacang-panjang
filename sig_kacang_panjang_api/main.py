from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel
from typing import Dict, Any
import psycopg2
from psycopg2.extras import RealDictCursor
import json

app = FastAPI(title="API SIG Kesesuaian Lahan Kacang Panjang")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DB_CONFIG = {
    "dbname": "sig_kacang_panjang",
    "user": "sarhamsan",
    "password": "", 
    "host": "localhost",
    "port": "5432"
}

def get_db_connection():
    return psycopg2.connect(**DB_CONFIG)

@app.get("/")
def read_root():
    return {"message": "Backend SIG Kacang Panjang Berjalan Lancar!"}

# ==========================================
# ENDPOINT TAHAP 2: BASIC LAYER MANAGEMENT
# ==========================================

@app.get("/layers")
def get_layers():
    try:
        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        query = """
            SELECT table_name FROM information_schema.tables 
            WHERE table_schema = 'public' AND table_name != 'spatial_ref_sys';
        """
        cur.execute(query)
        layers = [table['table_name'] for table in cur.fetchall()]
        cur.close()
        conn.close()
        return {"status": "success", "layers": layers}
    except Exception as e:
        return {"status": "error", "message": str(e)}

@app.get("/layer/{nama_layer}/geojson")
def get_layer_geojson(nama_layer: str):
    allowed_layers = ["administrasi_wilayah", "curah_hujan", "kemiringan_lereng", "pola_ruang", "kesesuaian_lahan"]
    if nama_layer not in allowed_layers:
        raise HTTPException(status_code=404, detail="Layer tidak ditemukan")
        
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        query = f"""
            SELECT jsonb_build_object(
                'type', 'FeatureCollection',
                'features', COALESCE(jsonb_agg(features.feature), '[]'::jsonb)
            )
            FROM (
              SELECT jsonb_build_object(
                'type', 'Feature',
                'geometry', ST_AsGeoJSON(wkb_geometry)::jsonb,
                'properties', to_jsonb(inputs) - 'wkb_geometry'
              ) AS feature
              FROM (SELECT * FROM {nama_layer}) inputs
            ) features;
        """
        cur.execute(query)
        result = cur.fetchone()[0]
        cur.close()
        conn.close()
        return result
    except Exception as e:
        return {"status": "error", "message": str(e)}

# ==========================================
# ENDPOINT TAHAP 3: FITUR KLIK & HITUNG LUAS GAMBAR POLYGON
# ==========================================

@app.get("/suitability")
def get_suitability(lat: float, lon: float):
    """
    MEMENUHI TAHAP 2: Mengembalikan kelas kesesuaian lahan untuk titik tertentu.
    """
    try:
        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        query = """
            SELECT suai_lahan AS kelas_kesesuaian
            FROM kesesuaian_lahan
            WHERE ST_Intersects(wkb_geometry, ST_SetSRID(ST_MakePoint(%s, %s), 4326))
            LIMIT 1;
        """
        cur.execute(query, (lon, lat))
        res = cur.fetchone()
        cur.close()
        conn.close()
        
        if res:
            return {"status": "success", "kelas_kesesuaian": res['kelas_kesesuaian']}
        else:
            return {"status": "success", "kelas_kesesuaian": "Tidak diketahui / Di luar area"}
    except Exception as e:
        return {"status": "error", "message": str(e)}

@app.get("/click-info")
def get_click_info(lat: float, lon: float):
    """
    MEMENUHI TAHAP 3: Menampilkan popup informasi 5 layer sekaligus saat peta diklik.
    """
    try:
        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        
        layers = ["administrasi_wilayah", "curah_hujan", "kemiringan_lereng", "pola_ruang", "kesesuaian_lahan"]
        point_data = {}
        
        for layer in layers:
            query = f"""
                SELECT to_jsonb(inputs) - 'wkb_geometry' AS properties
                FROM (SELECT * FROM {layer}) inputs
                WHERE ST_Intersects(wkb_geometry, ST_SetSRID(ST_MakePoint(%s, %s), 4326))
                LIMIT 1;
            """
            cur.execute(query, (lon, lat))
            res = cur.fetchone()
            point_data[layer] = res['properties'] if res else None
            
        cur.close()
        conn.close()
        return {"status": "success", "koordinat": {"lat": lat, "lon": lon}, "data": point_data}
    except Exception as e:
        return {"status": "error", "message": str(e)}

class PolygonPayload(BaseModel):
    geometry: Dict[str, Any]

@app.post("/analyze")
def analyze_area(payload: PolygonPayload):
    """
    MEMENUHI TAHAP 3: Tool "Gambar Polygon" untuk menghitung luas area kesesuaian.
    """
    try:
        geojson_str = json.dumps(payload.geometry)
        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        
        query = """
            SELECT 
                to_jsonb(k.*) - 'wkb_geometry' AS properties,
                ST_Area(ST_Intersection(ST_MakeValid(k.wkb_geometry), ST_MakeValid(ST_GeomFromGeoJSON(%s)))::geography) AS luas_irisan_m2
            FROM kesesuaian_lahan k
            WHERE ST_Intersects(ST_MakeValid(k.wkb_geometry), ST_MakeValid(ST_GeomFromGeoJSON(%s)))
        """
        cur.execute(query, (geojson_str, geojson_str))
        results = cur.fetchall()
        cur.close()
        conn.close()
        return {"status": "success", "analisis": results}
    except Exception as e:
        return {"status": "error", "message": str(e)}

# ==========================================
# ENDPOINT TAHAP 4: ANALISIS SPASIAL (WAJIB)
# ==========================================

@app.get("/analysis/recommendation-non-agri")
def get_recommendation_non_agri():
    """
    MEMENUHI TAHAP 4.A: Overlay Pola Ruang & Kesesuaian Lahan
    Mencari area yang cocok ditanami kacang panjang, tapi saat ini bukan zona pertanian.
    """
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        
        # Query Overlay Kesesuaian Lahan & Pola Ruang
        query = """
            SELECT jsonb_build_object(
                'type', 'FeatureCollection',
                'features', COALESCE(jsonb_agg(features.feature), '[]'::jsonb)
            )::text
            FROM (
              SELECT jsonb_build_object(
                'type', 'Feature',
                'geometry', ST_AsGeoJSON(k.wkb_geometry)::jsonb,
                'properties', jsonb_build_object(
                    'kesesuaian', k.suai_lahan,
                    'analisis', 'Sesuai (Non-Pertanian)'
                )
              ) AS feature
              FROM kesesuaian_lahan k
              WHERE k.suai_lahan IN ('S1', 'S2', 'S3') 
                AND EXISTS (
                    SELECT 1 FROM pola_ruang p 
                    WHERE ST_Intersects(k.wkb_geometry, p.wkb_geometry) 
                      AND p.namobj NOT ILIKE '%Pangan%' 
                      AND p.namobj NOT ILIKE '%Hortikultura%' 
                      AND p.namobj NOT ILIKE '%Perkebunan%'
                )
            ) features;
        """
        cur.execute(query)
        result = cur.fetchone()[0]
        return Response(content=result, media_type="application/json")
    except Exception as e:
        return {"status": "error", "message": str(e)}
    finally:
        if conn:
            conn.close()

@app.get("/analysis/best-location")
def get_best_location():
    """
    MEMENUHI TAHAP 4.B: Rekomendasi Lokasi Terbaik
    Berdasarkan 4 kriteria:
    1. Curah hujan sedang-tinggi (di atas 2000 mm)
    2. Kemiringan < 15% (kl IN '0-3%', '3-8%', '8-15%')
    3. Pola ruang mendukung pertanian
    4. Kesesuaian lahan minimal "Sesuai" (S1, S2, S3)
    """
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        
        query = """
            SELECT jsonb_build_object(
                'type', 'FeatureCollection',
                'features', COALESCE(jsonb_agg(features.feature), '[]'::jsonb)
            )::text
            FROM (
              SELECT jsonb_build_object(
                'type', 'Feature',
                'geometry', ST_AsGeoJSON(k.wkb_geometry)::jsonb,
                'properties', jsonb_build_object(
                    'kesesuaian', k.suai_lahan,
                    'analisis', 'Rekomendasi Lahan Terbaik'
                )
              ) AS feature
              FROM kesesuaian_lahan k
              WHERE k.suai_lahan IN ('S1', 'S2', 'S3') 
                AND EXISTS (SELECT 1 FROM pola_ruang p WHERE ST_Intersects(k.wkb_geometry, p.wkb_geometry) AND (p.namobj ILIKE '%Pangan%' OR p.namobj ILIKE '%Hortikultura%' OR p.namobj ILIKE '%Perkebunan%'))
                AND EXISTS (SELECT 1 FROM kemiringan_lereng kl WHERE ST_Intersects(k.wkb_geometry, kl.wkb_geometry) AND kl.kl IN ('0-3%', '3-8%', '8-15%'))
                AND EXISTS (SELECT 1 FROM curah_hujan c WHERE ST_Intersects(k.wkb_geometry, c.wkb_geometry))
            ) features;
        """
        cur.execute(query)
        result = cur.fetchone()[0]
        from fastapi.responses import Response
        return Response(content=result, media_type="application/json")
    except Exception as e:
        return {"status": "error", "message": str(e)}
    finally:
        if conn:
            conn.close()
# ==========================================
# ENDPOINT TAHAP 6: BONUS (STATISTIK & EXPORT)
# ==========================================

@app.get("/statistics/suitability")
def get_suitability_statistics():
    try:
        conn = get_db_connection()
        from psycopg2.extras import RealDictCursor
        cur = conn.cursor(cursor_factory=RealDictCursor)
        query = """
            SELECT 
                suai_lahan AS kelas,
                SUM(ST_Area(wkb_geometry::geography)) / 10000 AS luas_ha
            FROM kesesuaian_lahan
            GROUP BY suai_lahan
            ORDER BY kelas
        """
        cur.execute(query)
        results = cur.fetchall()
        cur.close()
        conn.close()
        return {"status": "success", "data": results}
    except Exception as e:
        return {"status": "error", "message": str(e)}

