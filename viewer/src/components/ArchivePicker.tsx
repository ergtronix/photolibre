import { open } from "@tauri-apps/plugin-dialog";

import { setArchivePath } from "../lib/api";

interface ArchivePickerProps {
  onSelected: (path: string) => void;
}

export function ArchivePicker({ onSelected }: ArchivePickerProps) {
  const handleClick = async () => {
    const selected = await open({ directory: true, multiple: false });
    if (typeof selected !== "string") {
      return;
    }
    await setArchivePath(selected);
    onSelected(selected);
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
