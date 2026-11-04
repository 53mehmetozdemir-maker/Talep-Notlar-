import { useState } from 'react';
import { fileEmoji, fmtSize, isImage } from '../lib/files';

export interface PendingFile {
  file: File;
  previewUrl: string | null;
}

interface Props {
  files: PendingFile[];
  onChange: (files: PendingFile[]) => void;
  onError: (message: string) => void;
  disabled?: boolean;
}

const MAX_BYTES = 10 * 1024 * 1024;

function readPreview(file: File): Promise<PendingFile> {
  if (!isImage(file.name)) return Promise.resolve({ file, previewUrl: null });
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ file, previewUrl: typeof reader.result === 'string' ? reader.result : null });
    reader.onerror = () => resolve({ file, previewUrl: null });
    reader.readAsDataURL(file);
  });
}

export function FilePicker({ files, onChange, onError, disabled }: Props) {
  const [dragging, setDragging] = useState(false);

  async function addFiles(picked: File[]) {
    const accepted: File[] = [];
    for (const f of picked) {
      if (f.size > MAX_BYTES) onError(`${f.name} 10MB'dan büyük!`);
      else accepted.push(f);
    }
    if (!accepted.length) return;
    const added = await Promise.all(accepted.map(readPreview));
    onChange([...files, ...added]);
  }

  return (
    <>
      <div
        className={`upload-area${dragging ? ' dragging' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (!disabled) void addFiles(Array.from(e.dataTransfer.files));
        }}
      >
        <input
          type="file"
          multiple
          accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
          disabled={disabled}
          onChange={(e) => {
            const picked = Array.from(e.target.files ?? []);
            e.target.value = '';
            void addFiles(picked);
          }}
        />
        <span className="upload-icon">📎</span>
        <div className="upload-label">
          Dosyaları buraya sürükle veya <span>seçmek için tıkla</span>
        </div>
        <div className="upload-hint">Görsel, PDF, Word, Excel · Maks 10MB/dosya</div>
      </div>
      <div className="file-preview-list">
        {files.map((pf, i) => (
          <div className="file-preview-item" key={`${pf.file.name}-${i}`}>
            {pf.previewUrl ? (
              <img className="file-thumb" src={pf.previewUrl} alt="" />
            ) : (
              <div className="file-icon">{fileEmoji(pf.file.name)}</div>
            )}
            <span className="file-name">{pf.file.name}</span>
            <span className="file-size">{fmtSize(pf.file.size)}</span>
            <button
              type="button"
              className="file-remove"
              disabled={disabled}
              onClick={() => onChange(files.filter((_, idx) => idx !== i))}
            >
              ✖
            </button>
          </div>
        ))}
      </div>
    </>
  );
}
