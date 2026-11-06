import { appConfirm } from '../../lib/dialog';
import { useState } from 'react';
import { FilePicker } from '../../components/FilePicker';
import type { PendingFile } from '../../components/FilePicker';
import { fileEmoji, isHttpUrl, isImage } from '../../lib/files';
import type { Department, RecordFile, TalepRecord } from '../../lib/types';
import { removeRecordFile, saveRecordEdit } from './api';
import { Modal } from './Modal';

interface Props {
  record: TalepRecord;
  records: TalepRecord[];
  departments: Department[];
  onClose: () => void;
}

export function EditRecordModal({ record, records, departments, onClose }: Props) {
  const [no, setNo] = useState(String(record.no));
  const [date, setDate] = useState(record.date);
  const [dept, setDept] = useState(record.dept ?? '');
  const [desc, setDesc] = useState(record.desc ?? '');
  const [pending, setPending] = useState<PendingFile[]>([]);
  const [busy, setBusy] = useState(false);
  const [deletingUrl, setDeletingUrl] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ pct: number; name: string } | null>(null);
  const [noError, setNoError] = useState('');
  const [error, setError] = useState('');

  const existing = record.files ?? [];
  const locked = busy || deletingUrl !== null;

  const deptNames = departments.map((d) => d.name);
  // Departman sonradan silinmişse mevcut değer yine de seçenekte kalsın.
  if (dept && !deptNames.includes(dept)) deptNames.push(dept);

  function close() {
    if (!locked) onClose();
  }

  async function handleRemoveFile(f: RecordFile) {
    if (!await appConfirm(`"${f.name}" dosyası silinsin mi?`)) return;
    setError('');
    setDeletingUrl(f.url);
    try {
      await removeRecordFile(record, f);
    } catch (err) {
      console.error('Dosya silinemedi:', err);
      setError(`Dosya silinemedi: ${err instanceof Error ? err.message : 'bilinmeyen hata'}`);
    } finally {
      setDeletingUrl(null);
    }
  }

  async function handleSave() {
    const noVal = no.trim();
    setError('');
    if (!noVal) {
      setNoError('Talep numarası boş olamaz.');
      return;
    }
    if (records.some((r) => String(r.no).trim() === noVal && r.id !== record.id)) {
      setNoError('Bu talep numarası zaten kullanılıyor.');
      return;
    }
    setNoError('');
    setBusy(true);
    try {
      await saveRecordEdit(
        record,
        { no: noVal, date, dept, desc },
        pending.map((p) => p.file),
        (pct, name) => setProgress({ pct, name }),
      );
      onClose();
    } catch (err) {
      console.error('Kayıt güncellenemedi:', err);
      setError(`Kayıt sırasında hata: ${err instanceof Error ? err.message : 'bilinmeyen hata'}`);
      setBusy(false);
      setProgress(null);
    }
  }

  return (
    <Modal variant="edit" onClose={close}>
      <div className="edit-modal-inner">
        <button type="button" className="edit-modal-close" onClick={close}>
          ✕
        </button>
        <div className="edit-modal-header">
          <h3>
            Talep <em>Düzenle</em>
          </h3>
        </div>
        <span className="edit-modal-sub">KAYDI GÜNCELLE — SADECE TALEP SAHİBİ DÜZENLEYEBİLİR</span>
        <div className="edit-owner-badge">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
          <span>{record.user || '—'}</span>
        </div>

        <div className="edit-field-row">
          <div>
            <label htmlFor="edit-no">Talep No</label>
            <input
              id="edit-no"
              className={noError ? 'input-error' : undefined}
              value={no}
              disabled={locked}
              onChange={(e) => {
                setNo(e.target.value);
                setNoError('');
              }}
            />
            {noError && <div className="field-error-msg visible">⚠ {noError}</div>}
          </div>
          <div>
            <label htmlFor="edit-date">Tarih</label>
            <input id="edit-date" type="date" value={date} disabled={locked} onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>
        <div className="edit-field-full">
          <label htmlFor="edit-dept">Departman</label>
          <select id="edit-dept" value={dept} disabled={locked} onChange={(e) => setDept(e.target.value)}>
            {deptNames.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
        <div className="edit-field-full">
          <label htmlFor="edit-desc">Açıklama</label>
          <textarea
            id="edit-desc"
            rows={6}
            placeholder="Talep detaylarını güncelleyin..."
            value={desc}
            disabled={locked}
            onChange={(e) => setDesc(e.target.value)}
          />
        </div>

        {existing.length > 0 && (
          <>
            <div className="divider">
              <span>mevcut dosyalar</span>
            </div>
            <div className="ef-list">
              {existing.map((f) => (
                <div className="ef-row" key={f.url}>
                  {isHttpUrl(f.url) && isImage(f.name) ? (
                    <img className="ef-thumb" src={f.url} alt="" />
                  ) : (
                    <div className="ef-icon">{fileEmoji(f.name)}</div>
                  )}
                  <a
                    className="ef-name"
                    href={isHttpUrl(f.url) ? f.url : undefined}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={f.name}
                  >
                    {f.name}
                  </a>
                  <button
                    type="button"
                    className="act act-del"
                    disabled={locked}
                    onClick={() => void handleRemoveFile(f)}
                  >
                    {deletingUrl === f.url ? 'Siliniyor...' : '🗑 Sil'}
                  </button>
                </div>
              ))}
            </div>
          </>
        )}

        <div className="divider">
          <span>dosya ekle (isteğe bağlı)</span>
        </div>
        <FilePicker files={pending} onChange={setPending} onError={setError} disabled={locked} />

        {progress && (
          <div className="upload-progress">
            <div className="upload-progress-bar">
              <div className="upload-progress-fill" style={{ width: `${progress.pct}%` }} />
            </div>
            <div className="upload-progress-text">
              Yükleniyor: {progress.name} ({progress.pct}%)
            </div>
          </div>
        )}
        {error && <div className="login-error" role="alert" style={{ marginTop: 14 }}>{error}</div>}

        <button type="button" className="btn-primary" style={{ marginTop: 20 }} disabled={locked} onClick={handleSave}>
          {busy ? 'Kaydediliyor...' : 'Değişiklikleri Kaydet'}
        </button>
        <button type="button" className="btn-cancel" disabled={locked} onClick={close}>
          İptal
        </button>
      </div>
    </Modal>
  );
}