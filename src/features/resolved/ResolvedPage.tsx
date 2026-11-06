import { useMemo, useState } from 'react';
import { addDoc, collection, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../../context/auth-context';
import { useCollection } from '../../hooks/useCollection';
import { canCreate, isAdmin } from '../../lib/roles';
import { addDays, localDate } from '../../lib/localdate';
import type { ResolvedRecord } from '../../lib/models';

export function ResolvedPage() {
  const { user, role } = useAuth();
  const all = useCollection<ResolvedRecord>('resolvedRecords').data;
  const me = user?.email ?? '';
  const admin = isAdmin(role);

  const [editId, setEditId] = useState('');
  const [no, setNo] = useState('');
  const [date, setDate] = useState(localDate());
  const [desc, setDesc] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const [search, setSearch] = useState('');
  const [fUser, setFUser] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [quick, setQuick] = useState('all');

  const base = useMemo(() => (admin ? all : all.filter((r) => r.user === me)), [all, admin, me]);

  const users = useMemo(
    () =>
      [...new Set(base.map((r) => r.user).filter((u): u is string => !!u))].sort((a, b) =>
        a.localeCompare(b),
      ),
    [base],
  );

  const rows = useMemo(() => {
    const s = search.toLowerCase();
    return base
      .filter((r) => {
        const okS = String(r.no ?? '').toLowerCase().includes(s) || (r.desc ?? '').toLowerCase().includes(s);
        const okD = (!start || (r.date ?? '') >= start) && (!end || (r.date ?? '') <= end);
        const okU = !fUser || r.user === fUser;
        return okS && okD && okU;
      })
      .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
  }, [base, search, start, end, fUser]);

  function setQuickFilter(m: string) {
    setQuick(m);
    const t = localDate();
    if (m === 'today') {
      setStart(t);
      setEnd(t);
    } else if (m === 'week') {
      setStart(localDate(addDays(new Date(), -7)));
      setEnd(t);
    } else if (m === 'month') {
      setStart(localDate(addDays(new Date(), -30)));
      setEnd(t);
    } else {
      setStart('');
      setEnd('');
    }
  }

  function resetForm() {
    setEditId('');
    setNo('');
    setDate(localDate());
    setDesc('');
    setError('');
  }

  async function save() {
    const n = no.trim();
    const d = desc.trim();
    if (!n) return setError('Lütfen ilgili talep numarasını giriniz.');
    if (!d) return setError('Lütfen çözüm açıklaması giriniz.');
    if (all.some((r) => String(r.no).trim() === n && r.id !== editId)) {
      return setError('Bu talep numarası için zaten bir çözüm kaydı mevcut.');
    }
    setBusy(true);
    setError('');
    try {
      if (editId) {
        await updateDoc(doc(db, 'resolvedRecords', editId), { no: n, date, desc: d });
      } else {
        await addDoc(collection(db, 'resolvedRecords'), {
          no: n,
          date,
          desc: d,
          user: me,
          createdAt: new Date().toISOString(),
        });
      }
      resetForm();
    } catch (e) {
      setError('Kayıt sırasında hata: ' + (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function startEdit(r: ResolvedRecord) {
    setEditId(r.id);
    setNo(String(r.no));
    setDate(r.date || localDate());
    setDesc(r.desc ?? '');
    setError('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function remove(r: ResolvedRecord) {
    if (!window.confirm('Çözüm kaydını sil?')) return;
    try {
      await deleteDoc(doc(db, 'resolvedRecords', r.id));
    } catch (e) {
      alert('Silme hatası: ' + (e as Error).message);
    }
  }

  return (
    <div>
      <div className="page-hdr">
        <h2>
          Çözülen <em>Talepler</em>
        </h2>
        <p>
          {admin
            ? 'Tüm kullanıcıların çözüm kayıtlarını görüntülüyorsunuz'
            : 'Çözdüğünüz talepleri buradan kayıt altına alın'}
        </p>
      </div>

      {canCreate(role) && (
        <div className="x-panel x-form">
          <h3>{editId ? 'Çözüm Kaydını Düzenle' : 'Çözüm Kaydı'}</h3><span className="x-sub">İlgili talebin çözüm bilgilerini girin</span><div className="x-div"><span>bilgiler</span></div>
          <label>Talep No</label>
          <input value={no} onChange={(e) => setNo(e.target.value)} placeholder="İlgili talep numarası" />
          <label>Tarih</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <label>Çözüm Açıklaması</label>
          <textarea
            rows={5}
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            placeholder="Talebin nasıl çözüldüğünü yazın..."
          />
          {error && <div className="x-err">{error}</div>}
          <button className="x-btn" type="button" disabled={busy} onClick={save}>
            {busy ? 'Kaydediliyor...' : editId ? 'Değişiklikleri Kaydet →' : 'Çözümü Kaydet →'}
          </button>
          {editId && (
            <button className="x-btn-ghost" type="button" onClick={resetForm}>
              Düzenlemeyi İptal Et
            </button>
          )}
        </div>
      )}

      <div className="x-panel">
        <div className="x-quick">
          {(
            [
              ['today', 'Bugün'],
              ['week', 'Son 1 Hafta'],
              ['month', 'Son 1 Ay'],
              ['all', 'Tüm Zamanlar'],
            ] as const
          ).map(([k, t]) => (
            <button key={k} type="button" className={quick === k ? 'on' : ''} onClick={() => setQuickFilter(k)}>
              {t}
            </button>
          ))}
          <span className="x-count">{rows.length} kayıt</span>
        </div>
        <div className="x-filters">
          <div>
            <label>Arama</label>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Talep no veya açıklama..." />
          </div>
          <div>
            <label>Oluşturan</label>
            <select value={fUser} onChange={(e) => setFUser(e.target.value)}>
              <option value="">Tüm Kullanıcılar</option>
              {users.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label>Başlangıç</label>
            <input
              type="date"
              value={start}
              onChange={(e) => {
                setStart(e.target.value);
                setQuick('custom');
              }}
            />
          </div>
          <div>
            <label>Bitiş</label>
            <input
              type="date"
              value={end}
              onChange={(e) => {
                setEnd(e.target.value);
                setQuick('custom');
              }}
            />
          </div>
        </div>
      </div>

      <div className="x-table-wrap">
        <table className="x-table">
          <thead>
            <tr>
              <th>No</th>
              <th>Tarih</th>
              <th>Çözüm Açıklaması</th>
              <th>Kaydeden</th>
              <th style={{ textAlign: 'right' }}>İşlem</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={5}>
                  <div className="x-empty">Henüz çözülen talep kaydı yok.</div>
                </td>
              </tr>
            )}
            {rows.map((r) => {
              const can = admin || r.user === me;
              return (
                <tr key={r.id}>
                  <td>
                    <span className="x-no">#{r.no}</span>
                  </td>
                  <td>{r.date}</td>
                  <td>
                    <div className="x-desc">{r.desc}</div>
                  </td>
                  <td>{r.user}</td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {can && (
                      <>
                        <button className="x-act" type="button" onClick={() => startEdit(r)}>
                          ✏ Düzenle
                        </button>
                        <button className="x-del" type="button" onClick={() => remove(r)}>
                          🗑 Sil
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}