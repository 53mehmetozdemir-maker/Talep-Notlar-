import { appAlert, appConfirm, appToast } from '../../lib/dialog';
import { useMemo, useState } from 'react';
import { useAuth } from '../../context/auth-context';
import { useCollection } from '../../hooks/useCollection';
import { daysAgo, toLocalDateString } from '../../lib/date';
import type { Department, TalepRecord } from '../../lib/types';
import { deleteRecord } from './api';
import { DescModal } from './DescModal';
import { EditRecordModal } from './EditRecordModal';
import { FileModal } from './FileModal';
import { filterRecords } from './filters';
import { canModifyRecord } from './permissions';
import { exportRecordsToExcel } from './exportExcel';

type QuickMode = 'today' | 'week' | 'month' | 'all';

const QUICK_FILTERS: { mode: QuickMode; label: string }[] = [
  { mode: 'today', label: 'Bugün' },
  { mode: 'week', label: 'Son 1 Hafta' },
  { mode: 'month', label: 'Son 1 Ay' },
  { mode: 'all', label: 'Tüm Zamanlar' },
];

const SHORT_LENGTH = 110;

function rangeFor(mode: QuickMode): { start: string; end: string } {
  const today = toLocalDateString();
  switch (mode) {
    case 'today':
      return { start: today, end: today };
    case 'week':
      return { start: daysAgo(7), end: today };
    case 'month':
      return { start: daysAgo(30), end: today };
    default:
      return { start: '', end: '' };
  }
}

