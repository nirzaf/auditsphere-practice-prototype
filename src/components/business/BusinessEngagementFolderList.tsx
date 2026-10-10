import type { BusinessEngagementFolder } from '../../shared/api/business';

export function BusinessEngagementFolderList({ folders }: { folders: BusinessEngagementFolder[] }) {
  return <ol className="business-folder-list" aria-label="Engagement folders">
    {folders.map(folder => <li key={folder.id}>
      <strong>{folder.ordinal.toString().padStart(2, '0')} · {folder.displayName}</strong>
      <span>{folder.fileCount} committed {folder.fileCount === 1 ? 'file' : 'files'}{folder.readOnly ? ' · Read-only; release workflow only' : ''}</span>
      <small>Upload rule: {folder.uploadRule}</small>
    </li>)}
  </ol>;
}
