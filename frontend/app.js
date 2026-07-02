const API_BASE = "http://localhost:8000";

// --- MAP INITIALIZATION ---
// Center at Soppeng Regency
const map = L.map('map').setView([-4.440, 119.695], 11);

// Add OpenStreetMap Basemap
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

// --- GLOBAL VARIABLES ---
const loadedLayers = {}; // To store Leaflet GeoJSON layer objects
const rawDataCache = {}; // Cache for fetched GeoJSON data

// DOM Elements
const layerTogglesContainer = document.getElementById('layer-toggles');
const loadingOverlay = document.getElementById('loading-overlay');

// --- HELPER FUNCTIONS ---

// Decode array biner [S1, S2, S3, N] menjadi teks yang terbaca
const decodeBinaryArray = (val) => {
    let arr = val;
    // Jika string seperti "{0,0,1,1}" atau "[0,0,1,1]", parse dulu
    if (typeof val === 'string') {
        const cleaned = val.replace(/[{}\[\]\s]/g, '');
        arr = cleaned.split(',').map(Number);
        if (arr.some(isNaN)) return val; // bukan array angka, kembalikan apa adanya
    }
    if (!Array.isArray(arr)) return val;
    const classes = ['S1', 'S2', 'S3', 'N'];
    const result = arr
        .map((v, i) => (v === 1 && classes[i]) ? classes[i] : null)
        .filter(Boolean);
    return result.length > 0 ? result.join(', ') : 'Tidak ada';
};

const showLoading = () => {
    loadingOverlay.classList.remove('hidden');
    loadingOverlay.classList.remove('fade-out');
    loadingOverlay.classList.add('fade-in');
};
const hideLoading = () => {
    loadingOverlay.classList.remove('fade-in');
    loadingOverlay.classList.add('fade-out');
    setTimeout(() => loadingOverlay.classList.add('hidden'), 300);
};

// Custom Styling for Layers
const getLayerStyle = (layerName, feature) => {
    // Default style
    let style = { color: "#3388ff", weight: 1, fillOpacity: 0.5 };
    
    // Check if geojson already has 'warna' property
    if (feature.properties && feature.properties.warna) {
        style.color = feature.properties.warna;
        style.fillColor = feature.properties.warna;
        style.fillOpacity = 0.7;
        return style;
    }

    // Custom styling rules
    if (layerName === 'kesesuaian_lahan') {
        const val = feature.properties.suai_lahan;
        if (['S1', 'S2', 'S3'].includes(val)) {
            style.color = "#16a34a"; // Green
            style.fillColor = "#16a34a";
        } else if (val === 'N') {
            style.color = "#dc2626"; // Red
            style.fillColor = "#dc2626";
        } else {
            style.color = "#9ca3af"; // Gray
            style.fillColor = "#9ca3af";
        }
    } else if (layerName === 'pola_ruang') {
        const pr = feature.properties.namobj || "";
        if (pr.toLowerCase().includes("pertanian") || pr.toLowerCase().includes("pangan") || pr.toLowerCase().includes("perkebunan") || pr.toLowerCase().includes("hortikultura")) {
            style.color = "#ca8a04"; // Yellowish for Agri
            style.fillColor = "#ca8a04";
        } else {
            style.color = "#60a5fa"; // Blueish for others
            style.fillColor = "#60a5fa";
        }
    } else if (layerName === 'analysis-rec-non-agri') {
        style.color = "#2563eb";
        style.fillColor = "#3b82f6";
        style.weight = 2;
    } else if (layerName === 'analysis-best-loc') {
        style.color = "#7e22ce";
        style.fillColor = "#9333ea";
        style.weight = 3;
    } else if (layerName === 'kemiringan_lereng') {
        const kl = feature.properties.kl || feature.properties.KL || "";
        if (kl.includes('0-3')) style.fillColor = "#dcfce7";
        else if (kl.includes('3-8')) style.fillColor = "#bbf7d0";
        else if (kl.includes('8-15')) style.fillColor = "#86efac";
        else if (kl.includes('15-25')) style.fillColor = "#4ade80";
        else if (kl.includes('25-45')) style.fillColor = "#22c55e";
        else style.fillColor = "#166534";
        style.color = style.fillColor;
    } else if (layerName === 'curah_hujan') {
        style.fillColor = "#38bdf8";
        style.color = "#0284c7";
    } else if (layerName === 'administrasi_wilayah') {
        style.fillColor = "transparent";
        style.color = "#1e293b";
        style.weight = 2;
        style.dashArray = "5, 5";
    }
    
    return style;
};

