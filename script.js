const getEl = id => document.getElementById(id);
let timerInterval, abortController;

// --- POPUP ---
window.showPopup = (msg) => {
    let seconds = 0;
    getEl('popupTimer').innerText = "0s";
    clearInterval(timerInterval);
    timerInterval = setInterval(() => { seconds++; getEl('popupTimer').innerText = seconds + "s"; }, 1000);
    getEl('aiPopup').classList.remove('hidden');
    getEl('popupStatus').innerText = msg;
};
window.hidePopup = () => { getEl('aiPopup').classList.add('hidden'); clearInterval(timerInterval); };
window.cancelProcess = () => { if (abortController) { abortController.abort(); window.hidePopup(); } };

// --- STORAGE ---
window.saveDraft = () => {
    const chapters = [];
    document.querySelectorAll('.chapter-card').forEach((card) => {
        chapters.push({
            label: card.querySelector('.ch-label').innerText,
            judul: card.querySelector('.ch-title-input').value,
            summary: card.querySelector('.ch-summary-input').value,
            bridge: card.querySelector('.ch-bridge-input').value,
            content: card.querySelector('.ch-content-input').value
        });
    });
    const data = {
        apiKey: getEl('apiKey').value,
        model: getEl('modelSelect').value,
        title: getEl('novelTitle').value,
        genre: getEl('genre').value,
        style: getEl('style').value,
        idea: getEl('storyIdea').value,
        chapterCount: getEl('chapterCount').value,
        workspaceVisible: !getEl('novelWorkspace').classList.contains('hidden'),
        chapters: chapters
    };
    localStorage.setItem('tebe_v15_memory_bridge', JSON.stringify(data));
};

window.loadDraft = () => {
    const saved = localStorage.getItem('tebe_v15_memory_bridge');
    if (!saved) return;
    const data = JSON.parse(saved);
    getEl('apiKey').value = data.apiKey || "";
    getEl('novelTitle').value = data.title || "";
    getEl('genre').value = data.genre || "";
    getEl('style').value = data.style || "";
    getEl('storyIdea').value = data.idea || "";
    getEl('chapterCount').value = data.chapterCount || 3;
    if (data.apiKey) window.checkAndSaveApi(true);
    if (data.workspaceVisible) window.renderWorkspace(data.chapters, data.title);
};

// --- ENGINE ---
window.checkAndSaveApi = async (isSilent = false) => {
    const key = getEl('apiKey').value.trim();
    if(!key) return;
    if(!isSilent) window.showPopup("Menghubungkan Engine...");
    try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
        const data = await res.json();
        if(data.models) {
            getEl('savedTag').classList.remove('hidden');
            const models = data.models.filter(m => m.supportedGenerationMethods.includes('generateContent'));
            getEl('modelSelect').innerHTML = models.map(m => `<option value="${m.name}">${m.displayName.replace("Gemini ","")}</option>`).join('');
            const savedData = JSON.parse(localStorage.getItem('tebe_v15_memory_bridge'));
            if(savedData && savedData.model) getEl('modelSelect').value = savedData.model;
            getEl('engineWrapper').classList.remove('hidden');
            getEl('btnCheck').innerText = "ENGINE READY ✓";
            getEl('btnCheck').style.backgroundColor = "#064e3b";
        }
    } catch (e) { if(!isSilent) alert("Gagal koneksi API."); }
    finally { window.hidePopup(); }
};

async function callAI(prompt) {
    const key = getEl('apiKey').value;
    const model = getEl('modelSelect').value;
    abortController = new AbortController();
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/${model}:generateContent?key=${key}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: abortController.signal,
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.8, maxOutputTokens: 8192 } })
    });
    const data = await res.json();
    if (!data.candidates) throw new Error("AI Sibuk.");
    let text = data.candidates[0].content.parts[0].text;
    return text.replace(/^.*?(Berikut|Tentu|Halo|Baiklah).*?(\n|:)/gi, '').trim();
}

window.planNovel = async () => {
    const idea = getEl('storyIdea').value;
    if(!idea) return alert("Isi Ide Dunia!");
    window.showPopup("Merancang Struktur Berantai...");
    try {
        const count = getEl('chapterCount').value || 3;
        const prompt = `Bertindak sebagai arsitek alur. Buat alur JSON murni: [{"label":"Prolog","judul":"...","ringkasan":"..."},{"label":"Bab 1","judul":"...","ringkasan":"..."}]. Sertakan Prolog, ${count} Bab Tengah, dan Epilog. Ide: ${idea}`;
        const raw = await callAI(prompt);
        const jsonPart = raw.substring(raw.indexOf('['), raw.lastIndexOf(']') + 1);
        window.renderWorkspace(JSON.parse(jsonPart), getEl('novelTitle').value);
        window.saveDraft();
    } catch (e) { if(e.name !== 'AbortError') alert("Gagal merancang."); }
    finally { window.hidePopup(); }
};

