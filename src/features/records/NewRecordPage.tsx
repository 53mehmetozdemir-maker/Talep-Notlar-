import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { addDoc, collection, doc, updateDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../../context/auth-context';
import { useCollection } from '../../hooks/useCollection';
import { timeNow } from '../../lib/date';
import { localDate } from '../../lib/localdate';
import { uploadFiles } from '../../lib/storage';
import type { Department, TalepRecord } from '../../lib/types';

const MAX_SIZE = 10 * 1024 * 1024;
const isImg = (n: string) => /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(n);

function fmt(b: number): string {
  return b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB';
}

function emoji(n: string): string {
  if (/\.pdf$/i.test(n)) return '📄';
  if (/\.(doc|docx)$/i.test(n)) return '📝';
  if (/\.(xls|xlsx)$/i.test(n)) return '📊';
  return '📎';
}

interface Picked {
  file: File;
  preview: string | null;
}

export function NewRecordPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const depts = useCollection<Department>('departments').data;
  const records = useCollection<TalepRecord>('records').data;

  const [no, setNo] = useState('');
  const [date, setDate] = useState(localDate());
  const [deptSel, setDeptSel] = useState('');
  const [desc, setDesc] = useState('');
  const [files, setFiles] = useState<Picked[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState('');
  const [pct, setPct] = useState(0);
  const [over, setOver] = useState(false);

  const dept = deptSel || depts[0]?.name || '';

  function pick(list: FileList | null) {
    if (!list) return;
    const ok: Picked[] = [];
    const bad: string[] = [];
    Array.from(list).forEach((f) => {
      if (f.size > MAX_SIZE) bad.push(f.name);
      else ok.push({ file: f, preview: isImg(f.name) ? URL.createObjectURL(f) : null });
    });
    setError(bad.length ? `10 MB'dan büyük dosyalar eklenmedi: ${bad.join(', ')}` : '');
    setFiles((prev) => [...prev, ...ok]);
  }

  function removeAt(i: number) {
    const p = files[i];
    if (p?.preview) URL.revokeObjectURL(p.preview);
    setFiles(files.filter((_, j) => j !== i));
  }

  async function save() {
    const n = no.trim();
    const d = desc.trim();
    if (!user?.email) return;
    if (!n) return setError('Talep numarası giriniz.');
    if (!dept) return setError('Lütfen bir departman seçiniz.');
    if (!d) return setError('Lütfen talep açıklaması giriniz.');
    if (records.some((r) => String(r.no).trim() === n)) {
      return setError('Bu talep numarası zaten kullanılıyor.');
    }
    setBusy(true);
    setError('');
    try {
      const created = await addDoc(collection(db, 'records'), {
        no: n,
        date,
        time: timeNow(),
        dept,
        desc: d,
        user: user.email,
        files: [],
      });
      if (files.length) {
        const uploaded = await uploadFiles(
          created.id,
          files.map((f) => f.file),
          (p, name) => {
            setPct(p);
            setProgress(`Yükleniyor: ${name} (%${p})`);
          },
        );
        await updateDoc(doc(db, 'records', created.id), { files: uploaded });
      }
      files.forEach((f) => f.preview && URL.revokeObjectURL(f.preview));
      navigate('/talepler');
    } catch (e) {
      setError('Kayıt sırasında hata: ' + (e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="page-hdr">
        <h2>
          Yeni <em>Kayıt</em>
        </h2>
        <p>Yeni talep oluştur</p>
      </div>
      <div className="x-panel x-form">
        <h3>Talep Detayı</h3>
        <span className="x-sub">Aşağıdaki alanları doldurarak kaydı sisteme işleyin</span>
        <div className="x-div">
          <span>bilgiler</span>
        </div>
        <label>Talep No</label>
        <input value={no} onChange={(e) => setNo(e.target.value)} />
        <label>Tarih</label>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <label>Departman</label>
        <select value={dept} onChange={(e) => setDeptSel(e.target.value)}>
          {depts.map((d) => (
            <option key={d.id} value={d.name}>
              {d.name}
            </option>
          ))}
        </select>
        <label>Açıklama</label>
        <textarea
          rows={5}
          placeholder="Talep detaylarını buraya yazın..."
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
        />
        <div className="x-div">
          <span>dosya ekle (isteğe bağlı)</span>
        </div>
        <div
          className={'x-drop' + (over ? ' over' : '')}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            pick(e.dataTransfer.files);
          }}
        >
          <input
            type="file"
            multiple
            accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
            onChange={(e) => {
              pick(e.target.files);
              e.target.value = '';
            }}
          />
          <span className="x-drop-icon">📎</span>
          <div className="x-drop-label">
            Dosyaları buraya sürükle veya <b>seçmek için tıkla</b>
          </div>
          <div className="x-drop-hint">Görsel, PDF, Word, Excel · Maks 10MB/dosya</div>
        </div>
        {files.map((p, i) => (
          <div className="x-file" key={p.file.name + i}>
            {p.preview ? <img className="x-thumb" src={p.preview} alt="" /> : <span>{emoji(p.file.name)}</span>}
            <span>{p.file.name}</span>
            <span>{fmt(p.file.size)}</span>
            <button type="button" className="x-del" onClick={() => removeAt(i)}>
              ✖
            </button>
          </div>
        ))}
        {busy && files.length > 0 && (
          <>
            <div className="x-bar">
              <i style={{ width: pct + '%' }} />
            </div>
            <div className="x-note">{progress}</div>
          </>
        )}
        {error && <div className="x-err">{error}</div>}
        <button className="x-btn" type="button" disabled={busy} onClick={save}>
          {busy ? 'Kaydediliyor...' : 'Sisteme Kaydet →'}
        </button>
      </div>
    </div>
  );
}