// --- INITIALIZE UI ---
async function fetchAndCreateLayerList() {
    try {
        const res = await fetch(`${API_BASE}/layers`);
        const data = await res.json();
        
        if (data.status !== "success") throw new Error("Failed fetching layers");
        
        layerTogglesContainer.innerHTML = ''; // clear loading skeleton
        
        // Allowed layers to show based on task
        const allowedLayers = ["administrasi_wilayah", "curah_hujan", "kemiringan_lereng", "pola_ruang", "kesesuaian_lahan"];
        const availableLayers = data.layers.filter(l => allowedLayers.includes(l));
        
        availableLayers.forEach(layerName => {
            // Create checkbox element
            const label = document.createElement('label');
            label.className = "flex items-center cursor-pointer group layer-group px-2 py-2 rounded-lg mb-1";
            
            // Format nice name
            const niceName = layerName.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
            
            label.innerHTML = `
                <div class="flex items-center h-5 mt-0.5">
                    <input type="checkbox" data-layer="${layerName}" class="premium-checkbox w-4 h-4 text-emerald-500 bg-white border-gray-300 rounded focus:ring-emerald-500 focus:ring-2">
                </div>
                <div class="ml-3 text-sm">
                    <span class="font-semibold text-gray-800 group-hover:text-emerald-600 transition-colors">${niceName}</span>
                </div>
            `;
            
            label.querySelector('input').addEventListener('change', handleLayerToggle);
            layerTogglesContainer.appendChild(label);
        });
        
    } catch (err) {
        console.error(err);
        layerTogglesContainer.innerHTML = '<p class="text-red-500 text-sm">Gagal memuat daftar layer.</p>';
    }
}

// --- LAYER HANDLING ---
async function handleLayerToggle(e) {
    const isChecked = e.target.checked;
    const layerName = e.target.getAttribute('data-layer');
    const isAnalysis = layerName.startsWith('analysis-');
    
    if (isChecked) {
        showLoading();
        if (!loadedLayers[layerName]) {
            try {
                let url = `${API_BASE}/layer/${layerName}/geojson`;
                if (layerName === 'analysis-rec-non-agri') url = `${API_BASE}/analysis/recommendation-non-agri`;
                if (layerName === 'analysis-best-loc') url = `${API_BASE}/analysis/best-location`;
                
                const res = await fetch(url);
                const geojson = await res.json();
                
                rawDataCache[layerName] = geojson;
                
                const leafletLayer = L.geoJSON(geojson, {
                    style: (feature) => getLayerStyle(layerName, feature),
                    onEachFeature: (feature, layer) => {
                        let popupContent = '';

                        if (layerName === 'kesesuaian_lahan') {
                            // Popup khusus untuk kesesuaian lahan — hanya tampil field penting
                            const p = feature.properties;
                            const suai = p.suai_lahan || p.SUAI_LAHAN || '-';
                            const pembatas = p.pembatas || p.PEMBATAS || '-';
                            const luas = p.luas ? parseFloat(p.luas).toFixed(2) : '-';
                            const isSesuai = ['S1','S2','S3'].includes(suai);
                            const badgeColor = suai === 'N' ? 'background:#fee2e2;color:#991b1b' 
                                : (suai !== '-' ? 'background:#dcfce7;color:#166534' : 'background:#f3f4f6;color:#6b7280');
                            popupContent = `
                                <div style="min-width:180px">
                                    <div style="font-weight:bold;border-bottom:1px solid #e5e7eb;padding-bottom:6px;margin-bottom:8px">
                                        🗺️ Kesesuaian Lahan
                                    </div>
                                    <div style="font-size:12px;line-height:1.8">
                                        <div><b>Kelas:</b> <span style="padding:2px 8px;border-radius:4px;font-weight:bold;${badgeColor}">${suai}</span></div>
                                        <div><b>Pembatas:</b> ${pembatas}</div>
                                        <div><b>Luas:</b> ${luas} Ha</div>
                                    </div>
                                </div>`;
                        } else {
                            // Popup generik: tampilkan semua field yang TIDAK null
                            popupContent = `<div class="font-bold border-b pb-1 mb-2">${layerName.toUpperCase()}</div>`;
                            for (let key in feature.properties) {
                                const raw = feature.properties[key];
                                if (key === 'wkb_geometry') continue;
                                if (raw === null || raw === undefined) continue; // skip null
                                if (Array.isArray(raw)) continue; // skip array biner
                                if (typeof raw === 'string' && raw.startsWith('[') && raw.endsWith(']')) continue;
                                popupContent += `<div class="text-xs"><b>${key}:</b> ${raw}</div>`;
                            }
                        }
                        layer.bindPopup(popupContent);
                    }
                });
                loadedLayers[layerName] = leafletLayer;
                
                // If it's the first layer loaded, fly to its bounds
                if (Object.keys(loadedLayers).length === 1) {
                    map.fitBounds(leafletLayer.getBounds());
                }
            } catch (err) {
                console.error("Error loading layer", err);
                Swal.fire('Error', `Gagal memuat layer ${layerName}`, 'error');
                e.target.checked = false;
                hideLoading();
                return;
            }
        }
        loadedLayers[layerName].addTo(map);
        updateLegend();
        hideLoading();
    } else {
        if (loadedLayers[layerName]) {
            map.removeLayer(loadedLayers[layerName]);
        }
        updateLegend();
    }
}