export function RecordsPage() {
  const { user, role } = useAuth();
  const records = useCollection<TalepRecord>('records');
  const departments = useCollection<Department>('departments');

  const [search, setSearch] = useState('');
  const [dept, setDept] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [quick, setQuick] = useState<QuickMode | 'custom'>('all');
  const [descRecord, setDescRecord] = useState<TalepRecord | null>(null);
  const [filesRecord, setFilesRecord] = useState<TalepRecord | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const editRecord = editId ? records.data.find((r) => r.id === editId) ?? null : null;

  const filtered = useMemo(
    () => filterRecords(records.data, { search, dept, start, end }),
    [records.data, search, dept, start, end],
  );

  function applyQuick(mode: QuickMode) {
    const range = rangeFor(mode);
    setQuick(mode);
    setStart(range.start);
    setEnd(range.end);
  }

  async function handleDelete(record: TalepRecord) {
    if (!await appConfirm('Kaydı Sil?')) return;
    setDeletingId(record.id);
    try {
      await deleteRecord(record);
    } catch (err) {
      console.error('Kayıt silinemedi:', err);
      appAlert(`Kayıt silinemedi: ${err instanceof Error ? err.message : 'bilinmeyen hata'}`);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div>
      <div className="page-hdr">
        <h2>
          Tüm <em>Talepler</em>
        </h2>
        <p>Filtreleyin · Arayın · Dışa aktarın</p>
      </div>

      <div className="panel panel-clip" style={{ marginBottom: 16 }}>
        <div className="quick-filter-bar">
          <span className="quick-filter-label">⚡ Hızlı Filtre</span>
          {QUICK_FILTERS.map((q) => (
            <button
              key={q.mode}
              type="button"
              className={`qf-btn${quick === q.mode ? ' qf-active' : ''}`}
              onClick={() => applyQuick(q.mode)}
            >
              {q.label}
            </button>
          ))}
          <div className="qf-divider" />
          <span className="qf-count">{filtered.length} kayıt</span>
          <button
            type="button"
            onClick={() => {
              if (!filtered.length) {
                appToast('İndirilecek veri bulunamadı!', 'info');
                return;
              }
              exportRecordsToExcel(filtered);
            }}
            style={{
              marginLeft: 'auto',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 7,
              height: 40,
              padding: '0 18px',
              background: 'var(--ok-bg)',
              color: 'var(--ok)',
              border: '1px solid var(--ok-bd)',
              fontFamily: 'inherit',
              fontWeight: 700,
              fontSize: 12,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Excel
          </button>
        </div>
        <div className="filter-row">
          <div>
            <label htmlFor="f-search">Arama</label>
            <input
              id="f-search"
              placeholder="Talep no veya açıklama..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="f-dept">Bölüm</label>
            <select id="f-dept" value={dept} onChange={(e) => setDept(e.target.value)}>
              <option value="">Tüm Bölümler</option>
              {departments.data.map((d) => (
                <option key={d.id} value={d.name}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="f-start">Başlangıç</label>
            <input
              id="f-start"
              type="date"
              value={start}
              onChange={(e) => {
                setStart(e.target.value);
                setQuick('custom');
              }}
            />
          </div>
          <div>
            <label htmlFor="f-end">Bitiş</label>
            <input
              id="f-end"
              type="date"
              value={end}
              onChange={(e) => {
                setEnd(e.target.value);
                setQuick('custom');
              }}
            />
          </div></div>
      </div>

      <div className="panel" style={{ overflowX: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th>No</th>
              <th>Tarih / Saat</th>
              <th>Bölüm</th>
              <th>Açıklama</th>
              <th>Kullanıcı</th>
              <th style={{ textAlign: 'right' }}>İşlem</th>
            </tr>
          </thead>
          <tbody>
            {records.error ? (
              <tr>
                <td colSpan={6}>
                  <div className="empty">
                    <div className="empty-title">{records.error}</div>
                    <div className="empty-text">Sayfayı yenileyin veya yöneticinize bildirin.</div>
                  </div>
                </td>
              </tr>
            ) : records.loading ? (
              <tr>
                <td colSpan={6}>
                  <div className="empty">
                    <div className="empty-text">Yükleniyor…</div>
                  </div>
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={6}>
                  <div className="empty">
                    <div className="empty-icon">✦</div>
                    <div className="empty-title">Kayıt bulunamadı</div>
                    <div className="empty-text">Filtreleri değiştirin veya yeni bir talep oluşturun.</div>
                  </div>
                </td>
              </tr>
            ) : (
              filtered.map((r) => {
                const desc = r.desc ?? '';
                const isLong = desc.length > SHORT_LENGTH;
                const fileCount = r.files?.length ?? 0;
                return (
                  <tr key={r.id}>
                    <td>
                      <b>#{r.no}</b>
                    </td>
                    <td className="cell-date">
                      {r.date}
                      <span className="time-chip">{r.time ?? ''}</span>
                    </td>
                    <td>{r.dept}</td>
                    <td style={{ maxWidth: 290 }}>
                      <div className="desc-cell-text">{isLong ? `${desc.slice(0, SHORT_LENGTH)}…` : desc}</div>
                      {isLong && (
                        <button type="button" className="desc-read-more" onClick={() => setDescRecord(r)}>
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="11" cy="11" r="8" />
                            <line x1="21" y1="21" x2="16.65" y2="16.65" />
                          </svg>
                          Devamını Oku
                        </button>
                      )}
                      {fileCount > 0 && (
                        <span className="attach-chip" onClick={() => setFilesRecord(r)}>
                          📎 {fileCount} dosya
                        </span>
                      )}
                    </td>
                    <td className="cell-user">{r.user}</td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {canModifyRecord(role, user?.email, r) && (
                        <>
                          <button type="button" className="act act-edit" onClick={() => setEditId(r.id)}>
                            ✏ Düzenle
                          </button>
                          <button
                            type="button"
                            className="act act-del"
                            disabled={deletingId === r.id}
                            onClick={() => void handleDelete(r)}
                          >
                            🗑 Sil
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {descRecord && <DescModal record={descRecord} onClose={() => setDescRecord(null)} />}
      {filesRecord && <FileModal record={filesRecord} onClose={() => setFilesRecord(null)} />}
      {editRecord && canModifyRecord(role, user?.email, editRecord) && (
        <EditRecordModal
          key={editRecord.id}
          record={editRecord}
          records={records.data}
          departments={departments.data}
          onClose={() => setEditId(null)}
        />
      )}
    </div>
  );
}
