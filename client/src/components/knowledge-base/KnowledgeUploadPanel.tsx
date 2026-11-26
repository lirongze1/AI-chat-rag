import { useState, type DragEvent, type RefObject } from "react";
import MaterialIcon from "../common/MaterialIcon";

type KnowledgeUploadPanelProps = {
  fileInputRef: RefObject<HTMLInputElement>;
  isUploading: boolean;
  uploadMessage: string;
  uploadProgress: number;
  uploadPhase: string;
  onFilesSelected: (files: FileList | null) => void | Promise<void>;
  onOpenFilePicker: () => void;
};

const KnowledgeUploadPanel = ({
  fileInputRef,
  isUploading,
  uploadMessage,
  uploadProgress,
  uploadPhase,
  onFilesSelected,
  onOpenFilePicker,
}: KnowledgeUploadPanelProps) => {
  const [isDragging, setIsDragging] = useState(false);

  function stopEvent(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
  }

  function handleDragEnter(event: DragEvent<HTMLDivElement>) {
    stopEvent(event);
    setIsDragging(true);
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    stopEvent(event);
    event.dataTransfer.dropEffect = "copy";
    setIsDragging(true);
  }

  function handleDragLeave(event: DragEvent<HTMLDivElement>) {
    stopEvent(event);
    // 仅当指针真正离开面板（而非进入子元素）时取消高亮。
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setIsDragging(false);
    }
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    stopEvent(event);
    setIsDragging(false);
    if (isUploading || event.dataTransfer.files.length === 0) {
      return;
    }
    void onFilesSelected(event.dataTransfer.files);
  }

  return (
    <div
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`group flex flex-col items-center justify-center rounded-2xl border p-7 transition-all md:p-8 ${
        isDragging
          ? "border-black bg-slate-100/80 ring-2 ring-black/10"
          : "cursor-pointer border-slate-100 bg-slate-50/50 hover:border-slate-200"
      }`}
    >
      <div className={`mb-3 transition-colors ${isDragging ? "text-black" : "text-slate-400 group-hover:text-black"}`}>
        <MaterialIcon name="cloud_upload" className="!text-3xl" />
      </div>
      <h3 className="font-headline mb-1 text-lg font-semibold text-black">Upload Assets</h3>
      <p className="mb-4 text-sm text-slate-400">
        {isDragging ? "松开鼠标即可上传" : "Drag and drop PDF, DOCX, or TXT files"}
      </p>
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        multiple
        onChange={(event) => {
          void onFilesSelected(event.target.files);
          event.currentTarget.value = "";
        }}
      />
      <button
        type="button"
        className="rounded-lg bg-black px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={isUploading}
        onClick={onOpenFilePicker}
      >
        Select Files
      </button>

      {uploadPhase ? (
        <div className="mt-3 w-full max-w-md">
          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-full rounded-full bg-black transition-all"
              style={{ width: `${Math.max(0, Math.min(100, uploadProgress))}%` }}
            />
          </div>
          <p className="mt-1.5 text-center text-xs text-slate-500">{`${uploadPhase}: ${uploadProgress}%`}</p>
        </div>
      ) : null}

      {uploadMessage ? <p className="mt-2 text-xs text-slate-500">{uploadMessage}</p> : null}
    </div>
  );
};

export default KnowledgeUploadPanel;