// Special Analysis Toggles
document.getElementById('layer-rec-non-agri').addEventListener('change', (e) => {
    e.target.setAttribute('data-layer', 'analysis-rec-non-agri');
    handleLayerToggle(e);
});
document.getElementById('layer-best-loc').addEventListener('change', (e) => {
    e.target.setAttribute('data-layer', 'analysis-best-loc');
    handleLayerToggle(e);
});


// Dynamic Map Legend
const legendControl = L.control({ position: 'bottomright' });
let legendDiv;

legendControl.onAdd = function (map) {
    legendDiv = L.DomUtil.create('div', 'info legend glass-panel p-5 rounded-2xl hidden');
    return legendDiv;
};
legendControl.addTo(map);

function updateLegend() {
    const activeLayers = Object.keys(loadedLayers).filter(name => map.hasLayer(loadedLayers[name]));
    
    if (activeLayers.length === 0) {
        legendDiv.classList.add('hidden');
        return;
    } else {
        legendDiv.classList.remove('hidden');
    }
    
    let html = '<h4 class="font-bold text-gray-800 border-b pb-2 mb-3 text-sm">Legenda Peta</h4>';
    let hasLegend = false;
    
    if (activeLayers.includes('kesesuaian_lahan')) {
        html += `
        <div class="mb-3">
            <div class="font-semibold text-xs mb-1 text-gray-600">Kesesuaian Lahan</div>
            <div class="flex items-center text-xs mb-1"><span class="w-4 h-4 mr-2 bg-[#16a34a] border border-gray-400 inline-block opacity-70"></span> Sesuai (S1, S2, S3)</div>
            <div class="flex items-center text-xs mb-1"><span class="w-4 h-4 mr-2 bg-[#dc2626] border border-gray-400 inline-block opacity-70"></span> Tidak Sesuai (N)</div>
            <div class="flex items-center text-xs mb-1"><span class="w-4 h-4 mr-2 bg-[#9ca3af] border border-gray-400 inline-block opacity-70"></span> Tidak Diketahui (-)</div>
        </div>`;
        hasLegend = true;
    }
    
    if (activeLayers.includes('pola_ruang')) {
        html += `
        <div class="mb-3">
            <div class="font-semibold text-xs mb-1 text-gray-600">Pola Ruang</div>
            <div class="flex items-center text-xs mb-1"><span class="w-4 h-4 mr-2 bg-[#ca8a04] border border-gray-400 inline-block opacity-70"></span> Zona Pertanian</div>
            <div class="flex items-center text-xs mb-1"><span class="w-4 h-4 mr-2 bg-[#60a5fa] border border-gray-400 inline-block opacity-70"></span> Zona Non-Pertanian</div>
        </div>`;
        hasLegend = true;
    }

    if (activeLayers.includes('kemiringan_lereng')) {
        html += `
        <div class="mb-3">
            <div class="font-semibold text-xs mb-1 text-gray-600">Kemiringan Lereng</div>
            <div class="flex items-center text-xs mb-1"><span class="w-4 h-4 mr-2 bg-[#dcfce7] border border-gray-400 inline-block opacity-70"></span> 0 - 3% (Datar)</div>
            <div class="flex items-center text-xs mb-1"><span class="w-4 h-4 mr-2 bg-[#bbf7d0] border border-gray-400 inline-block opacity-70"></span> 3 - 8% (Landai)</div>
            <div class="flex items-center text-xs mb-1"><span class="w-4 h-4 mr-2 bg-[#86efac] border border-gray-400 inline-block opacity-70"></span> 8 - 15% (Agak Miring)</div>
            <div class="flex items-center text-xs mb-1"><span class="w-4 h-4 mr-2 bg-[#4ade80] border border-gray-400 inline-block opacity-70"></span> 15 - 25% (Miring)</div>
            <div class="flex items-center text-xs mb-1"><span class="w-4 h-4 mr-2 bg-[#22c55e] border border-gray-400 inline-block opacity-70"></span> 25 - 45% (Agak Curam)</div>
            <div class="flex items-center text-xs mb-1"><span class="w-4 h-4 mr-2 bg-[#166534] border border-gray-400 inline-block opacity-70"></span> > 45% (Curam)</div>
        </div>`;
        hasLegend = true;
    }
    
    if (activeLayers.includes('curah_hujan')) {
        html += `
        <div class="mb-3">
            <div class="font-semibold text-xs mb-1 text-gray-600">Curah Hujan</div>
            <div class="flex items-center text-xs mb-1"><span class="w-4 h-4 mr-2 bg-[#38bdf8] border border-gray-400 inline-block opacity-70"></span> Intensitas Curah Hujan</div>
        </div>`;
        hasLegend = true;
    }
    
    if (activeLayers.includes('administrasi_wilayah')) {
        html += `
        <div class="mb-3">
            <div class="font-semibold text-xs mb-1 text-gray-600">Administrasi Wilayah</div>
            <div class="flex items-center text-xs mb-1"><span class="w-4 h-0 mr-2 border-t-2 border-dashed border-[#1e293b] inline-block"></span> Batas Desa/Kecamatan</div>
        </div>`;
        hasLegend = true;
    }
    
    if (activeLayers.includes('analysis-rec-non-agri') || activeLayers.includes('analysis-best-loc')) {
        html += `<div class="mb-3"><div class="font-semibold text-xs mb-1 text-gray-600">Analisis Rekomendasi</div>`;
        if (activeLayers.includes('analysis-rec-non-agri')) {
            html += `<div class="flex items-center text-xs mb-1"><span class="w-4 h-4 mr-2 bg-[#3b82f6] border-2 border-[#2563eb] inline-block opacity-70"></span> Area Sesuai (Non-Pertanian)</div>`;
        }
        if (activeLayers.includes('analysis-best-loc')) {
            html += `<div class="flex items-center text-xs mb-1"><span class="w-4 h-4 mr-2 bg-[#9333ea] border-[3px] border-[#7e22ce] inline-block opacity-70"></span> Lahan Sangat Optimal</div>`;
        }
        html += `</div>`;
        hasLegend = true;
    }
    
    if (!hasLegend) {
        html += `
        <div>
            <div class="font-semibold text-xs mb-1 text-gray-600">Lainnya</div>
            <div class="text-[10px] italic text-gray-500">Warna bawaan layer dari GeoJSON</div>
        </div>`;
    }
    
    legendDiv.innerHTML = html;
}

