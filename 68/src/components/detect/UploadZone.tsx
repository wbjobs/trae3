import { useRef, useState } from 'react';
import { Upload } from 'lucide-react';

interface Props {
  onUpload: (files: File[]) => void;
  isUploading: boolean;
  uploadProgress: number;
}

export default function UploadZone({ onUpload, isUploading, uploadProgress }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleFiles = (files: FileList | null) => {
    if (!files) return;
    const imageFiles = Array.from(files).filter(f => f.type.startsWith('image/'));
    if (imageFiles.length > 0) onUpload(imageFiles);
  };

  return (
    <div
      className={`relative border-2 border-dashed rounded-xl p-8 text-center transition-all cursor-pointer
        ${isDragging ? 'border-thermal-orange bg-thermal-orange/10' : 'border-dark-600 hover:border-dark-500'}
        ${isUploading ? 'pointer-events-none' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(e) => { e.preventDefault(); setIsDragging(false); handleFiles(e.dataTransfer.files); }}
      onClick={() => inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        accept="image/*"
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
      <Upload className={`w-10 h-10 mx-auto mb-3 ${isDragging ? 'text-thermal-orange' : 'text-neutral-500'}`} />
      <p className="text-neutral-300 mb-1">拖拽图片到此处或点击上传</p>
      <p className="text-xs text-neutral-500">支持 JPG, PNG, TIFF 格式</p>
      {isUploading && (
        <div className="mt-4">
          <div className="w-full h-2 bg-dark-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-thermal-gradient rounded-full transition-all duration-300"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
          <p className="text-sm text-neutral-400 mt-2 font-mono">{uploadProgress}%</p>
        </div>
      )}
    </div>
  );
}
