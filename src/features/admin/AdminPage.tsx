import { appAlert, appConfirm } from '../../lib/dialog';
import { useState } from 'react';
import { deleteApp, initializeApp } from 'firebase/app';
import { createUserWithEmailAndPassword, getAuth, signOut } from 'firebase/auth';
import { addDoc, collection, deleteDoc, doc, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../../context/auth-context';
import { useCollection } from '../../hooks/useCollection';
import { localDate } from '../../lib/localdate';
import type { Department } from '../../lib/types';
import type { Assignment, Personnel, UserDoc } from '../../lib/models';

interface Notice {
  ok: boolean;
  text: string;
}

function userErr(code: string, fallback: string): string {
  switch (code) {
    case 'auth/email-already-in-use':
      return 'Bu e-posta ile zaten bir hesap var.';
    case 'auth/weak-password':
      return 'Şifre en az 6 karakter olmalı.';
    case 'auth/invalid-email':
      return 'Geçerli bir e-posta giriniz.';
    default:
      return fallback;
  }
}

function SimpleList({
  title,
  icon,
  placeholder,
  items,
  onAdd,
  onDelete,
}: {
  title: string;
  icon: string;
  placeholder: string;
  items: { id: string; name: string }[];
  onAdd: (name: string) => Promise<string | null>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [val, setVal] = useState('');
  const [msg, setMsg] = useState<Notice | null>(null);

  async function add() {
    const n = val.trim();
    if (!n) return setMsg({ ok: false, text: 'Ad boş olamaz.' });
    const err = await onAdd(n);
    if (err) return setMsg({ ok: false, text: err });
    setVal('');
    setMsg({ ok: true, text: `${n} eklendi.` });
  }

  return (
    <div className="x-panel">
      <h3>
        {icon} {title}
      </h3>
      <div className="x-add">
        <input
          value={val}
          placeholder={placeholder}
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
        />
        <button className="x-btn x-btn-inline" type="button" onClick={add}>
          + Ekle
        </button>
      </div>
      {msg && <div className={msg.ok ? 'x-ok' : 'x-err'}>{msg.text}</div>}
      <ul className="x-list">
        {items.length === 0 && <li style={{ justifyContent: 'center', color: 'var(--t3)' }}>Kayıt yok.</li>}
        {items.map((it) => (
          <li key={it.id}>
            <span>{it.name}</span>
            <button
              className="x-del"
              type="button"
              onClick={async () => await appConfirm(`"${it.name}" silinsin mi?`) && onDelete(it.id)}
            >
              ✖
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function AdminPage() {
  const { user } = useAuth();
  const depts = useCollection<Department>('departments').data;
  const people = useCollection<Personnel>('personnel').data;
  const assigns = useCollection<Assignment>('distAssignments').data;
  const users = useCollection<UserDoc>('users').data;

  const [aDate, setADate] = useState(localDate());
  const [aPerson, setAPerson] = useState('');
  const [aMsg, setAMsg] = useState<Notice | null>(null);

  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [role, setRole] = useState('gözlemci');
  const [uMsg, setUMsg] = useState<Notice | null>(null);
  const [uBusy, setUBusy] = useState(false);

  const sortedAssigns = [...assigns].sort((a, b) => a.date.localeCompare(b.date));

  async function addAssign() {
    if (!aDate || !aPerson) return setAMsg({ ok: false, text: 'Tarih ve personel seçiniz.' });
    try {
      await addDoc(collection(db, 'distAssignments'), { date: aDate, personName: aPerson });
      setAMsg(null);
    } catch (e) {
      setAMsg({ ok: false, text: 'Hata: ' + (e as Error).message });
    }
  }

  async function createUser() {
    const e = email.trim();
    if (!e || !pass) return setUMsg({ ok: false, text: 'E-posta ve şifre zorunludur.' });
    setUBusy(true);
    setUMsg(null);
    const secondary = initializeApp(
      {
        apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
        authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
        projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
        storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
      },
      'secondary-' + Date.now(),
    );
    try {
      const sAuth = getAuth(secondary);
      const res = await createUserWithEmailAndPassword(sAuth, e, pass);
      await setDoc(doc(db, 'users', res.user.uid), { email: e, role });
      await signOut(sAuth);
      setEmail('');
      setPass('');
      setRole('gözlemci');
      setUMsg({ ok: true, text: `Kullanıcı oluşturuldu: ${e} · ${role}` });
    } catch (err) {
      const code = (err as { code?: string }).code || '';
      setUMsg({ ok: false, text: userErr(code, 'Hata: ' + (err as Error).message) });
    } finally {
      await deleteApp(secondary);
      setUBusy(false);
    }
  }

  async function changeRole(u: UserDoc, r: string) {
    try {
      await updateDoc(doc(db, 'users', u.id), { role: r });
    } catch (e) {
      appAlert('Yetki güncellenemedi: ' + (e as Error).message);
    }
  }

  async function removeUser(u: UserDoc) {
    if (!await appConfirm(`${u.email} kullanıcısı silinsin mi?`)) return;
    try {
      await deleteDoc(doc(db, 'users', u.id));
    } catch (e) {
      appAlert('Silme hatası: ' + (e as Error).message);
    }
  }

  return (
    <div>
      <div className="page-hdr">
        <h2>
          Sistem <em>Yönetimi</em>
        </h2>
        <p>Departman · Kullanıcı · Yetki · Dağıtım Takvimi</p>
      </div>

      <div className="x-admin">
        <SimpleList
          title="Departmanlar"
          icon="🏢"
          placeholder="Yeni departman adı"
          items={depts}
          onAdd={async (name) => {
            if (depts.some((d) => d.name.toLowerCase() === name.toLowerCase())) return 'Bu departman zaten var.';
            await addDoc(collection(db, 'departments'), { name });
            return null;
          }}
          onDelete={(id) => deleteDoc(doc(db, 'departments', id))}
        />

        <div className="x-panel">
          <h3>👤 Kullanıcı Tanımla</h3>
          <label>E-posta</label>
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ornek@firma.com" />
          <label>Şifre</label>
          <input type="password" value={pass} onChange={(e) => setPass(e.target.value)} placeholder="En az 6 karakter" />
          <label>Yetki Seviyesi</label>
          <select value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="gözlemci">Gözlemci</option>
            <option value="standart">Standart</option>
            <option value="admin">Admin</option>
          </select>
          {uMsg && <div className={uMsg.ok ? 'x-ok' : 'x-err'}>{uMsg.text}</div>}
          <button className="x-btn" type="button" disabled={uBusy} onClick={createUser}>
            {uBusy ? 'Oluşturuluyor...' : 'Kullanıcı Oluştur →'}
          </button>
        </div>

        <SimpleList
          title="Personel Listesi"
          icon="👥"
          placeholder="Personel adı soyadı"
          items={people}
          onAdd={async (name) => {
            if (people.some((p) => p.name.toLowerCase() === name.toLowerCase())) return 'Bu isim zaten listede.';
            await addDoc(collection(db, 'personnel'), { name, createdAt: new Date().toISOString() });
            return null;
          }}
          onDelete={(id) => deleteDoc(doc(db, 'personnel', id))}
        />

        <div className="x-panel">
          <h3>📋 Dağıtım Takvimi Ata</h3>
          <div className="x-add" style={{ alignItems: 'flex-end' }}>
            <div style={{ flex: 1 }}>
              <label style={{ marginTop: 0 }}>Tarih</label>
              <input type="date" value={aDate} onChange={(e) => setADate(e.target.value)} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ marginTop: 0 }}>Personel</label>
              <select value={aPerson} onChange={(e) => setAPerson(e.target.value)}>
                <option value="">— Seç —</option>
                {people.map((p) => (
                  <option key={p.id} value={p.name}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <button className="x-btn x-btn-inline" type="button" onClick={addAssign}>
              Ata
            </button>
          </div>
          {aMsg && <div className={aMsg.ok ? 'x-ok' : 'x-err'}>{aMsg.text}</div>}
          <ul className="x-list">
            {sortedAssigns.length === 0 && <li style={{ justifyContent: 'center', color: 'var(--t3)' }}>Henüz atama yok.</li>}
            {sortedAssigns.map((a) => (
              <li key={a.id}>
                <span className="x-chip">{a.date}</span>
                <span style={{ flex: 1, margin: '0 10px' }}>{a.personName}</span>
                <button className="x-del" type="button" onClick={() => deleteDoc(doc(db, 'distAssignments', a.id))}>
                  ✖
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="x-panel x-full">
          <h3>⚙ Kullanıcı Yönetimi</h3>
          <div className="x-table-wrap" style={{ border: 'none' }}>
            <table className="x-table">
              <thead>
                <tr>
                  <th>E-posta</th>
                  <th>Rol</th>
                  <th style={{ textAlign: 'right' }}>İşlem</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const self = u.id === user?.uid;
                  return (
                    <tr key={u.id}>
                      <td>{u.email}</td>
                      <td>
                        <select
                          value={u.role}
                          disabled={self}
                          onChange={(e) => changeRole(u, e.target.value)}
                          style={{ maxWidth: 160 }}
                        >
                          <option value="gözlemci">Gözlemci</option>
                          <option value="standart">Standart</option>
                          <option value="admin">Admin</option>
                        </select>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        {self ? (
                          <span className="x-note">kendi hesabınız</span>
                        ) : (
                          <button className="x-del" type="button" onClick={() => removeUser(u)}>
                            🗑 Sil
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="x-note">
            Not: Kullanıcı silmek yalnızca yetki kaydını kaldırır; giriş hesabı Firebase Authentication'da durur.
          </div>
        </div>
      </div>
    </div>
  );
}