// --- TAHAP 3: CLICK INFO (5 LAYERS) ---
map.on('click', async (e) => {
    const lat = e.latlng.lat;
    const lon = e.latlng.lng;
    
    try {
        const res = await fetch(`${API_BASE}/click-info?lat=${lat}&lon=${lon}`);
        const data = await res.json();
        
        if (data.status === "success") {
            let popupHtml = `<div class="min-w-[200px]">
                <h4 class="font-bold text-green-700 border-b pb-1 mb-2">Informasi Lahan Terpilih</h4>
                <div class="text-xs space-y-2">
                <div class="mb-2 pb-1 border-b border-gray-100 text-gray-500 font-mono text-[10px] flex items-center justify-between">
                    <span><i class="fa-solid fa-location-dot mr-1 text-red-500"></i> ${lat.toFixed(5)}, ${lon.toFixed(5)}</span>
                </div>`;
            
            // Administrasi
            const admin = data.data.administrasi_wilayah;
            popupHtml += `<div><span class="font-bold text-gray-700">Wilayah:</span> ${admin ? (admin.WADMKD || admin.wadmkd) + ', ' + (admin.WADMKC || admin.wadmkc) : '-'}</div>`;
            
            // Kesesuaian
            const suai = data.data.kesesuaian_lahan;
            const suaiVal = suai ? (suai.suai_lahan || suai.SUAI_LAHAN) : '-';
            let suaiBadge = suaiVal === 'N' ? 'bg-red-100 text-red-800' : (suaiVal !== '-' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800');
            popupHtml += `<div><span class="font-bold text-gray-700">Kesesuaian:</span> <span class="px-1.5 py-0.5 rounded text-[10px] font-bold ${suaiBadge}">${suaiVal}</span></div>`;
            
            // Curah Hujan
            const ch = data.data.curah_hujan;
            popupHtml += `<div><span class="font-bold text-gray-700">Curah Hujan:</span> ${ch ? (ch.CH || ch.ch) + ' mm' : '-'}</div>`;
            
            // Kemiringan
            const kl = data.data.kemiringan_lereng;
            popupHtml += `<div><span class="font-bold text-gray-700">Kemiringan Lereng:</span> ${kl ? (kl.KL || kl.kl) : '-'}</div>`;
            
            // Pola Ruang
            const pr = data.data.pola_ruang;
            popupHtml += `<div><span class="font-bold text-gray-700">Pola Ruang:</span> ${pr ? (pr.NAMOBJ || pr.namobj) : '-'}</div>`;
            
            popupHtml += `</div></div>`;
            
            L.popup()
                .setLatLng(e.latlng)
                .setContent(popupHtml)
                .openOn(map);
        }
    } catch (err) {
        console.error("Click info error", err);
    }
});


// --- TAHAP 3: DRAW POLYGON & ANALYZE LUAS ---
// Initialize Leaflet Draw
const drawnItems = new L.FeatureGroup();
map.addLayer(drawnItems);

const drawControl = new L.Control.Draw({
    draw: {
        polyline: false,
        marker: false,
        circlemarker: false,
        circle: false,
        rectangle: true,
        polygon: {
            allowIntersection: false,
            showArea: true
        }
    },
    edit: {
        featureGroup: drawnItems
    }
});
map.addControl(drawControl);

map.on(L.Draw.Event.CREATED, async function (event) {
    const layer = event.layer;
    drawnItems.clearLayers(); // Keep only 1 drawn item at a time for simplicity
    drawnItems.addLayer(layer);
    
    const geojson = layer.toGeoJSON();
    
    // Send to /analyze endpoint
    showLoading();
    try {
        const res = await fetch(`${API_BASE}/analyze`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ geometry: geojson.geometry })
        });
        const data = await res.json();
        hideLoading();
        
        if (data.status === "success") {
            if (data.analisis.length === 0) {
                Swal.fire('Analisis Selesai', 'Area yang digambar tidak beririsan dengan lahan apapun.', 'info');
                return;
            }
            
            // Aggregate luas by class
            let totalLuas = 0;
            let aggData = {};
            data.analisis.forEach(item => {
                const kls = item.properties.suai_lahan || 'Unknown';
                const luas = parseFloat(item.luas_irisan_m2);
                if (!aggData[kls]) aggData[kls] = 0;
                aggData[kls] += luas;
                totalLuas += luas;
            });
            
            // Build HTML
            let resHtml = `<div class="text-left text-sm mt-3"><p class="mb-2 text-gray-600">Total area poligon: <b>${(totalLuas/10000).toFixed(2)} Hektar</b></p><ul class="space-y-2">`;
            
            for (let kls in aggData) {
                const valHektar = (aggData[kls] / 10000).toFixed(2);
                const isSesuai = ['S1', 'S2', 'S3'].includes(kls);
                const badgeColor = isSesuai ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700';
                resHtml += `<li class="flex justify-between items-center bg-gray-50 p-2 rounded border">
                    <span class="font-bold px-2 py-0.5 rounded text-xs ${badgeColor}">Kelas ${kls}</span> 
                    <span>${valHektar} Ha</span>
                </li>`;
            }
            resHtml += `</ul></div>`;
            
            
            
            // Generate CSV content
            let csvContent = "data:text/csv;charset=utf-8,";
            csvContent += "Kelas Kesesuaian,Luas (Hektar)\n";
            for (let kls in aggData) {
                csvContent += `${kls},${(aggData[kls] / 10000).toFixed(2)}\n`;
            }
            const encodedUri = encodeURI(csvContent);
            
            resHtml += `<div class="mt-4 border-t pt-3"><a href="${encodedUri}" download="hasil_analisis_luas.csv" class="inline-block bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold py-1.5 px-3 rounded shadow"><i class="fa-solid fa-file-csv mr-1"></i> Export ke CSV</a></div>`;
            
            Swal.fire({
                title: 'Hasil Analisis Luas',
                html: resHtml,
                icon: 'success',
                confirmButtonText: 'Tutup',
                confirmButtonColor: '#15803d'
            });
        } else {
            Swal.fire('Error', data.message || 'Terjadi kesalahan analisis', 'error');
        }
    } catch (err) {
        hideLoading();
        console.error(err);
        Swal.fire('Error', 'Gagal menghubungi server API.', 'error');
    }
});


