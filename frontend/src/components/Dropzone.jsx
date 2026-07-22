import { useRef, useState } from 'react';

export default function Dropzone({ accept, label, hint, disabled, multiple, onFile, onFiles }) {
  const inputRef = useRef(null);
  const [arrastrando, setArrastrando] = useState(false);

  function elegirArchivos(fileList) {
    if (!fileList || fileList.length === 0 || disabled) return;
    if (multiple && onFiles) onFiles([...fileList]);
    else onFile?.(fileList[0]);
  }

  return (
    <div
      className={`dropzone ${arrastrando ? 'arrastrando' : ''} ${disabled ? 'disabled' : ''}`}
      onDragOver={(e) => { e.preventDefault(); if (!disabled) setArrastrando(true); }}
      onDragLeave={() => setArrastrando(false)}
      onDrop={(e) => {
        e.preventDefault();
        setArrastrando(false);
        elegirArchivos(e.dataTransfer.files);
      }}
      onClick={() => !disabled && inputRef.current?.click()}
      role="button"
      tabIndex={0}
    >
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d="M12 3v12m0-12 4 4m-4-4-4 4" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <div className="dropzone-label">{label}</div>
      {hint && <div className="dropzone-hint">{hint}</div>}
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        disabled={disabled}
        onChange={(e) => { elegirArchivos(e.target.files); e.target.value = ''; }}
      />
    </div>
  );
}
