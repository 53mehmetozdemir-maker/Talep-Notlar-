import { fileEmoji, isHttpUrl, isImage } from '../../lib/files';
import type { TalepRecord } from '../../lib/types';
import { Modal } from './Modal';

interface Props {
  record: TalepRecord;
  onClose: () => void;
}

export function FileModal({ record, onClose }: Props) {
  const files = record.files ?? [];

  return (
    <Modal variant="file" onClose={onClose}>
      <div className="file-modal-inner">
        <h3>Eklenen Dosyalar</h3>
        <span className="file-modal-sub">
          Talep #{record.no} · {files.length} dosya
        </span>
        <div className="file-grid">
          {files.map((f) => {
            const safe = isHttpUrl(f.url);
            return (
              <a
                key={f.url}
                className="file-grid-item"
                href={safe ? f.url : undefined}
                target="_blank"
                rel="noopener noreferrer"
              >
                {safe && isImage(f.name) ? (
                  <img src={f.url} alt={f.name} loading="lazy" />
                ) : (
                  <div className="file-grid-icon">{fileEmoji(f.name)}</div>
                )}
                <span className="file-grid-name">{f.name}</span>
              </a>
            );
          })}
        </div>
        <button type="button" className="btn-cancel" style={{ marginTop: 20 }} onClick={onClose}>
          Kapat
        </button>
      </div>
    </Modal>
  );
}
