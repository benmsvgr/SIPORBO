const API_URL = "https://script.google.com/macros/s/AKfycbwfTj4Yp_jWezxEzae5jeCKEd33RgJ1qGbpKeodE1IlPT713FAwWvKNnQ8x-rywkxcXPw/exec";

let currentUser = null;
let dashboard = null;
let activeMenu = "Struktur Anggaran";
let editMode = "normal";

const MENUS_USER = ["Struktur Anggaran", "Perencanaan", "Pencairan"];
const MENUS_ADMIN = ["Dashboard Monitoring", "Struktur Anggaran", "Perencanaan", "Pencairan"];

function isAdmin(){ return String(currentUser?.id_bidang || "").toUpperCase() === "ADMIN"; }
function rupiah(n){ return new Intl.NumberFormat("id-ID",{style:"currency",currency:"IDR",maximumFractionDigits:0}).format(toNumber(n)); }
function toNumber(v){
  if(v === null || v === undefined || v === "") return 0;
  if(typeof v === "number") return isFinite(v) ? v : 0;
  let s = String(v).trim().replace(/[^0-9,.-]/g, "");
  if(!s) return 0;
  if((s.match(/\./g) || []).length > 1 && !s.includes(",")) s = s.replace(/\./g, "");
  else if(s.includes(".") && s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  else if(s.includes(",") && !s.includes(".")) s = s.replace(",", ".");
  else if(/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  const num = Number(s);
  return isFinite(num) ? num : 0;
}
function angkaID(n){
  return new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(toNumber(n));
}
function formatAngkaInput(el){
  if(!el) return;
  const raw = String(el.value || "").replace(/[^0-9]/g, "");
  el.value = raw ? angkaID(raw) : "";
}
function setAutoTotal(volumeId="volume", hargaId="harga", totalId="totalPreview"){
  const vol = toNumber(document.getElementById(volumeId)?.value);
  const harga = toNumber(document.getElementById(hargaId)?.value);
  const total = vol * harga;
  const el = document.getElementById(totalId);
  if(el) el.value = rupiah(total);
}
function onAngkaInput(el, volumeId="volume", hargaId="harga", totalId="totalPreview"){
  formatAngkaInput(el);
  setAutoTotal(volumeId, hargaId, totalId);
}
function esc(v){ return String(v ?? "").replace(/[&<>'"]/g, s => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;","\"":"&quot;"}[s])); }
function showLoading(text="Memproses..."){ document.getElementById("loadingText").innerText = text; document.getElementById("loadingOverlay").classList.remove("hidden"); }
function hideLoading(){ document.getElementById("loadingOverlay").classList.add("hidden"); }
function badge(text){
  const t = String(text || "-").toUpperCase();
  let cls = "badge-gray";
  if(["DISETUJUI","VALID","DOKUMEN LENGKAP","SIAP DICAIRKAN","SUDAH DICAIRKAN","BUKA"].includes(t)) cls = "badge-green";
  if(["DIAJUKAN","MENUNGGU","MENUNGGU VERIFIKASI","PERUBAHAN_DIAJUKAN"].includes(t)) cls = "badge-blue";
  if(["DITOLAK","PERBAIKAN","TUTUP"].includes(t)) cls = "badge-red";
  if(["BELUM ADA DOKUMEN","BELUM INPUT"].includes(t)) cls = "badge-orange";
  return `<span class="badge ${cls}">${esc(t)}</span>`;
}

async function apiPost(payload){
  const res = await fetch(API_URL, { method:"POST", body: JSON.stringify(payload) });
  const txt = await res.text();
  try { return JSON.parse(txt); } catch(e){ throw new Error(txt || "Response bukan JSON"); }
}

async function login(){
  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value.trim();
  const msg = document.getElementById("loginMsg");
  if(!username || !password){ msg.innerText = "Username dan password wajib diisi."; return; }
  showLoading("Login...");
  try{
    const r = await apiPost({ action:"login", username, password });
    if(!r.success){ msg.innerText = r.message; return; }
    currentUser = r.user;
    localStorage.setItem("siporbo_user", JSON.stringify(currentUser));
    activeMenu = isAdmin() ? "Dashboard Monitoring" : "Struktur Anggaran";
    document.getElementById("loginPage").classList.add("hidden");
    document.getElementById("appPage").classList.remove("hidden");
    await loadDashboard();
  }catch(err){ msg.innerText = "Gagal konek ke server/API."; console.error(err); }
  finally{ hideLoading(); }
}

async function loadDashboard(){
  showLoading("Memuat data...");
  try{
    const r = await apiPost({ action:"getDashboard", user: currentUser });
    if(!r.success){ alert(r.message || "Gagal memuat dashboard."); return; }
    dashboard = r;
    document.getElementById("userInfo").innerText = `${currentUser.nama || "-"} - ${currentUser.nama_bidang || currentUser.id_bidang || "-"}`;
    renderAll();
  }catch(err){ console.error(err); alert("Gagal memuat dashboard."); }
  finally{ hideLoading(); }
}

function renderAll(){ renderMenu(); renderSummary(); renderContent(); }
function setMenu(m){ activeMenu = m; renderAll(); }

function renderMenu(){
  const menus = isAdmin() ? MENUS_ADMIN : MENUS_USER;
  document.getElementById("menuNav").innerHTML = menus.map(m => `<button class="${activeMenu===m?'active':''}" onclick="setMenu('${m}')">${m}</button>`).join("");
}

function renderSummary(){
  const wrap = document.getElementById("summaryCards");
  if(!dashboard){ wrap.innerHTML = ""; return; }
  if(isAdmin()){
    const pagu = dashboard.rekap.reduce((s,r)=>s+toNumber(r.pagu),0);
    const total = dashboard.rekap.reduce((s,r)=>s+toNumber(r.total_perencanaan),0);
    const dok = dashboard.dokumen.length;
    const valid = dashboard.dokumen.filter(d => String(d.status_verifikasi || "").toUpperCase()==="VALID").length;
    wrap.innerHTML = card("Total Pagu", rupiah(pagu)) + card("Total Perencanaan", rupiah(total)) + card("Sisa Pagu", rupiah(pagu-total)) + card("Dokumen Valid", `${valid}/${dok}`);
  } else {
    const r = dashboard.rekap.find(x => String(x.id_bidang) === String(currentUser.id_bidang)) || {};
    wrap.innerHTML = card("Pagu Bidang", rupiah(r.pagu)) + card("Total Perencanaan", rupiah(r.total_perencanaan)) + card("Sisa Pagu", rupiah(r.sisa_pagu)) + card("Status Akses", r.status_akses || "-");
  }
}
function card(a,b){ return `<div class="summary-card"><span>${esc(a)}</span><b>${esc(b)}</b></div>`; }

function renderContent(){
  if(activeMenu === "Dashboard Monitoring") return renderMonitoring();
  if(activeMenu === "Struktur Anggaran") return renderStruktur();
  if(activeMenu === "Perencanaan") return renderPerencanaan();
  if(activeMenu === "Pencairan") return renderPencairan();
}

function bidangName(id){ return dashboard.bidangMap?.[String(id)] || id || "-"; }
function kegiatanName(id){ const k = dashboard.perencanaan.find(x => String(x.id_kegiatan) === String(id)); return k?.nama_kegiatan || id || "-"; }

function renderMonitoring(){
  const rows = dashboard.rekap.map(r => {
    const pct = toNumber(r.pagu) ? Math.min(100, Math.round(toNumber(r.total_perencanaan) / toNumber(r.pagu) * 100)) : 0;
    return `<tr>
      <td><b>${esc(r.nama_bidang)}</b><br><small class="muted">${esc(r.id_bidang)}</small></td>
      <td>${rupiah(r.pagu)}</td><td>${rupiah(r.total_perencanaan)}</td><td>${rupiah(r.sisa_pagu)}</td>
      <td><div class="progress-bar"><div style="width:${pct}%"></div></div><small>${pct}%</small></td>
      <td>${esc(r.jumlah_kegiatan || 0)}</td><td>${esc(r.dokumen_upload || 0)}</td><td>${esc(r.dokumen_valid || 0)}</td>
      <td>${badge(r.status_akses)}</td><td>${badge(r.status_progress)}</td>
    </tr>`;
  }).join("");
  document.getElementById("contentArea").innerHTML = `<section class="panel fade-up"><h3>Dashboard Monitoring Admin</h3><p class="panel-sub">Pantauan perencanaan dan pencairan dari semua bidang.</p><div class="table-wrap"><table><thead><tr><th>Bidang</th><th>Pagu</th><th>Perencanaan</th><th>Sisa</th><th>%</th><th>Kegiatan</th><th>Dok Upload</th><th>Dok Valid</th><th>Akses</th><th>Progress</th></tr></thead><tbody>${rows || `<tr><td colspan="10" class="empty">Belum ada data</td></tr>`}</tbody></table></div></section>`;
}

function renderStruktur(){
  if(isAdmin()){
    const rows = dashboard.rekap.map(r => `<div class="admin-row"><div><b>${esc(r.nama_bidang)}</b><br><small class="muted">${esc(r.id_bidang)}</small><br><small>Total: ${rupiah(r.total_perencanaan)} | Sisa: ${rupiah(r.sisa_pagu)}</small></div><div class="field"><label>Pagu</label><input id="pagu_${esc(r.id_bidang)}" type="number" value="${toNumber(r.pagu)}"></div><div class="field"><label>Akses</label><select id="akses_${esc(r.id_bidang)}"><option value="BUKA" ${r.status_akses==='BUKA'?'selected':''}>BUKA</option><option value="TUTUP" ${r.status_akses==='TUTUP'?'selected':''}>TUTUP</option></select></div><div>${badge(r.status_progress)}</div><button onclick="updateBidang('${esc(r.id_bidang)}')">Simpan</button></div>`).join("");
    document.getElementById("contentArea").innerHTML = `<section class="panel fade-up"><h3>Struktur Anggaran</h3><p class="panel-sub">Admin mengatur pagu dan akses input tiap bidang.</p>${rows || `<p class="muted">Belum ada bidang.</p>`}</section>`;
  } else {
    const r = dashboard.rekap.find(x => String(x.id_bidang) === String(currentUser.id_bidang)) || {};
    document.getElementById("contentArea").innerHTML = `<section class="panel fade-up"><h3>Ringkasan Bidang</h3><p class="panel-sub">Informasi anggaran dan progres bidang.</p><div class="table-wrap"><table><thead><tr><th>Bidang</th><th>Pagu</th><th>Total Perencanaan</th><th>Sisa</th><th>Kegiatan</th><th>Dokumen</th><th>Akses</th><th>Progress</th></tr></thead><tbody><tr><td>${esc(r.nama_bidang)}</td><td>${rupiah(r.pagu)}</td><td>${rupiah(r.total_perencanaan)}</td><td>${rupiah(r.sisa_pagu)}</td><td>${esc(r.jumlah_kegiatan || 0)}</td><td>${esc(r.dokumen_upload || 0)}</td><td>${badge(r.status_akses)}</td><td>${badge(r.status_progress)}</td></tr></tbody></table></div></section>`;
  }
}

function renderPerencanaan(){
  const data = dashboard.perencanaan.filter(k => k.id_kegiatan);
  let html = "";
  if(!isAdmin()){
    html += `<section class="panel fade-up"><h3>Input Perencanaan</h3><p class="panel-sub">Input rencana kegiatan/kebutuhan. Setelah disimpan, status langsung DIAJUKAN ke admin.</p><div class="form-grid"><div class="field"><label>Nama Kegiatan</label><input id="namaKegiatan" placeholder="Contoh: Rapat Koordinasi"></div><div class="field"><label>Rincian Kebutuhan</label><input id="rincian" placeholder="Contoh: Konsumsi rapat"></div><div class="field"><label>Keterangan</label><input id="keterangan" placeholder="Opsional"></div><div class="field"><label>Volume</label><input id="volume" inputmode="numeric" placeholder="Contoh: 2" oninput="onAngkaInput(this)"></div><div class="field"><label>Satuan</label><input id="satuan" placeholder="Orang / Paket / Buah"></div><div class="field"><label>Harga Satuan</label><input id="harga" inputmode="numeric" placeholder="Contoh: 500.000" oninput="onAngkaInput(this)"></div><div class="field"><label>Total Otomatis</label><input id="totalPreview" class="readonly-total" value="Rp0" readonly></div></div><button onclick="savePerencanaan()">Simpan & Ajukan</button><div id="saveMsg" class="msg"></div></section>`;
  } else {
    html += `<section class="panel fade-up"><h3>Persetujuan Perencanaan</h3><p class="panel-sub">Admin hanya menyetujui atau menolak inputan bidang. Admin tidak menginput kegiatan.</p></section>`;
  }
  html += `<section class="panel fade-up"><h3>Data Perencanaan</h3><p class="panel-sub">${isAdmin()?"Daftar perencanaan semua bidang.":"Daftar rencana kegiatan bidang sendiri."}</p><div class="table-wrap"><table><thead><tr><th>ID</th><th>Bidang</th><th>Nama Kegiatan</th><th>Rincian</th><th>Volume</th><th>Satuan</th><th>Harga</th><th>Jumlah</th><th>Status</th><th>Alasan/Catatan</th><th>Aksi</th></tr></thead><tbody>${data.map(rowPerencanaan).join("") || `<tr><td colspan="11" class="empty">Belum ada data perencanaan</td></tr>`}</tbody></table></div></section>`;
  document.getElementById("contentArea").innerHTML = html;
}

function rowPerencanaan(p){
  const status = String(p.status_perencanaan || "DIAJUKAN").toUpperCase();
  const jumlah = toNumber(p.jumlah) || (toNumber(p.volume) * toNumber(p.harga_satuan));
  let aksi = "-";
  const alasanTolak = p.alasan_penolakan ? `<div><b>Penolakan:</b> ${esc(p.alasan_penolakan)}</div>` : "";
  const alasanUbah = p.alasan_perubahan ? `<div><b>Perubahan:</b> ${esc(p.alasan_perubahan)}</div>` : "";
  const catatan = alasanTolak || alasanUbah ? `<div class="note-cell">${alasanTolak}${alasanUbah}</div>` : "-";
  if(isAdmin()){
    if(["DIAJUKAN","PERUBAHAN_DIAJUKAN"].includes(status)) aksi = `<button class="btn-mini btn-green" onclick="approvePerencanaan('${esc(p.id_kegiatan)}')">Setujui</button><button class="btn-mini btn-orange" onclick="rejectPerencanaan('${esc(p.id_kegiatan)}')">Tolak</button>`;
  } else {
    if(["DIAJUKAN","DITOLAK"].includes(status)) aksi = `<button class="btn-mini" onclick="openEditModal('${esc(p.id_kegiatan)}','normal')">Edit</button><button class="btn-mini btn-red" onclick="deletePerencanaan('${esc(p.id_kegiatan)}')">Hapus</button>`;
    if(status === "DISETUJUI") aksi = `<button class="btn-mini btn-orange" onclick="openEditModal('${esc(p.id_kegiatan)}','change')">Ajukan Perubahan</button>`;
    if(status === "PERUBAHAN_DIAJUKAN") aksi = `<span class="muted">Menunggu persetujuan perubahan</span>`;
  }
  return `<tr><td>${esc(p.id_kegiatan)}</td><td>${esc(bidangName(p.id_bidang))}</td><td>${esc(p.nama_kegiatan)}</td><td>${esc(p.rincian_kebutuhan)}</td><td>${esc(p.volume)}</td><td>${esc(p.satuan)}</td><td>${rupiah(p.harga_satuan)}</td><td><b>${rupiah(jumlah)}</b></td><td>${badge(status)}</td><td>${catatan}</td><td>${aksi}</td></tr>`;
}

function renderPencairan(){
  const docs = dashboard.dokumen;
  let html = "";
  if(!isAdmin()){
    const approved = dashboard.perencanaan.filter(k => String(k.status_perencanaan || "").toUpperCase() === "DISETUJUI");
    html += `<section class="panel fade-up"><h3>Upload Dokumen Pencairan</h3><p class="panel-sub">Upload dokumen pendukung per kegiatan. Dropdown hanya menampilkan kegiatan yang sudah DISETUJUI admin.</p><div class="form-grid"><div class="field"><label>Pilih Kegiatan</label><select id="uploadKegiatan">${approved.length ? approved.map(k=>`<option value="${esc(k.id_kegiatan)}">${esc(k.nama_kegiatan)}</option>`).join("") : `<option value="">Belum ada kegiatan disetujui</option>`}</select></div><div class="field"><label>Jenis Dokumen</label><select id="jenisDokumen"><option>Berita Acara</option><option>Daftar Hadir</option><option>Dokumentasi</option><option>Kwitansi</option><option>Surat Tugas</option><option>Dokumen Lainnya</option></select></div><div class="field"><label>File Dokumen</label><input id="fileDokumen" type="file"></div></div><button onclick="uploadDokumen()" ${approved.length?"":"disabled"}>Upload Dokumen</button><div id="uploadMsg" class="msg"></div></section>`;
  } else {
    html += `<section class="panel fade-up"><h3>Verifikasi Pencairan</h3><p class="panel-sub">Admin memverifikasi dokumen dan memperbarui status pencairan. Admin tidak upload dokumen bidang.</p></section>`;
  }
  html += `<section class="panel fade-up"><h3>Data Dokumen & Pencairan</h3><p class="panel-sub">Daftar dokumen pendukung dan status verifikasi.</p><div class="table-wrap"><table><thead><tr><th>Bidang</th><th>Kegiatan</th><th>Jenis</th><th>File</th><th>Status Dokumen</th><th>Status Pencairan</th><th>Catatan</th><th>Aksi Admin</th></tr></thead><tbody>${docs.map(rowDokumen).join("") || `<tr><td colspan="8" class="empty">Belum ada dokumen</td></tr>`}</tbody></table></div></section>`;
  document.getElementById("contentArea").innerHTML = html;
}

function rowDokumen(d){
  const cair = dashboard.pencairan.find(p => String(p.id_kegiatan) === String(d.id_kegiatan));
  let aksi = "-";
  if(isAdmin()){
    aksi = `<button class="btn-mini btn-green" onclick="verifyDokumen('${esc(d.id_dokumen)}','VALID')">Valid</button><button class="btn-mini btn-orange" onclick="verifyDokumen('${esc(d.id_dokumen)}','PERBAIKAN')">Perbaikan</button><button class="btn-mini btn-red" onclick="verifyDokumen('${esc(d.id_dokumen)}','DITOLAK')">Tolak</button><br><button class="btn-mini" onclick="updateStatusCair('${esc(d.id_kegiatan)}','SIAP DICAIRKAN')">Siap Dicairkan</button><button class="btn-mini btn-green" onclick="updateStatusCair('${esc(d.id_kegiatan)}','SUDAH DICAIRKAN')">Sudah Dicairkan</button>`;
  }
  const file = d.url_file ? `<a href="${esc(d.url_file)}" target="_blank">Buka File</a>` : esc(d.nama_file || "-");
  return `<tr><td>${esc(bidangName(d.id_bidang))}</td><td>${esc(kegiatanName(d.id_kegiatan))}</td><td>${esc(d.jenis_dokumen)}</td><td>${file}</td><td>${badge(d.status_verifikasi || "MENUNGGU")}</td><td>${badge(cair?.status_pencairan || "BELUM ADA DOKUMEN")}</td><td>${esc(d.catatan_admin || cair?.catatan_admin || "-")}</td><td>${aksi}</td></tr>`;
}

async function updateBidang(id){
  const pagu = document.getElementById(`pagu_${id}`).value;
  const status = document.getElementById(`akses_${id}`).value;
  showLoading("Menyimpan struktur anggaran...");
  try{ const r = await apiPost({action:"updateBidang", user:currentUser, id_bidang:id, pagu, status_akses:status}); if(!r.success) alert(r.message); await loadDashboard(); }
  catch(e){ alert("Gagal update bidang"); console.error(e); } finally{ hideLoading(); }
}

async function savePerencanaan(){
  const data = {nama_kegiatan:v("namaKegiatan"), rincian_kebutuhan:v("rincian"), keterangan:v("keterangan"), volume:v("volume"), satuan:v("satuan"), harga_satuan:v("harga")};
  if(!data.nama_kegiatan || !data.rincian_kebutuhan || !data.volume || !data.harga_satuan){ document.getElementById("saveMsg").innerText = "Nama kegiatan, rincian, volume, dan harga wajib diisi."; return; }
  showLoading("Menyimpan & mengajukan...");
  try{ const r = await apiPost({action:"savePerencanaan", user:currentUser, data}); if(!r.success){ alert(r.message); return; } clearForm(["namaKegiatan","rincian","keterangan","volume","satuan","harga","totalPreview"]); const tp=document.getElementById("totalPreview"); if(tp) tp.value="Rp0"; await loadDashboard(); }
  catch(e){ alert("Gagal simpan perencanaan"); console.error(e); } finally{ hideLoading(); }
}
function v(id){ return document.getElementById(id)?.value?.trim() || ""; }
function clearForm(ids){ ids.forEach(id=>{ const el=document.getElementById(id); if(el) el.value=""; }); }

function openEditModal(id, mode){
  const p = dashboard.perencanaan.find(x => String(x.id_kegiatan) === String(id)); if(!p) return;
  editMode = mode;
  document.getElementById("editModalTitle").innerText = mode === "change" ? "Ajukan Perubahan Perencanaan" : "Edit Perencanaan";
  document.getElementById("editModalSub").innerText = mode === "change" ? "Perubahan akan menunggu persetujuan admin." : "Data akan diajukan kembali ke admin.";
  document.getElementById("editIdKegiatan").value = p.id_kegiatan;
  document.getElementById("editNamaKegiatan").value = p.nama_kegiatan || "";
  document.getElementById("editRincian").value = p.rincian_kebutuhan || "";
  document.getElementById("editKeterangan").value = p.keterangan || "";
  document.getElementById("editVolume").value = p.volume ? angkaID(p.volume) : "";
  document.getElementById("editSatuan").value = p.satuan || "";
  document.getElementById("editHarga").value = p.harga_satuan ? angkaID(p.harga_satuan) : "";
  const alasanWrap = document.getElementById("editAlasanWrap");
  const alasanInput = document.getElementById("editAlasanPerubahan");
  if(alasanWrap && alasanInput){
    alasanWrap.classList.toggle("hidden", mode !== "change");
    alasanInput.value = mode === "change" ? (p.alasan_perubahan || "") : "";
  }
  setAutoTotal("editVolume", "editHarga", "editTotalPreview");
  document.getElementById("editModal").classList.remove("hidden");
}
function closeEditModal(){ document.getElementById("editModal").classList.add("hidden"); }
async function submitEditPerencanaan(){
  const data = { id_kegiatan:v("editIdKegiatan"), nama_kegiatan:v("editNamaKegiatan"), rincian_kebutuhan:v("editRincian"), keterangan:v("editKeterangan"), volume:v("editVolume"), satuan:v("editSatuan"), harga_satuan:v("editHarga"), mode:editMode, alasan_perubahan:v("editAlasanPerubahan") };
  if(editMode === "change" && !data.alasan_perubahan){ alert("Alasan perubahan wajib diisi."); return; }
  showLoading(editMode === "change" ? "Mengajukan perubahan..." : "Menyimpan perubahan...");
  try{ const r = await apiPost({action:"updatePerencanaan", user:currentUser, data}); if(!r.success){ alert(r.message); return; } closeEditModal(); await loadDashboard(); }
  catch(e){ alert("Gagal update perencanaan"); console.error(e); } finally{ hideLoading(); }
}
async function deletePerencanaan(id){ if(!confirm("Hapus perencanaan ini?")) return; showLoading("Menghapus..."); try{ const r=await apiPost({action:"deletePerencanaan", user:currentUser, id_kegiatan:id}); if(!r.success) alert(r.message); await loadDashboard(); }catch(e){ alert("Gagal hapus"); }finally{ hideLoading(); } }
async function approvePerencanaan(id){ showLoading("Menyetujui..."); try{ const r=await apiPost({action:"approvePerencanaan", user:currentUser, id_kegiatan:id}); if(!r.success) alert(r.message); await loadDashboard(); }catch(e){ alert("Gagal setujui"); }finally{ hideLoading(); } }
async function rejectPerencanaan(id){
  const note = prompt("Alasan penolakan (wajib diisi):") || "";
  if(!note.trim()){ alert("Alasan penolakan wajib diisi."); return; }
  showLoading("Menolak...");
  try{ const r=await apiPost({action:"rejectPerencanaan", user:currentUser, id_kegiatan:id, catatan:note}); if(!r.success) alert(r.message); await loadDashboard(); }catch(e){ alert("Gagal tolak"); }finally{ hideLoading(); }
}

async function uploadDokumen(){
  const id_kegiatan = v("uploadKegiatan"); const jenis = v("jenisDokumen"); const file = document.getElementById("fileDokumen")?.files?.[0];
  if(!id_kegiatan || !file){ document.getElementById("uploadMsg").innerText = "Pilih kegiatan dan file dulu."; return; }
  showLoading("Upload dokumen...");
  try{
    const base64 = await fileToBase64(file);
    const r = await apiPost({action:"uploadDokumen", user:currentUser, id_kegiatan, jenis_dokumen:jenis, file_name:file.name, mime_type:file.type, file_base64:base64});
    if(!r.success){ alert(r.message); return; }
    document.getElementById("fileDokumen").value = ""; await loadDashboard();
  }catch(e){ alert("Gagal upload dokumen"); console.error(e); } finally{ hideLoading(); }
}
function fileToBase64(file){ return new Promise((resolve,reject)=>{ const reader=new FileReader(); reader.onload=()=>resolve(String(reader.result).split(",")[1]); reader.onerror=reject; reader.readAsDataURL(file); }); }
async function verifyDokumen(id,status){ const note=prompt("Catatan admin (opsional):") || ""; showLoading("Memverifikasi dokumen..."); try{ const r=await apiPost({action:"verifyDokumen", user:currentUser, id_dokumen:id, status_verifikasi:status, catatan_admin:note}); if(!r.success) alert(r.message); await loadDashboard(); }catch(e){ alert("Gagal verifikasi"); }finally{ hideLoading(); } }
async function updateStatusCair(id,status){ const note=prompt("Catatan status pencairan (opsional):") || ""; showLoading("Update status pencairan..."); try{ const r=await apiPost({action:"updateStatusPencairan", user:currentUser, id_kegiatan:id, status_pencairan:status, catatan_admin:note}); if(!r.success) alert(r.message); await loadDashboard(); }catch(e){ alert("Gagal update status pencairan"); }finally{ hideLoading(); } }

function logout(){ localStorage.removeItem("siporbo_user"); currentUser=null; dashboard=null; document.getElementById("appPage").classList.add("hidden"); document.getElementById("loginPage").classList.remove("hidden"); }
window.onload = async function(){ const saved=localStorage.getItem("siporbo_user"); if(saved){ currentUser=JSON.parse(saved); activeMenu=isAdmin()?"Dashboard Monitoring":"Struktur Anggaran"; document.getElementById("loginPage").classList.add("hidden"); document.getElementById("appPage").classList.remove("hidden"); await loadDashboard(); } };