// --- CORE FOCUS MODE: WRITE & BRIDGE ---
window.writeChapter = async (i) => {
    const labels = document.querySelectorAll('.ch-label');
    const titles = document.querySelectorAll('.ch-title-input');
    const summaries = document.querySelectorAll('.ch-summary-input');
    const bridges = document.querySelectorAll('.ch-bridge-input');
    
    window.showPopup(`Menulis ${labels[i].innerText}...`);

    // Ambil Memory Bridge dari bab sebelumnya
    let memoryBridge = i > 0 ? `INGATAN DARI BAB SEBELUMNYA: ${bridges[i-1].value}\n` : "Ini adalah awal cerita.\n";

    const prompt = `Anda adalah penulis novel pemenang penghargaan. Tulis naskah narasi mendalam untuk ${labels[i].innerText}.
    
    JUDUL: ${titles[i].value}
    DUNIA (WORLD BUILDING): ${getEl('storyIdea').value}
    GAYA: ${getEl('style').value} | GENRE: ${getEl('genre').value}
    
    ${memoryBridge}
    
    ALUR YANG HARUS DITULIS SEKARANG:
    ${summaries[i].value}
    
    WAJIB:
    1. Minimal 1500-2000 kata. Berikan detail sensorik (suara, bau, rasa).
    2. Fokus pada satu bab ini saja. JANGAN menulis label bab di awal teks.
    3. Pakai EYD, koma, titik, dan spasi yang sempurna.
    4. Kembangkan dialog yang kuat dan narasi yang mengalir.`;

    try {
        const res = await callAI(prompt);
        document.querySelectorAll('.ch-content-input')[i].value = res;
        window.saveDraft();
        
        // AUTO-CREATE BRIDGE UNTUK BAB BERIKUTNYA
        window.createBridge(i);
    } catch (e) { if(e.name !== 'AbortError') alert("Gagal menulis."); }
    finally { window.hidePopup(); }
};

window.createBridge = async (i) => {
    const content = document.querySelectorAll('.ch-content-input')[i].value;
    const label = document.querySelectorAll('.ch-label')[i].innerText;
    window.showPopup(`Menyusun Jembatan Memori...`);
    
    const prompt = `Analisis teks berikut dari ${label} dan buat ringkasan memori (Memory Bridge) singkat (3-5 kalimat) untuk bab selanjutnya. 
    Catat: Lokasi terakhir karakter, kondisi fisik/mental, benda penting yang dibawa, dan waktu (siang/malam).
    TEKS: ${content.substring(0, 3000)}`;

    try {
        const bridge = await callAI(prompt);
        document.querySelectorAll('.ch-bridge-input')[i].value = bridge;
        window.saveDraft();
    } catch (e) { console.error("Gagal buat bridge."); }
    finally { window.hidePopup(); }
};

window.renderWorkspace = (plan, title) => {
    getEl('mainPlaceholder').classList.add('hidden');
    getEl('displayTitle').innerText = title || "Karya Tebe";
    getEl('novelWorkspace').classList.remove('hidden');
    getEl('chaptersArea').innerHTML = plan.map((item, i) => `
        <div class="chapter-card bg-[#111] p-6 rounded-2xl border border-gray-900 mb-8 shadow-2xl">
            <div class="flex justify-between border-b border-gray-800 pb-4 mb-4">
                <div class="flex-1">
                    <span class="ch-label text-[9px] gold-text font-bold uppercase">${item.label}</span>
                    <input type="text" class="ch-title-input w-full text-lg font-bold bg-transparent outline-none text-white novel-font" value="${item.judul}" oninput="window.saveDraft()">
                </div>
                <button onclick="writeChapter(${i})" class="h-fit bg-white text-black px-8 py-2 rounded-full text-[10px] font-black hover:bg-yellow-500 transition">TULIS BAB INI</button>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <span class="text-[9px] text-gray-500 uppercase font-bold">Rencana Alur (Editable)</span>
                    <textarea class="ch-summary-input summary-box mt-1" rows="4" oninput="window.saveDraft()">${item.summary || item.ringkasan}</textarea>
                </div>
                <div>
                    <span class="text-[9px] text-yellow-700 uppercase font-bold">Memory Bridge (Otomatis/Ingatan ke Bab Depan)</span>
                    <textarea class="ch-bridge-input bridge-box mt-1" rows="4" placeholder="Akan terisi otomatis setelah bab ini ditulis..." oninput="window.saveDraft()">${item.bridge || ""}</textarea>
                </div>
            </div>
            <textarea class="ch-content-input content-box mt-4" rows="20" placeholder="Hasil narasi mendalam..." oninput="window.saveDraft()">${item.content || ""}</textarea>
            <div class="flex justify-end gap-2 mt-2">
                <button onclick="window.downloadSingle(${i}, 'txt')" class="text-[9px] bg-gray-800 px-4 py-2 rounded text-gray-400">UNDUH TXT</button>
                <button onclick="window.downloadSingle(${i}, 'html')" class="text-[9px] border border-gray-800 px-4 py-2 rounded text-gray-400">UNDUH HTML</button>
            </div>
        </div>
    `).join('');
};

