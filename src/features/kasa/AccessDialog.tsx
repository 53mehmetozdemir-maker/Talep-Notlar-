import { Modal } from '../records/Modal';
import type { AccessUser } from './api';

interface Props {
  users: AccessUser[] | null;
  myUid: string;
  busyUid: string | null;
  onApprove: (u: AccessUser) => void;
  onRevoke: (u: AccessUser) => void;
  onRecoveryKey: () => void;
  onClose: () => void;
}

export function AccessDialog({ users, myUid, busyUid, onApprove, onRevoke, onRecoveryKey, onClose }: Props) {
  const list = [...(users ?? [])].sort(
    (a, b) => Number(a.approved) - Number(b.approved) || a.email.localeCompare(b.email, 'tr'),
  );

  return (
    <Modal onClose={onClose} variant="edit">
      <div className="ks-modal panel panel-clip">
        <h3>Erişim yönetimi</h3>
        <p className="ks-hint">
          KASA’ya girmek isteyen herkes ilk açışında anahtar oluşturur ve burada “Bekliyor” görünür. Onayladığında veri anahtarı o kişinin
          anahtarıyla sarılır. Birinin erişimini kaldırınca veri anahtarı yenilenir ve tüm notlar yeniden şifrelenir.
        </p>

        {!users ? (
          <div className="ks-hint">Yükleniyor…</div>
        ) : list.length === 0 ? (
          <div className="ks-hint">Henüz kimse yok.</div>
        ) : (
          <div className="ks-users">
            {list.map((u) => (
              <div key={u.uid} className="ks-user">
                <div>
                  <b>{u.email || u.uid}</b>
                  <span className={`ks-badge ${u.approved ? 'ok' : 'wait'}`}>
                    {u.uid === myUid ? 'Siz' : u.approved ? 'Onaylı' : 'Bekliyor'}
                  </span>
                </div>
                {u.uid !== myUid &&
                  (u.approved ? (
                    <button type="button" className="ks-btn ks-btn-del" disabled={busyUid !== null} onClick={() => onRevoke(u)}>
                      {busyUid === u.uid ? 'Kaldırılıyor…' : 'Erişimi kaldır'}
                    </button>
                  ) : (
                    <button type="button" className="ks-btn ks-btn-hi" disabled={busyUid !== null} onClick={() => onApprove(u)}>
                      {busyUid === u.uid ? 'Onaylanıyor…' : 'Onayla'}
                    </button>
                  ))}
              </div>
            ))}
          </div>
        )}

        <div className="ks-recovery">
          <b>Kurtarma anahtarı</b>
          <p className="ks-hint">
            Tüm yöneticiler giriş şifresini unutursa notlara kimse ulaşamaz. Bunun için kurtarma dosyasını indirip güvenli bir yerde (şifre yöneticisi,
            kilitli bir dolap) sakla. Dosyayı eline geçiren herkes notları açabilir, bu yüzden kimseyle paylaşma. Anahtar yenilenirse dosya geçersiz olur,
            yeniden indir. En az iki yöneticiyi onaylamak da bu riski azaltır.
          </p>
          <button type="button" className="ks-btn" onClick={onRecoveryKey}>
            Kurtarma anahtarını indir
          </button>
        </div>

        <div className="ks-modal-actions">
          <button type="button" className="btn-cancel" onClick={onClose}>
            Kapat
          </button>
        </div>
      </div>
    </Modal>
  );
}
