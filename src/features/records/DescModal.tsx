import type { TalepRecord } from '../../lib/types';
import { Modal } from './Modal';

interface Props {
  record: TalepRecord;
  onClose: () => void;
}

export function DescModal({ record, onClose }: Props) {
  return (
    <Modal variant="desc" onClose={onClose}>
      <div className="desc-modal-inner">
        <button type="button" className="desc-modal-close" onClick={onClose}>
          ✕
        </button>
        <div className="desc-modal-badge">#{record.no}</div>
        <div className="desc-modal-meta">
          <span>{record.date}</span>
          <span>{record.time ?? ''}</span>
          <span>{record.dept || '—'}</span>
          <span style={{ color: 'var(--t2)' }}>{record.user ?? ''}</span>
        </div>
        <div className="desc-modal-body">{record.desc ?? ''}</div>
        <button type="button" className="btn-cancel" style={{ marginTop: 20, flexShrink: 0 }} onClick={onClose}>
          Kapat
        </button>
      </div>
    </Modal>
  );
}
