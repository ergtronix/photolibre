import { pickAndSetArchivePath } from "../lib/api";

interface ArchivePickerProps {
  onSelected: (path: string) => void;
}

export function ArchivePicker({ onSelected }: ArchivePickerProps) {
  const handleClick = async () => {
    const selected = await pickAndSetArchivePath();
    if (selected) {
      onSelected(selected);
    }
  };

  return (
    <div className="archive-picker">
      <p>写真アーカイブ（archive.dbを含むフォルダ）を選択してください。</p>
      <button type="button" onClick={handleClick}>
        フォルダを選択
      </button>
    </div>
  );
}