// --- DOWNLOAD (PORTRAIT OPTIMIZED) ---
const htmlHeader = (title) => `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><style>
    @import url('https://fonts.googleapis.com/css2?family=Crimson+Pro:ital,wght@0,400;0,700;1,400&family=Cinzel:wght@700&display=swap');
    body { background:#f4ece0; color:#2c2c2c; font-family:'Crimson Pro',serif; line-height:1.8; margin:0; padding:0; text-align:justify; }
    .page { max-width: 95%; margin: 10px auto; background: white; padding: 25px; box-shadow: 0 0 10px rgba(0,0,0,0.05); border-radius: 5px; border: 1px solid #ddd; }
    @media (min-width: 768px) { .page { max-width: 800px; padding: 60px 80px; margin: 40px auto; } }
    h1 { font-family:'Cinzel',serif; text-align:center; color:#8b6b23; font-size: 2.8rem; margin: 40px 0; }
    h2 { font-family:'Cinzel',serif; text-align:center; color:#8b6b23; font-size: 2rem; border-bottom: 2px double #eee; padding-bottom: 10px; margin-top: 50px; }
    p { margin-bottom: 1.5rem; text-indent: 3rem; font-size: 1.25rem; }
    .cover { height: 90vh; display: flex; flex-direction: column; justify-content: center; align-items: center; border: 10px double #8b6b23; margin: 15px; background:white; }
</style></head><body>`;

window.downloadSingle = (i, format) => {
    const card = document.querySelectorAll('.chapter-card')[i];
    const t = card.querySelector('.ch-title-input').value;
    const l = card.querySelector('.ch-label').innerText;
    const c = card.querySelector('.ch-content-input').value;
    let res = (format === 'html') ? 
        `${htmlHeader(t)}<div class="page"><h2>${l}: ${t}</h2>${c.split('\n').filter(p=>p.trim()!="").map(p=>`<p>${p.trim()}</p>`).join('')}</div></body></html>` : 
        `[ ${l} - ${t} ]\n\n${c}`;
    saveFile(res, `${l}_${t}.${format}`, format);
};

window.downloadFull = (format) => {
    const title = getEl('novelTitle').value || 'Novel';
    let res = "";
    if (format === 'html') {
        res = `${htmlHeader(title)}<div class="cover"><h1>${title}</h1><p>Mahakarya Sastra Modern</p></div>`;
        document.querySelectorAll('.chapter-card').forEach(card => {
            const l = card.querySelector('.ch-label').innerText;
            const t = card.querySelector('.ch-title-input').value;
            const c = card.querySelector('.ch-content-input').value;
            res += `<div class="page"><h2>${l}: ${t}</h2>${c.split('\n').filter(p=>p.trim()!="").map(p=>`<p>${p.trim()}</p>`).join('')}</div>`;
        });
        res += "</body></html>";
    } else {
        document.querySelectorAll('.chapter-card').forEach(card => {
            const l = card.querySelector('.ch-label').innerText;
            const t = card.querySelector('.ch-title-input').value;
            const c = card.querySelector('.ch-content-input').value;
            res += `\n\n--- ${l.toUpperCase()} : ${t.toUpperCase()} ---\n\n${c}`;
        });
    }
    saveFile(res, `${title}_Lengkap.${format}`, format);
};

function saveFile(str, name, format) {
    const blob = new Blob([str], { type: format === 'html' ? 'text/html' : 'text/plain' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = name; a.click();
}

window.clearAllData = () => { if(confirm("Hapus memori draf?")) { localStorage.removeItem('tebe_v15_memory_bridge'); location.reload(); } };
window.onload = window.loadDraft;
                                                                                                         