// On Load
fetchAndCreateLayerList();

// --- MAKE SIDEBAR DRAGGABLE ---
const sidebar = document.getElementById('floating-sidebar');
const header = document.getElementById('sidebar-header');
if (sidebar && header) {
    // Disable map dragging when hovering over sidebar to prevent conflicts
    sidebar.addEventListener('mouseover', () => { map.dragging.disable(); map.scrollWheelZoom.disable(); });
    sidebar.addEventListener('mouseout', () => { map.dragging.enable(); map.scrollWheelZoom.enable(); });
    
    // Enable dragging of the sidebar via the header
    const draggable = new L.Draggable(sidebar, header);
    draggable.enable();
}

// --- BONUS: DASHBOARD STATISTIK ---
const dashboardModal = document.getElementById('dashboard-modal');
const btnShowDashboard = document.getElementById('btn-show-dashboard');
const btnCloseDashboard = document.getElementById('btn-close-dashboard');
let suitabilityChart = null;

btnShowDashboard.addEventListener('click', async () => {
    dashboardModal.classList.remove('hidden');
    
    // Fetch stats if not loaded yet or just refresh
    try {
        const res = await fetch(`${API_BASE}/statistics/suitability`);
        const data = await res.json();
        
        if (data.status === "success") {
            const labels = data.data.map(d => `Kelas ${d.kelas}`);
            const values = data.data.map(d => parseFloat(d.luas_ha).toFixed(2));
            
            // Map colors
            const bgColors = data.data.map(d => {
                if (['S1', 'S2', 'S3'].includes(d.kelas)) return '#16a34a';
                if (d.kelas === 'N') return '#dc2626';
                return '#9ca3af';
            });

            if (suitabilityChart) {
                suitabilityChart.destroy();
            }

            const ctx = document.getElementById('suitabilityChart').getContext('2d');
            suitabilityChart = new Chart(ctx, {
                type: 'doughnut',
                data: {
                    labels: labels,
                    datasets: [{
                        data: values,
                        backgroundColor: bgColors,
                        borderWidth: 2,
                        borderColor: '#ffffff'
                    }]
                },
                options: {
                    responsive: true,
                    plugins: {
                        legend: { position: 'bottom' },
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    return ` ${context.label}: ${context.raw} Hektar`;
                                }
                            }
                        }
                    }
                }
            });
        }
    } catch (err) {
        console.error("Dashboard error:", err);
    }
});

btnCloseDashboard.addEventListener('click', () => {
    dashboardModal.classList.add('hidden');
});
