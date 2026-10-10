"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, ArrowLeft, Camera, CameraOff, Check, ChevronDown, CircleHelp, Clock3, Download, Leaf, LoaderCircle, Package, Plus, Printer, RefreshCw, ScanLine, Settings2, ShoppingBasket, Trash2, Weight, X } from 'lucide-react';
import { DEFAULT_CATEGORIES, rupiah, type Category, type CategoryKey } from '@/lib/catalog';
import { getPrices, getTransactions, savePrices, saveTransaction, type InvoiceItem, type Transaction } from '@/lib/store';

type Detection = { key: CategoryKey; label: string; score: number; box?: [number, number, number, number] };
const CLASS_KEYS: CategoryKey[] = ['kertas', 'plastik', 'besi', 'tembaga'];
const nowId = () => `TRX-${Date.now()}`;

export default function RongsokApp() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const modelRef = useRef<any>(null);
  const busyRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [facing, setFacing] = useState<'environment' | 'user'>('environment');
  const [cameraError, setCameraError] = useState('');
  const [modelState, setModelState] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading');
  const [modelMessage, setModelMessage] = useState('Memeriksa model lokal…');
  const [detections, setDetections] = useState<Detection[]>([]);
  const [selected, setSelected] = useState<CategoryKey>('plastik');
  const [modalOpen, setModalOpen] = useState(false);
  const [weight, setWeight] = useState('1.00');
  const [customer, setCustomer] = useState('Umum');
  const [items, setItems] = useState<InvoiceItem[]>([]);
  const [page, setPage] = useState<'scan' | 'cart' | 'history' | 'settings' | 'invoice'>('scan');
  const [history, setHistory] = useState<Transaction[]>([]);
  const [completed, setCompleted] = useState<Transaction | null>(null);
  const [prices, setPrices] = useState<Record<CategoryKey, number>>({ kertas: 1500, plastik: 2500, besi: 4000, tembaga: 65000 });
  const [priceDraft, setPriceDraft] = useState<Record<CategoryKey, string>>({ kertas: '1500', plastik: '2500', besi: '4000', tembaga: '65000' });
  const [toast, setToast] = useState('');

  const category = DEFAULT_CATEGORIES.find((c) => c.key === selected) ?? DEFAULT_CATEGORIES[1];
  const parsedWeight = Number(weight);
  const subtotal = Number.isFinite(parsedWeight) && parsedWeight > 0 ? Math.round(parsedWeight * prices[selected]) : 0;
  const grandTotal = items.reduce((sum, item) => sum + item.subtotal, 0);

  const refreshHistory = useCallback(async () => {
    try { setHistory(await getTransactions()); } catch { setToast('Penyimpanan lokal belum tersedia di browser ini.'); }
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const saved = await getPrices();
        if (saved && active) {
          const normalized = { ...prices, ...saved };
          setPrices(normalized);
          setPriceDraft({ kertas: String(normalized.kertas), plastik: String(normalized.plastik), besi: String(normalized.besi), tembaga: String(normalized.tembaga) });
        }
      } catch { /* IndexedDB can be unavailable in private browser modes. */ }
      await refreshHistory();
      try {
        const tf = await import('@tensorflow/tfjs');
        if (!active) return;
        const model = await tf.loadGraphModel('/models/model.json');
        if (!active) { model.dispose(); return; }
        modelRef.current = model;
        setModelState('ready');
        setModelMessage('Model lokal berhasil dimuat.');
      } catch {
        if (!active) return;
        setModelState('missing');
        setModelMessage('Model AI belum tersedia. Pemilihan kategori manual tetap bisa digunakan.');
      }
    })();
    return () => { active = false; stopCamera(); modelRef.current?.dispose?.(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshHistory]);

  const stopCamera = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraOn(false);
  }, []);

  const startCamera = useCallback(async () => {
    setCameraError('');
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('Browser ini tidak mendukung kamera. Gunakan browser modern melalui HTTPS.');
      return;
    }
    stopCamera();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: facing }, width: { ideal: 960 }, height: { ideal: 720 }, aspectRatio: { ideal: 4 / 3 } } });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraOn(true);
      setCameraError('');
    } catch (error) {
      const err = error as { name?: string };
      setCameraError(err.name === 'NotAllowedError' ? 'Izin kamera ditolak. Aktifkan izin kamera untuk situs ini di pengaturan browser.' : err.name === 'NotFoundError' ? 'Kamera tidak ditemukan pada perangkat ini.' : 'Kamera tidak dapat dibuka. Pastikan halaman menggunakan HTTPS dan kamera tidak dipakai aplikasi lain.');
    }
  }, [facing, stopCamera]);

  useEffect(() => {
    if (!cameraOn || !videoRef.current || !canvasRef.current) return;
    let cancelled = false;
    const detect = async () => {
      if (cancelled || busyRef.current || !modelRef.current || !videoRef.current || !canvasRef.current || videoRef.current.readyState < 2) return;
      busyRef.current = true;
      let outputs: any = null;
      try {
        const tf = await import('@tensorflow/tfjs');
        const video = videoRef.current;
        const canvas = canvasRef.current;
        const input = tf.tidy(() => tf.browser.fromPixels(video).resizeBilinear([320, 320]).toFloat().div(255).expandDims(0));
        try {
          outputs = await modelRef.current.executeAsync(input);
        } finally { input.dispose(); }
        if (cancelled) return;
        const tensors: any[] = Array.isArray(outputs) ? outputs : Object.values(outputs ?? {});
        const arrays = await Promise.all(tensors.map(async (t: any) => {
          try { return { shape: t.shape as number[], data: await t.data() as Float32Array }; } catch { return null; }
        }));
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        canvas.width = video.videoWidth || 640;
        canvas.height = video.videoHeight || 480;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const found: Detection[] = [];
        const boxTensor = arrays.find((a) => a && a.shape.length >= 2 && a.shape[a.shape.length - 1] === 4 && a.shape.some((n) => n > 1));
        const scoreTensor = arrays.find((a) => a && a !== boxTensor && a.shape.length >= 1 && a.data.length > 0 && a.data.length <= 100 && a.data.every((n) => n >= 0 && n <= 1));
        const classTensor = arrays.find((a) => a && a !== boxTensor && a !== scoreTensor && a.data.length > 0 && a.data.length <= 100 && a.data.every((n) => n >= 0 && n <= 20));
        if (boxTensor && scoreTensor && classTensor) {
          const count = Math.min(20, scoreTensor.data.length, classTensor.data.length, Math.floor(boxTensor.data.length / 4));
          for (let i = 0; i < count; i++) {
            const score = scoreTensor.data[i];
            if (score < 0.35) continue;
            const classIndex = Math.round(classTensor.data[i]);
            const key = CLASS_KEYS[classIndex] ?? CLASS_KEYS[Math.max(0, classIndex - 1)];
            const raw = Array.from(boxTensor.data.slice(i * 4, i * 4 + 4));
            const [ymin, xmin, ymax, xmax] = raw;
            const normalized = raw.every((v) => v >= 0 && v <= 1);
            const x = (normalized ? xmin : xmin / 320) * canvas.width;
            const y = (normalized ? ymin : ymin / 320) * canvas.height;
            const w = (normalized ? xmax - xmin : (xmax - xmin) / 320) * canvas.width;
            const h = (normalized ? ymax - ymin : (ymax - ymin) / 320) * canvas.height;
            ctx.strokeStyle = '#34d399'; ctx.lineWidth = Math.max(2, canvas.width / 300); ctx.strokeRect(x, y, w, h);
            ctx.fillStyle = '#047857'; ctx.fillRect(x, Math.max(0, y - 28), Math.max(100, key.length * 12 + 60), 26);
            ctx.fillStyle = '#ffffff'; ctx.font = 'bold 15px Arial'; ctx.fillText(`${key} ${Math.round(score * 100)}%`, x + 6, Math.max(18, y - 10));
            found.push({ key, label: DEFAULT_CATEGORIES.find((c) => c.key === key)?.label ?? key, score, box: [x, y, w, h] });
          }
        }
        setDetections(found);
      } catch {
        setModelMessage('Model dimuat tetapi format output belum dikenali. Periksa arsitektur model dan pemetaan kelas.');
      } finally {
        if (outputs) {
          const tensors = Array.isArray(outputs) ? outputs : Object.values(outputs);
          (tensors as any[]).forEach((t) => t?.dispose?.());
        }
        busyRef.current = false;
      }
    };
    timerRef.current = setInterval(() => { void detect(); }, 200);
    return () => { cancelled = true; if (timerRef.current) clearInterval(timerRef.current); timerRef.current = null; };
  }, [cameraOn]);

  const openCapture = (key?: CategoryKey) => {
    if (key) setSelected(key);
    setWeight('1.00');
    setModalOpen(true);
  };
  const addItem = () => {
    if (!Number.isFinite(parsedWeight) || parsedWeight <= 0 || !/^\d+(\.\d{1,2})?$/.test(weight.trim())) {
      setToast('Masukkan berat lebih dari 0 kg dengan maksimal 2 angka desimal.'); return;
    }
    const cat = DEFAULT_CATEGORIES.find((c) => c.key === selected)!;
    const item: InvoiceItem = { item_id: `item-${Date.now()}-${Math.random().toString(36).slice(2,7)}`, category_key: selected, category_label: cat.label, price_per_kg: prices[selected], weight_kg: Math.round(parsedWeight * 100) / 100, subtotal: Math.round(parsedWeight * prices[selected]) };
    setItems((current) => [...current, item]);
    setModalOpen(false);
    setToast(`${cat.shortLabel} ditambahkan ke nota.`);
  };
  const finishTransaction = async () => {
    if (!items.length) { setToast('Tambahkan setidaknya satu barang ke nota.'); return; }
    const tx: Transaction = { transaction_id: nowId(), created_at: new Date().toISOString(), customer_name: customer.trim() || 'Umum', items: items.map((item) => ({ ...item })), grand_total: grandTotal, status: 'COMPLETED' };
    try {
      await saveTransaction(tx);
      setCompleted(tx); setItems([]); setPage('invoice'); await refreshHistory();
      setToast('Transaksi tersimpan di perangkat.');
    } catch {
      setToast('Gagal menyimpan transaksi ke penyimpanan browser. Periksa izin penyimpanan dan coba lagi.');
    }
  };
  const deleteItem = (id: string) => setItems((current) => current.filter((item) => item.item_id !== id));
  const updateWeight = (id: string, value: string) => {
    if (value !== '' && !/^\d*(\.\d{0,2})?$/.test(value)) return;
    setItems((current) => current.map((item) => item.item_id === id ? { ...item, weight_kg: Number(value) || 0, subtotal: Math.round((Number(value) || 0) * item.price_per_kg) } : item));
  };
  const savePriceConfig = async () => {
    const next = { kertas: Number(priceDraft.kertas), plastik: Number(priceDraft.plastik), besi: Number(priceDraft.besi), tembaga: Number(priceDraft.tembaga) };
    if (Object.values(next).some((value) => !Number.isFinite(value) || value < 0)) { setToast('Harga harus berupa angka nol atau lebih.'); return; }
    try { await savePrices(next); setPrices(next); setPage('scan'); setToast('Konfigurasi harga disimpan di perangkat.'); }
    catch { setToast('Harga gagal disimpan. Browser mungkin membatasi penyimpanan lokal.'); }
  };

  const navItems = [
    { id: 'scan' as const, label: 'Pindai', icon: ScanLine },
    { id: 'cart' as const, label: 'Nota', icon: ShoppingBasket },
    { id: 'history' as const, label: 'Riwayat', icon: Clock3 },
    { id: 'settings' as const, label: 'Harga', icon: Settings2 },
  ];
  return <main className="app-shell min-h-screen pb-24 md:pb-8">
    <header className="no-print border-b border-emerald-950/10 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-4 sm:px-6">
        <div className="flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-700 text-white"><Leaf size={24}/></div><div><p className="text-base font-extrabold tracking-tight">Rongsok Sejahtera</p><p className="text-xs muted">CV. Rongsok Sejahtera</p></div></div>
        <div className="hidden items-center gap-2 rounded-full bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800 sm:flex"><span className="h-2 w-2 rounded-full bg-emerald-500"/> Mode lokal · Offline-ready</div>
        <button className="btn-secondary !p-2.5" onClick={() => setPage('settings')} aria-label="Pengaturan harga"><Settings2 size={18}/></button>
      </div>
    </header>
    <div className="mx-auto grid max-w-6xl gap-6 px-4 py-5 sm:px-6 lg:grid-cols-[1fr_340px] lg:py-8">
      <section className="min-w-0">
        {page === 'scan' && <>
          <div className="mb-5 flex flex-wrap items-start justify-between gap-3"><div><p className="mb-1 text-sm font-bold text-emerald-700">OPERASIONAL LAPANGAN</p><h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">Pindai barang rongsok</h1><p className="mt-2 max-w-xl text-sm muted">Arahkan kamera ke barang, lalu pilih kategori untuk mencatat berat dan menghitung nilai timbang.</p></div><span className="rounded-xl bg-white px-3 py-2 text-sm font-semibold text-slate-600 ring-1 ring-slate-200"><Package size={16} className="mr-1 inline"/> {items.length} item</span></div>
          <div className="panel p-3 sm:p-4">
            <div className="mb-3 flex items-center justify-between gap-2"><div className="flex items-center gap-2 text-sm font-bold"><Camera size={18} className="text-emerald-700"/> Kamera langsung</div><button className="btn-secondary !px-3 !py-2 text-sm" onClick={() => { const next = facing === 'environment' ? 'user' : 'environment'; setFacing(next); if (cameraOn) { stopCamera(); setTimeout(() => void startCamera(), 100); } }}><RefreshCw size={15}/> Ganti kamera</button></div>
            <div className="camera-feed aspect-[4/3]">
              <video ref={videoRef} autoPlay muted playsInline className={cameraOn ? '' : 'hidden'}/>
              <canvas ref={canvasRef} className={cameraOn ? '' : 'hidden'}/>
              {!cameraOn && <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center text-white"><div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-white/15 bg-white/10"><CameraOff size={30}/></div><p className="text-lg font-bold">Kamera belum aktif</p><p className="mt-2 max-w-sm text-sm text-slate-300">Aktifkan kamera untuk memulai pemindaian. Browser akan meminta izin akses kamera.</p><button className="btn-primary mt-5" onClick={() => void startCamera()}><Camera size={18}/> Aktifkan kamera</button></div>}
              {cameraOn && <><div className="scan-corners"/><div className="absolute bottom-3 left-3 rounded-lg bg-black/60 px-3 py-2 text-xs font-semibold text-white">{modelState === 'ready' ? (detections.length ? `${detections.length} objek terdeteksi` : 'Mencari objek…') : 'Pilih kategori secara manual'}</div><button onClick={stopCamera} className="absolute right-3 top-3 rounded-lg bg-black/60 p-2 text-white" aria-label="Matikan kamera"><X size={17}/></button></>}
            </div>
            {cameraError && <div className="mt-3 flex gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800"><AlertCircle size={18} className="mt-0.5 shrink-0"/><span>{cameraError}</span></div>}
            <div className="mt-3 flex items-start gap-2 rounded-xl bg-slate-50 p-3 text-xs leading-relaxed text-slate-600"><CircleHelp size={16} className="mt-0.5 shrink-0 text-slate-500"/><div><b>Status AI:</b> {modelMessage} {modelState === 'missing' && 'Tambahkan model GraphModel yang sesuai di public/models/model.json.'}</div></div>
            {cameraOn && detections.length > 0 && <div className="mt-4"><p className="mb-2 text-sm font-bold">Hasil deteksi · pilih untuk mencatat</p><div className="grid grid-cols-1 gap-2 sm:grid-cols-2">{detections.map((d,i) => <button key={i} onClick={() => openCapture(d.key)} className="flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-left"><span><span className="block text-sm font-bold">{d.label}</span><span className="text-xs text-emerald-800">Keyakinan {Math.round(d.score*100)}%</span></span><Plus size={18} className="text-emerald-700"/></button>)}</div></div>}
          </div>
          <div className="mt-5"><div className="mb-3 flex items-end justify-between gap-2"><div><h2 className="text-lg font-extrabold">Pilih kategori barang</h2><p className="mt-1 text-sm muted">Bisa digunakan meskipun model AI belum dipasang.</p></div></div><div className="grid grid-cols-2 gap-3 xl:grid-cols-4">{DEFAULT_CATEGORIES.map((cat) => <button key={cat.key} onClick={() => { setSelected(cat.key); openCapture(cat.key); }} className="panel group p-4 text-left transition hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-md"><div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700"><Package size={21}/></div><p className="font-bold">{cat.shortLabel}</p><p className="mt-1 min-h-8 text-xs muted">{cat.description}</p><p className="mt-3 text-sm font-extrabold text-emerald-800">{rupiah(prices[cat.key])}<span className="font-medium muted"> /kg</span></p><div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3 text-xs font-bold text-emerald-700">Pilih item <Plus size={15}/></div></button>)}</div></div>
        </>}
        {page === 'cart' && <><PageHeading title="Ringkasan nota" subtitle="Periksa barang dan berat sebelum menyelesaikan transaksi." back={() => setPage('scan')}/><div className="panel mt-5 p-4 sm:p-5"><label className="mb-2 block text-sm font-bold">Nama pelanggan</label><input className="field mb-5" value={customer} onChange={(e) => setCustomer(e.target.value)} placeholder="Nama pelanggan (opsional)"/>{items.length === 0 ? <EmptyState title="Belum ada barang" text="Kembali ke pemindai untuk menambahkan barang." action={() => setPage('scan')}/> : <div className="space-y-3">{items.map((item,index) => <div key={item.item_id} className="rounded-xl border border-slate-200 p-3"><div className="mb-3 flex items-start justify-between gap-2"><div><p className="text-sm font-bold">{index+1}. {item.category_label}</p><p className="mt-1 text-xs muted">{rupiah(item.price_per_kg)} / kg</p></div><button onClick={() => deleteItem(item.item_id)} className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label="Hapus item"><Trash2 size={17}/></button></div><div className="grid grid-cols-2 items-end gap-3"><label className="text-xs font-semibold muted">Berat (kg)<input className="field mt-1" inputMode="decimal" value={String(item.weight_kg)} onChange={(e) => updateWeight(item.item_id,e.target.value)}/></label><div><p className="mb-1 text-xs muted">Subtotal</p><p className="pb-3 text-base font-extrabold">{rupiah(item.subtotal)}</p></div></div></div>)}<div className="mt-4 border-t border-slate-200 pt-4"><div className="flex items-center justify-between"><span className="font-bold">Total pembayaran</span><span className="text-xl font-extrabold text-emerald-800">{rupiah(grandTotal)}</span></div><button className="btn-primary mt-4 w-full" onClick={() => void finishTransaction()}><Check size={18}/> Selesaikan transaksi</button></div></div>}</div></>}
        {page === 'history' && <><PageHeading title="Riwayat transaksi" subtitle="Data tersimpan lokal di browser/perangkat ini." back={() => setPage('scan')}/><div className="mt-5 space-y-3">{history.length === 0 ? <EmptyState title="Belum ada riwayat" text="Transaksi yang diselesaikan akan tampil di sini." action={() => setPage('scan')}/> : history.map((tx) => <div className="panel p-4" key={tx.transaction_id}><div className="flex items-start justify-between gap-3"><div><p className="font-bold">{tx.customer_name}</p><p className="mt-1 text-xs muted">{new Date(tx.created_at).toLocaleString('id-ID')} · {tx.items.length} item</p><p className="mt-2 text-xs muted">{tx.transaction_id}</p></div><p className="whitespace-nowrap font-extrabold text-emerald-800">{rupiah(tx.grand_total)}</p></div><button className="btn-secondary mt-3 w-full" onClick={() => { setCompleted(tx); setPage('invoice'); }}>Lihat nota <ChevronDown size={15}/></button></div>)}</div></>}
        {page === 'settings' && <><PageHeading title="Pengaturan harga" subtitle="Harga disimpan di perangkat ini dan tidak dikirim ke server." back={() => setPage('scan')}/><div className="panel mt-5 p-4 sm:p-5"><div className="mb-4 flex items-center gap-2"><Settings2 size={19} className="text-emerald-700"/><h2 className="font-bold">Harga standar per kilogram</h2></div><div className="space-y-4">{DEFAULT_CATEGORIES.map((cat) => <label key={cat.key} className="block text-sm font-semibold">{cat.label}<div className="mt-1 flex items-center gap-3"><span className="text-sm muted">Rp</span><input className="field" inputMode="numeric" type="number" min="0" step="1" value={priceDraft[cat.key]} onChange={(e) => setPriceDraft((prev) => ({...prev,[cat.key]:e.target.value}))}/></div></label>)}</div><button className="btn-primary mt-5 w-full" onClick={() => void savePriceConfig()}><Check size={18}/> Simpan harga</button><p className="mt-3 text-xs leading-relaxed muted">Perubahan harga hanya memengaruhi item yang ditambahkan setelah harga diperbarui. Harga item yang sudah berada di nota tidak berubah.</p></div></>}
        {page === 'invoice' && completed && <div className="invoice-print panel mx-auto max-w-2xl p-5 sm:p-8"><div className="mb-5 flex items-center justify-between gap-3 no-print"><button className="btn-secondary" onClick={() => setPage('history')}><ArrowLeft size={16}/> Kembali</button><button className="btn-primary" onClick={() => window.print()}><Printer size={17}/> Cetak / Simpan PDF</button></div><div className="border-b-2 border-emerald-800 pb-5 text-center"><div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-700 text-white"><Leaf size={27}/></div><h1 className="text-xl font-extrabold">CV. Rongsok Sejahtera</h1><p className="mt-1 text-sm muted">Nota Pembayaran Barang Rongsok</p><p className="mt-1 text-xs muted">Alamat: ______________________________</p></div><div className="my-5 grid grid-cols-2 gap-4 text-sm"><div><p className="text-xs muted">Nomor transaksi</p><p className="mt-1 break-all font-bold">{completed.transaction_id}</p></div><div><p className="text-xs muted">Tanggal</p><p className="mt-1 font-bold">{new Date(completed.created_at).toLocaleString('id-ID')}</p></div><div><p className="text-xs muted">Pelanggan</p><p className="mt-1 font-bold">{completed.customer_name}</p></div><div><p className="text-xs muted">Status</p><p className="mt-1 font-bold text-emerald-700">LUNAS / SELESAI</p></div></div><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b border-slate-300 text-xs uppercase text-slate-500"><th className="py-3 text-left">Barang</th><th className="py-3 text-right">Berat</th><th className="py-3 text-right">Harga/kg</th><th className="py-3 text-right">Subtotal</th></tr></thead><tbody>{completed.items.map((item) => <tr className="border-b border-slate-100" key={item.item_id}><td className="py-3 pr-2 font-semibold">{item.category_label}</td><td className="py-3 text-right">{item.weight_kg.toLocaleString('id-ID',{maximumFractionDigits:2})} kg</td><td className="py-3 text-right">{rupiah(item.price_per_kg)}</td><td className="py-3 text-right font-semibold">{rupiah(item.subtotal)}</td></tr>)}</tbody></table></div><div className="mt-5 rounded-xl bg-emerald-50 p-4"><div className="flex items-center justify-between gap-3"><span className="font-bold">TOTAL PEMBAYARAN</span><span className="text-xl font-extrabold text-emerald-900">{rupiah(completed.grand_total)}</span></div></div><div className="mt-8 grid grid-cols-2 gap-8 text-center text-sm"><div><p>Petugas</p><div className="h-16"/><p className="border-t border-slate-300 pt-2">________________</p></div><div><p>Pelanggan</p><div className="h-16"/><p className="border-t border-slate-300 pt-2">________________</p></div></div><p className="mt-8 text-center text-xs muted">Terima kasih. Nota ini dibuat dari aplikasi lokal CV. Rongsok Sejahtera.</p><div className="no-print mt-6 flex flex-wrap gap-2"><button className="btn-secondary flex-1" onClick={() => { setCompleted(null); setPage('scan'); }}><Plus size={16}/> Transaksi baru</button><button className="btn-secondary flex-1" onClick={() => void refreshHistory()}><RefreshCw size={16}/> Segarkan riwayat</button></div></div>}
      </section>
      <aside className="no-print space-y-4">
        <div className="panel p-4"><div className="mb-4 flex items-center justify-between"><h2 className="font-extrabold">Ringkasan sementara</h2><ShoppingBasket size={19} className="text-emerald-700"/></div><div className="flex items-center justify-between text-sm"><span className="muted">Jumlah item</span><span className="font-bold">{items.length}</span></div><div className="mt-3 flex items-center justify-between text-sm"><span className="muted">Total berat</span><span className="font-bold">{items.reduce((sum,item)=>sum+item.weight_kg,0).toLocaleString('id-ID',{maximumFractionDigits:2})} kg</span></div><div className="my-4 border-t border-slate-100"/><p className="text-xs font-bold uppercase tracking-wide muted">Estimasi pembayaran</p><p className="mt-1 text-2xl font-extrabold tracking-tight text-emerald-800">{rupiah(grandTotal)}</p><button className="btn-primary mt-4 w-full" onClick={() => setPage('cart')}>Lihat keranjang <ArrowLeft size={16} className="rotate-180"/></button><button className="btn-secondary mt-2 w-full" onClick={() => setPage('history')}><Clock3 size={16}/> Riwayat transaksi</button></div>
        <div className="panel p-4"><h2 className="mb-3 font-extrabold">Harga acuan / kg</h2>{DEFAULT_CATEGORIES.map((cat) => <div key={cat.key} className="flex items-center justify-between gap-2 border-b border-slate-100 py-2.5 last:border-0"><span className="text-sm">{cat.shortLabel}</span><span className="text-sm font-bold">{rupiah(prices[cat.key])}</span></div>)}<button className="mt-3 flex items-center gap-2 text-sm font-bold text-emerald-800" onClick={() => setPage('settings')}><Settings2 size={15}/> Atur harga</button></div>
        <div className="rounded-2xl bg-slate-900 p-4 text-white"><div className="flex items-center gap-2"><div className="rounded-lg bg-white/10 p-2"><Weight size={18}/></div><p className="font-bold">Catatan operasional</p></div><p className="mt-3 text-sm leading-relaxed text-slate-300">Berat dimasukkan manual. Pastikan hasil timbang benar sebelum nota diselesaikan. Data transaksi tersimpan hanya pada browser/perangkat ini.</p></div>
      </aside>
    </div>
    <nav className="no-print fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 px-2 pb-[max(8px,env(safe-area-inset-bottom))] pt-2 backdrop-blur md:hidden"><div className="mx-auto grid max-w-lg grid-cols-4 gap-1">{navItems.map(({id,label,icon:Icon}) => <button key={id} onClick={() => setPage(id)} className={`flex flex-col items-center gap-1 rounded-xl px-2 py-2 text-xs font-bold ${page===id?'bg-emerald-50 text-emerald-800':'text-slate-500'}`}><Icon size={20}/>{label}{id==='cart'&&items.length>0&&<span className="absolute ml-8 -mt-1 rounded-full bg-emerald-700 px-1.5 py-0.5 text-[10px] text-white">{items.length}</span>}</button>)}</div></nav>
    {modalOpen && <div className="no-print fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="capture-title"><div className="w-full max-w-md rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl"><div className="mb-5 flex items-start justify-between"><div><p className="text-xs font-bold uppercase tracking-wide text-emerald-700">Pencatatan barang</p><h2 id="capture-title" className="mt-1 text-xl font-extrabold">Input berat barang</h2></div><button onClick={() => setModalOpen(false)} className="rounded-xl bg-slate-100 p-2" aria-label="Tutup"><X size={18}/></button></div><label className="mb-2 block text-sm font-bold">Kategori barang</label><select className="field mb-4" value={selected} onChange={(e) => setSelected(e.target.value as CategoryKey)}>{DEFAULT_CATEGORIES.map((cat) => <option key={cat.key} value={cat.key}>{cat.label} · {rupiah(prices[cat.key])}/kg</option>)}</select><label className="mb-2 block text-sm font-bold">Berat (kilogram)</label><div className="relative"><input className="field pr-14 text-lg font-bold" autoFocus inputMode="decimal" value={weight} onChange={(e) => { const v=e.target.value; if (/^\d*(\.\d{0,2})?$/.test(v)) setWeight(v); }} placeholder="Contoh: 2.55"/><span className="absolute right-4 top-3.5 text-sm font-bold muted">KG</span></div><div className="mt-4 rounded-xl bg-emerald-50 p-4"><div className="flex justify-between text-sm"><span className="text-emerald-900/70">Harga per kg</span><span className="font-bold">{rupiah(prices[selected])}</span></div><div className="mt-2 flex justify-between text-sm"><span className="text-emerald-900/70">Berat</span><span className="font-bold">{Number(weight||0).toLocaleString('id-ID',{maximumFractionDigits:2})} kg</span></div><div className="mt-3 border-t border-emerald-200 pt-3"><div className="flex items-center justify-between gap-2"><span className="font-bold">Subtotal</span><span className="text-xl font-extrabold text-emerald-900">{rupiah(subtotal)}</span></div></div></div><button className="btn-primary mt-5 w-full" onClick={addItem}><Plus size={18}/> Tambah ke nota</button></div></div>}
    {toast && <div className="no-print fixed bottom-24 left-1/2 z-[60] flex max-w-[calc(100%-32px)] -translate-x-1/2 items-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white shadow-xl md:bottom-5"><Check size={17} className="shrink-0 text-emerald-300"/><span>{toast}</span><button onClick={() => setToast('')} className="ml-2" aria-label="Tutup notifikasi"><X size={15}/></button></div>}
  </main>;
}

function PageHeading({title,subtitle,back}:{title:string;subtitle:string;back:()=>void}) { return <div><button onClick={back} className="no-print mb-4 flex items-center gap-2 text-sm font-bold text-emerald-800"><ArrowLeft size={16}/> Kembali ke pemindai</button><h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">{title}</h1><p className="mt-2 text-sm muted">{subtitle}</p></div>; }
function EmptyState({title,text,action}:{title:string;text:string;action:()=>void}) { return <div className="rounded-2xl border border-dashed border-slate-300 px-5 py-10 text-center"><div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-500"><ShoppingBasket size={23}/></div><p className="font-bold">{title}</p><p className="mt-1 text-sm muted">{text}</p><button className="btn-secondary mt-4" onClick={action}>Mulai sekarang</button></div>; }
