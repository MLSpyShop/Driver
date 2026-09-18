/**
 * Google Drive HTML Folder Exporter
 * Generates SEO-optimized, Blogger-compatible, fully clickable & embeddable HTML directories.
 */

export interface DriveFileItem {
  id: string;
  name: string;
  mimeType: string;
  parents?: string[];
  size?: string | number;
  createdTime?: string;
  modifiedTime?: string;
  webViewLink?: string;
  webContentLink?: string;
  iconLink?: string;
  thumbnailLink?: string;
  description?: string;
  children?: DriveFileItem[];
}

export interface ExportOptions {
  title?: string;
  description?: string;
  includeEmbeds?: boolean;
  includeSearch?: boolean;
  authorEmail?: string;
  includeSchema?: boolean;
  siteUrl?: string;
  selectedFolderId?: string;
  selectedFolderName?: string;
}

export interface FolderMeta {
  id: string;
  name: string;
  path: string;
  parentId?: string;
  itemCount: number;
  fileCount: number;
  totalBytes: number;
  depth: number;
}

const escapeHtml = (str: string): string => {
  return (str || '').replace(/[&<>'"]/g, 
    tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
  );
};

const formatBytes = (bytes: number): string => {
  if (!bytes || bytes === 0) return '';
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
};

const getFileIconAndBadge = (mimeType: string) => {
  if (mimeType === 'application/vnd.google-apps.folder') {
    return { icon: '📁', label: 'Folder', color: '#2563eb', bg: '#eff6ff' };
  }
  if (mimeType.includes('document') || mimeType.includes('word') || mimeType.includes('text/plain')) {
    return { icon: '📝', label: 'Doc', color: '#2563eb', bg: '#eff6ff' };
  }
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel') || mimeType.includes('csv')) {
    return { icon: '📊', label: 'Sheet', color: '#16a34a', bg: '#f0fdf4' };
  }
  if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) {
    return { icon: '📽️', label: 'Slides', color: '#ea580c', bg: '#fff7ed' };
  }
  if (mimeType.includes('pdf')) {
    return { icon: '📕', label: 'PDF', color: '#dc2626', bg: '#fef2f2' };
  }
  if (mimeType.includes('image/')) {
    return { icon: '🖼️', label: 'Image', color: '#9333ea', bg: '#faf5ff' };
  }
  if (mimeType.includes('video/')) {
    return { icon: '🎬', label: 'Video', color: '#0891b2', bg: '#ecfeff' };
  }
  if (mimeType.includes('audio/')) {
    return { icon: '🎵', label: 'Audio', color: '#d97706', bg: '#fffbeb' };
  }
  if (mimeType.includes('zip') || mimeType.includes('compressed') || mimeType.includes('tar') || mimeType.includes('rar')) {
    return { icon: '📦', label: 'Archive', color: '#4b5563', bg: '#f3f4f6' };
  }
  return { icon: '📄', label: 'File', color: '#4b5563', bg: '#f3f4f6' };
};

export const getEmbedUrl = (file: DriveFileItem): string | null => {
  const { id, mimeType } = file;
  if (!id || mimeType === 'application/vnd.google-apps.folder') return null;

  if (mimeType === 'application/vnd.google-apps.document') {
    return `https://docs.google.com/document/d/${id}/preview`;
  }
  if (mimeType === 'application/vnd.google-apps.spreadsheet') {
    return `https://docs.google.com/spreadsheets/d/${id}/preview?widget=true&headers=false`;
  }
  if (mimeType === 'application/vnd.google-apps.presentation') {
    return `https://docs.google.com/presentation/d/${id}/embed?start=false&loop=false&delayms=3000`;
  }
  if (mimeType === 'application/vnd.google-apps.form') {
    return `https://docs.google.com/forms/d/${id}/viewform?embedded=true`;
  }
  // Generic Google Drive file preview (works for PDFs, Videos, Images, audio, text)
  return `https://drive.google.com/file/d/${id}/preview`;
};

/**
 * Returns formatted HTML iframe embed code snippet for a file
 */
export const getFileEmbedCode = (file: DriveFileItem, options: { width?: string; height?: string; responsive?: boolean } = {}): string => {
  const embedUrl = getEmbedUrl(file);
  if (!embedUrl) return '';

  const height = options.height || '480px';
  const width = options.width || '100%';
  const safeName = (file.name || 'Google Drive Document').replace(/"/g, '&quot;');

  if (options.responsive) {
    return `<div style="position:relative;width:100%;height:${height};max-width:100%;margin:12px 0;border-radius:8px;overflow:hidden;border:1px solid #e2e8f0;box-shadow:0 1px 3px rgba(0,0,0,0.05);">
  <iframe src="${embedUrl}" style="position:absolute;top:0;left:0;width:100%;height:100%;border:0;" allowfullscreen="true" loading="lazy" title="${safeName}"></iframe>
</div>`;
  }

  return `<iframe src="${embedUrl}" width="${width}" height="${height}" frameborder="0" allowfullscreen="true" loading="lazy" style="border:1px solid #e2e8f0;border-radius:8px;" title="${safeName}"></iframe>`;
};

/**
 * Builds the hierarchical folder tree
 */
export const buildFileHierarchy = (allFiles: DriveFileItem[]) => {
  const itemMap = new Map<string, DriveFileItem>();
  const rootItems: DriveFileItem[] = [];

  allFiles.forEach(file => {
    itemMap.set(file.id, { ...file, children: [] });
  });

  allFiles.forEach(file => {
    const item = itemMap.get(file.id)!;
    const parents = file.parents || [];
    if (parents.length === 0) {
      rootItems.push(item);
    } else {
      let addedToParent = false;
      for (const parentId of parents) {
        if (itemMap.has(parentId)) {
          itemMap.get(parentId)!.children!.push(item);
          addedToParent = true;
          break;
        }
      }
      if (!addedToParent) {
        rootItems.push(item);
      }
    }
  });

  return { rootItems, allItemsCount: allFiles.length };
};

/**
 * Extracts and organizes all folders from Drive files with calculated paths, depths, and statistics.
 */
export const getDriveFolders = (allFiles: DriveFileItem[]): FolderMeta[] => {
  const folderItems = allFiles.filter(f => f.mimeType === 'application/vnd.google-apps.folder');
  const folderMap = new Map<string, DriveFileItem>();
  folderItems.forEach(f => folderMap.set(f.id, f));

  // Build parent-to-children mapping
  const childrenMap = new Map<string, DriveFileItem[]>();
  allFiles.forEach(file => {
    const parents = file.parents || [];
    parents.forEach(pId => {
      if (!childrenMap.has(pId)) {
        childrenMap.set(pId, []);
      }
      childrenMap.get(pId)!.push(file);
    });
  });

  // Calculate recursive stats for a folder
  const calculateFolderStats = (folderId: string, visited = new Set<string>()): { itemCount: number; fileCount: number; totalBytes: number } => {
    if (visited.has(folderId)) return { itemCount: 0, fileCount: 0, totalBytes: 0 };
    visited.add(folderId);

    const directChildren = childrenMap.get(folderId) || [];
    let itemCount = directChildren.length;
    let fileCount = 0;
    let totalBytes = 0;

    for (const child of directChildren) {
      if (child.mimeType === 'application/vnd.google-apps.folder') {
        const subStats = calculateFolderStats(child.id, visited);
        itemCount += subStats.itemCount;
        fileCount += subStats.fileCount;
        totalBytes += subStats.totalBytes;
      } else {
        fileCount += 1;
        totalBytes += Number(child.size) || 0;
      }
    }

    return { itemCount, fileCount, totalBytes };
  };

  // Calculate path and depth
  const getFolderPath = (folder: DriveFileItem, visited = new Set<string>()): { path: string; depth: number } => {
    if (visited.has(folder.id)) return { path: folder.name, depth: 0 };
    visited.add(folder.id);

    const parents = folder.parents || [];
    for (const parentId of parents) {
      if (folderMap.has(parentId)) {
        const parent = folderMap.get(parentId)!;
        const parentInfo = getFolderPath(parent, visited);
        return {
          path: `${parentInfo.path} / ${folder.name}`,
          depth: parentInfo.depth + 1
        };
      }
    }
    return { path: folder.name, depth: 0 };
  };

  const results: FolderMeta[] = folderItems.map(folder => {
    const { path, depth } = getFolderPath(folder);
    const stats = calculateFolderStats(folder.id);
    return {
      id: folder.id,
      name: folder.name,
      path,
      parentId: folder.parents?.[0],
      itemCount: stats.itemCount,
      fileCount: stats.fileCount,
      totalBytes: stats.totalBytes,
      depth
    };
  });

  // Sort alphabetically by path
  results.sort((a, b) => a.path.localeCompare(b.path));
  return results;
};

/**
 * Filters the list of files to only those inside a selected folder (and its descendant subfolders)
 */
export const filterFilesByFolder = (
  allFiles: DriveFileItem[], 
  selectedFolderId?: string | null
): { filteredFiles: DriveFileItem[]; selectedFolder: DriveFileItem | null } => {
  if (!selectedFolderId || selectedFolderId === 'all' || selectedFolderId === 'root') {
    return { filteredFiles: allFiles, selectedFolder: null };
  }

  const selectedFolder = allFiles.find(f => f.id === selectedFolderId) || null;
  if (!selectedFolder) {
    return { filteredFiles: allFiles, selectedFolder: null };
  }

  // Find all children recursively
  const childrenMap = new Map<string, string[]>();
  allFiles.forEach(f => {
    const parents = f.parents || [];
    parents.forEach(pId => {
      if (!childrenMap.has(pId)) {
        childrenMap.set(pId, []);
      }
      childrenMap.get(pId)!.push(f.id);
    });
  });

  const descendantIds = new Set<string>();
  descendantIds.add(selectedFolderId);

  const queue = [selectedFolderId];
  while (queue.length > 0) {
    const currentId = queue.shift()!;
    const directChildren = childrenMap.get(currentId) || [];
    for (const childId of directChildren) {
      if (!descendantIds.has(childId)) {
        descendantIds.add(childId);
        queue.push(childId);
      }
    }
  }

  const filteredFiles = allFiles.filter(f => descendantIds.has(f.id));
  return { filteredFiles, selectedFolder };
};

/**
 * Generates JSON-LD Structured Data Schema for Search Engines (SEO)
 */
const generateJsonLdSchema = (allFiles: DriveFileItem[], title: string, description: string) => {
  const filesList = allFiles.filter(f => f.mimeType !== 'application/vnd.google-apps.folder').slice(0, 100);
  
  const schema = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "name": title,
    "description": description,
    "mainEntity": {
      "@type": "ItemList",
      "name": "Google Drive Resource Directory",
      "numberOfItems": filesList.length,
      "itemListElement": filesList.map((file, idx) => ({
        "@type": "ListItem",
        "position": idx + 1,
        "item": {
          "@type": file.mimeType.startsWith('image/') ? 'ImageObject' : 
                  file.mimeType.startsWith('video/') ? 'VideoObject' : 'DigitalDocument',
          "name": file.name,
          "url": file.webViewLink || `https://drive.google.com/file/d/${file.id}/view`,
          "fileFormat": file.mimeType,
          "contentSize": file.size ? `${file.size} B` : undefined,
          "dateModified": file.modifiedTime || file.createdTime
        }
      }))
    }
  };

  return JSON.stringify(schema, null, 2);
};

/**
 * Generates strictly scoped, Blogger-compatible CSS styles
 * Prefixed with .driver-gdrive-export to prevent breaking Blogger's global layout/theme
 */
const getScopedCss = () => `
/* ==========================================================================
   DRIVER GOOGLE DRIVE EXPORT - BLOGGER COMPATIBLE & SEO OPTIMIZED STYLES
   All rules are strictly scoped to .driver-gdrive-export container.
   ========================================================================== */
.driver-gdrive-export {
  box-sizing: border-box;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen-Sans, Ubuntu, Cantarell, "Helvetica Neue", sans-serif;
  color: #1f2937;
  background: #ffffff;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 24px;
  margin: 20px 0;
  line-height: 1.5;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.04);
}

.driver-gdrive-export *,
.driver-gdrive-export *::before,
.driver-gdrive-export *::after {
  box-sizing: inherit;
}

.driver-gdrive-export header.driver-header {
  border-bottom: 2px solid #f3f4f6;
  padding-bottom: 16px;
  margin-bottom: 20px;
}

.driver-gdrive-export h2.driver-title {
  font-size: 22px;
  font-weight: 700;
  color: #111827;
  margin: 0 0 6px 0;
  letter-spacing: -0.01em;
}

.driver-gdrive-export p.driver-desc {
  font-size: 14px;
  color: #4b5563;
  margin: 0 0 12px 0;
}

.driver-gdrive-export .driver-meta-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  font-size: 12px;
  color: #6b7280;
}

.driver-gdrive-export .driver-search-box {
  width: 100%;
  margin-bottom: 18px;
  position: relative;
}

.driver-gdrive-export input.driver-search-input {
  width: 100%;
  padding: 10px 14px;
  font-size: 14px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  background-color: #f9fafb;
  color: #111827;
  outline: none;
  transition: all 0.2s ease;
}

.driver-gdrive-export input.driver-search-input:focus {
  border-color: #2563eb;
  background-color: #ffffff;
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
}

.driver-gdrive-export ul.driver-tree-list {
  list-style: none !important;
  margin: 0 !important;
  padding: 0 !important;
}

.driver-gdrive-export ul.driver-sub-tree {
  list-style: none !important;
  margin: 4px 0 6px 18px !important;
  padding: 0 0 0 12px !important;
  border-left: 2px dashed #e5e7eb;
}

.driver-gdrive-export li.driver-node {
  margin: 6px 0;
  padding: 0;
}

/* Folder Details Toggle */
.driver-gdrive-export details.driver-folder-details {
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #ffffff;
  margin-bottom: 8px;
  overflow: hidden;
}

.driver-gdrive-export summary.driver-folder-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  background: #f8fafc;
  cursor: pointer;
  font-weight: 600;
  font-size: 14px;
  color: #1e293b;
  user-select: none;
  transition: background 0.15s ease;
}

.driver-gdrive-export summary.driver-folder-summary:hover {
  background: #f1f5f9;
}

.driver-gdrive-export .driver-folder-title {
  display: flex;
  align-items: center;
  gap: 8px;
}

.driver-gdrive-export .driver-folder-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

/* File Card */
.driver-gdrive-export .driver-file-card {
  display: flex;
  flex-direction: column;
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 10px 14px;
  margin: 4px 0;
  transition: border-color 0.15s ease, background 0.15s ease;
}

.driver-gdrive-export .driver-file-card:hover {
  background: #ffffff;
  border-color: #cbd5e1;
}

.driver-gdrive-export .driver-file-main {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.driver-gdrive-export .driver-file-info {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 200px;
  flex: 1;
}

.driver-gdrive-export a.driver-file-link {
  color: #2563eb !important;
  text-decoration: none !important;
  font-weight: 500;
  font-size: 14px;
  word-break: break-word;
  transition: color 0.15s ease;
}

.driver-gdrive-export a.driver-file-link:hover {
  color: #1d4ed8 !important;
  text-decoration: underline !important;
}

.driver-gdrive-export .driver-badge {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 6px;
  border-radius: 4px;
  text-transform: uppercase;
  letter-spacing: 0.02em;
}

.driver-gdrive-export .driver-file-meta {
  display: flex;
  align-items: center;
  gap: 10px;
}

.driver-gdrive-export .driver-file-size {
  font-size: 12px;
  color: #64748b;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}

.driver-gdrive-export a.driver-action-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  font-weight: 500;
  color: #4b5563 !important;
  text-decoration: none !important;
  background: #ffffff;
  border: 1px solid #d1d5db;
  padding: 4px 8px;
  border-radius: 6px;
  transition: all 0.15s ease;
}

.driver-gdrive-export a.driver-action-btn:hover {
  background: #f3f4f6;
  color: #111827 !important;
  border-color: #9ca3af;
}

/* Embed Viewer Accordion */
.driver-gdrive-export details.driver-embed-details {
  margin-top: 8px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  background: #ffffff;
  overflow: hidden;
}

.driver-gdrive-export summary.driver-embed-summary {
  font-size: 12px;
  font-weight: 600;
  color: #2563eb;
  cursor: pointer;
  user-select: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background: #f8fafc;
  transition: background 0.15s ease;
}

.driver-gdrive-export summary.driver-embed-summary:hover {
  background: #eff6ff;
}

.driver-gdrive-export .driver-embed-summary-left {
  display: flex;
  align-items: center;
  gap: 6px;
}

.driver-gdrive-export .driver-embed-badge {
  font-size: 10px;
  font-weight: 600;
  color: #059669;
  background: #ecfdf5;
  border: 1px solid #a7f3d0;
  padding: 2px 6px;
  border-radius: 4px;
  text-transform: uppercase;
}

.driver-gdrive-export .driver-embed-body {
  padding: 12px;
  background: #ffffff;
  border-top: 1px solid #e2e8f0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* Embed Code Snippet Container */
.driver-gdrive-export .driver-embed-code-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 6px;
}

.driver-gdrive-export .driver-embed-code-title {
  font-size: 12px;
  font-weight: 700;
  color: #334155;
  display: flex;
  align-items: center;
  gap: 5px;
}

.driver-gdrive-export .driver-copy-code-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: #2563eb;
  color: #ffffff !important;
  border: 1px solid #1d4ed8;
  padding: 5px 10px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
}

.driver-gdrive-export .driver-copy-code-btn:hover {
  background: #1d4ed8;
}

.driver-gdrive-export .driver-copy-code-btn.driver-btn-copied {
  background: #16a34a !important;
  border-color: #15803d !important;
  color: #ffffff !important;
}

.driver-gdrive-export .driver-embed-code-box {
  width: 100%;
}

.driver-gdrive-export textarea.driver-embed-textarea {
  width: 100%;
  box-sizing: border-box;
  padding: 8px 10px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 11px;
  color: #0f172a;
  background-color: #f1f5f9;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  resize: vertical;
  line-height: 1.4;
  outline: none;
  cursor: text;
}

.driver-gdrive-export textarea.driver-embed-textarea:focus {
  background-color: #ffffff;
  border-color: #2563eb;
  box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.1);
}

/* Embed Preview Wrapper */
.driver-gdrive-export .driver-embed-preview-wrapper {
  margin-top: 4px;
  border-radius: 8px;
  border: 1px solid #e2e8f0;
  overflow: hidden;
}

.driver-gdrive-export .driver-embed-preview-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
  background: #f8fafc;
  border-bottom: 1px solid #e2e8f0;
  font-size: 11px;
  color: #64748b;
  font-weight: 600;
}

.driver-gdrive-export a.driver-embed-external-link {
  color: #2563eb !important;
  text-decoration: none !important;
}

.driver-gdrive-export a.driver-embed-external-link:hover {
  text-decoration: underline !important;
}

.driver-gdrive-export .driver-embed-frame-box {
  background: #ffffff;
  position: relative;
  width: 100%;
  height: 400px;
}

.driver-gdrive-export .driver-embed-frame-box iframe {
  width: 100%;
  height: 100%;
  border: 0;
  background: #ffffff;
}

.driver-gdrive-export .driver-footer {
  margin-top: 24px;
  padding-top: 14px;
  border-top: 1px solid #f3f4f6;
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 11px;
  color: #9ca3af;
}

@media print {
  .driver-gdrive-export {
    border: none;
    box-shadow: none;
    padding: 0;
    margin: 0;
  }
  .driver-gdrive-export .driver-search-box,
  .driver-gdrive-export .driver-folder-actions,
  .driver-gdrive-export details.driver-embed-details,
  .driver-gdrive-export .driver-action-btn {
    display: none !important;
  }
  .driver-gdrive-export .driver-file-card {
    background: transparent;
    border: none;
    border-bottom: 1px solid #eee;
    border-radius: 0;
  }
}
`;

/**
 * Recursively renders the tree elements
 */
const renderNodesHtml = (items: DriveFileItem[], includeEmbeds: boolean): string => {
  if (!items || items.length === 0) return '';

  const sorted = [...items].sort((a, b) => {
    const aIsFolder = a.mimeType === 'application/vnd.google-apps.folder';
    const bIsFolder = b.mimeType === 'application/vnd.google-apps.folder';
    if (aIsFolder && !bIsFolder) return -1;
    if (!aIsFolder && bIsFolder) return 1;
    return a.name.localeCompare(b.name);
  });

  let html = '<ul class="driver-tree-list">';

  for (const item of sorted) {
    const isFolder = item.mimeType === 'application/vnd.google-apps.folder';
    const folderUrl = `https://drive.google.com/drive/folders/${item.id}`;
    const fileViewUrl = item.webViewLink || `https://drive.google.com/file/d/${item.id}/view`;
    const downloadUrl = item.webContentLink || `https://drive.google.com/uc?export=download&id=${item.id}`;
    const badgeInfo = getFileIconAndBadge(item.mimeType);

    if (isFolder) {
      const childCount = item.children ? item.children.length : 0;
      html += `
      <li class="driver-node driver-folder-node" data-name="${escapeHtml(item.name.toLowerCase())}">
        <details class="driver-folder-details" open>
          <summary class="driver-folder-summary">
            <span class="driver-folder-title">
              <span aria-hidden="true">${badgeInfo.icon}</span>
              <strong>${escapeHtml(item.name)}</strong>
              <span class="driver-badge" style="background:${badgeInfo.bg};color:${badgeInfo.color};">${childCount} items</span>
            </span>
            <span class="driver-folder-actions">
              <a href="${folderUrl}" target="_blank" rel="noopener noreferrer" class="driver-action-btn" title="Open folder in Google Drive">
                Open Drive ↗
              </a>
            </span>
          </summary>
          <div class="driver-folder-content">
            <ul class="driver-sub-tree">
              ${renderNodesHtml(item.children || [], includeEmbeds)}
            </ul>
          </div>
        </details>
      </li>`;
    } else {
      const sizeStr = item.size ? formatBytes(Number(item.size)) : '';
      const embedUrl = getEmbedUrl(item);

      html += `
      <li class="driver-node driver-file-node" data-name="${escapeHtml(item.name.toLowerCase())}">
        <article class="driver-file-card" itemscope itemtype="https://schema.org/DigitalDocument">
          <div class="driver-file-main">
            <div class="driver-file-info">
              <span class="driver-file-icon" aria-hidden="true">${badgeInfo.icon}</span>
              <a href="${fileViewUrl}" target="_blank" rel="noopener noreferrer" class="driver-file-link" itemprop="url" title="View ${escapeHtml(item.name)} on Google Drive">
                <span itemprop="name">${escapeHtml(item.name)}</span>
              </a>
              <span class="driver-badge" style="background:${badgeInfo.bg};color:${badgeInfo.color};">${badgeInfo.label}</span>
            </div>
            
            <div class="driver-file-meta">
              ${sizeStr ? `<span class="driver-file-size" itemprop="fileSize">${sizeStr}</span>` : ''}
              <a href="${fileViewUrl}" target="_blank" rel="noopener noreferrer" class="driver-action-btn" title="View file in Google Drive">
                View ↗
              </a>
              <a href="${downloadUrl}" target="_blank" rel="noopener noreferrer" class="driver-action-btn" title="Direct download from Google Drive">
                Download ⤓
              </a>
            </div>
          </div>

          ${includeEmbeds && embedUrl ? (() => {
            const embedCodeId = 'driver-embed-' + item.id.replace(/[^a-zA-Z0-9_-]/g, '');
            const rawEmbedCode = `<iframe src="${embedUrl}" width="100%" height="480" frameborder="0" allowfullscreen="true" loading="lazy" title="${escapeHtml(item.name)}"></iframe>`;
            return `
          <details class="driver-embed-details">
            <summary class="driver-embed-summary">
              <span class="driver-embed-summary-left">
                <span aria-hidden="true">👁️</span>
                <span>Preview &amp; Embed Document</span>
              </span>
              <span class="driver-embed-badge">HTML Embed Code</span>
            </summary>
            <div class="driver-embed-body">
              <div class="driver-embed-code-bar">
                <div class="driver-embed-code-title">
                  <span aria-hidden="true">&lt;/&gt;</span>
                  <span>HTML Embed Code (Copy &amp; Paste):</span>
                </div>
                <button 
                  type="button" 
                  class="driver-copy-code-btn" 
                  onclick="driverCopyEmbedSnippet(this, '${embedCodeId}')"
                  title="Copy HTML embed iframe code"
                >
                  <span>📋 Copy HTML Embed Code</span>
                </button>
              </div>

              <div class="driver-embed-code-box">
                <textarea 
                  id="${embedCodeId}" 
                  class="driver-embed-textarea" 
                  readonly 
                  rows="2" 
                  onclick="this.select(); driverCopyEmbedSnippet(this.closest('.driver-embed-body').querySelector('.driver-copy-code-btn'), '${embedCodeId}');" 
                  title="Click to copy HTML embed code"
                >${escapeHtml(rawEmbedCode)}</textarea>
              </div>

              <div class="driver-embed-preview-wrapper">
                <div class="driver-embed-preview-header">
                  <span>Interactive Document Preview</span>
                  <a href="${fileViewUrl}" target="_blank" rel="noopener noreferrer" class="driver-embed-external-link">Open in Google Drive ↗</a>
                </div>
                <div class="driver-embed-frame-box">
                  <iframe src="${embedUrl}" loading="lazy" allowfullscreen="true" title="Embedded preview of ${escapeHtml(item.name)}"></iframe>
                </div>
              </div>
            </div>
          </details>`;
          })() : ''}
        </article>
      </li>`;
    }
  }

  html += '</ul>';
  return html;
};

/**
 * Returns Blogger-ready HTML snippet (can be pasted directly into Blogger Post/Page HTML tab)
 */
export const generateBloggerHtmlSnippet = (allFiles: DriveFileItem[], options: ExportOptions = {}): string => {
  const { filteredFiles, selectedFolder } = filterFilesByFolder(allFiles, options.selectedFolderId);
  const targetFiles = filteredFiles.length > 0 ? filteredFiles : allFiles;
  const { rootItems, allItemsCount } = buildFileHierarchy(targetFiles);

  const defaultTitle = selectedFolder 
    ? `${selectedFolder.name} - Google Drive Directory` 
    : 'Google Drive Public File & Folder Directory';
  const title = options.title || defaultTitle;
  const description = options.description || (
    selectedFolder 
      ? `Public directory of files and resources inside "${selectedFolder.name}" on Google Drive.`
      : 'Public directory of cloud files, documents, media, and downloadable resources with direct links and embeds.'
  );
  const includeEmbeds = options.includeEmbeds !== false;
  const includeSearch = options.includeSearch !== false;

  const jsonLd = generateJsonLdSchema(targetFiles, title, description);
  const scopedCss = getScopedCss();

  return `<!-- ==========================================================================
     GOOGLE DRIVE FOLDER & RESOURCE DIRECTORY (BLOGGER & SEO READY)
     Generated with Driver - Compatible with Blogger, WordPress, and Custom Pages.
     ========================================================================== -->

<style>
${scopedCss}
</style>

<div class="driver-gdrive-export" id="driver-drive-directory" itemscope itemtype="https://schema.org/CollectionPage">
  <!-- Structured Data JSON-LD for Search Engines -->
  <script type="application/ld+json">
${jsonLd}
  </script>

  <header class="driver-header">
    <h2 class="driver-title" itemprop="headline">${escapeHtml(title)}</h2>
    <p class="driver-desc" itemprop="description">${escapeHtml(description)}</p>
    
    <div class="driver-meta-bar">
      <span>📂 <strong>${allItemsCount}</strong> total items indexed</span>
      <time datetime="${new Date().toISOString()}">Updated ${new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}</time>
    </div>
  </header>

  ${includeSearch ? `
  <div class="driver-search-box">
    <input 
      type="search" 
      class="driver-search-input" 
      id="driver-search-filter" 
      placeholder="🔍 Search files and folders by name..." 
      aria-label="Filter files and folders"
      oninput="driverFilterFiles(this.value)"
    />
  </div>` : ''}

  <main class="driver-tree-container">
    ${renderNodesHtml(rootItems, includeEmbeds)}
  </main>

  <footer class="driver-footer">
    <span>🔒 Direct Google Drive links with SSL encryption</span>
    <span>Generated by Driver</span>
  </footer>
</div>

<script>
function driverFilterFiles(query) {
  var root = document.getElementById('driver-drive-directory');
  if (!root) return;
  var term = (query || '').toLowerCase().trim();
  var nodes = root.querySelectorAll('.driver-node');
  
  for (var i = 0; i < nodes.length; i++) {
    var node = nodes[i];
    var name = node.getAttribute('data-name') || '';
    if (!term || name.indexOf(term) !== -1) {
      node.style.display = '';
    } else {
      // If it's a folder, check if any children match
      if (node.classList.contains('driver-folder-node')) {
        var hasVisibleChild = node.querySelector('.driver-node:not([style*="display: none"])');
        node.style.display = hasVisibleChild ? '' : 'none';
      } else {
        node.style.display = 'none';
      }
    }
  }
}

function driverCopyEmbedSnippet(btn, targetId) {
  var el = document.getElementById(targetId);
  if (!el) return;
  var text = el.value || el.innerText || el.textContent;

  function markSuccess() {
    if (!btn) return;
    var origHtml = btn.innerHTML;
    btn.innerHTML = '<span>✓ Copied to Clipboard!</span>';
    btn.classList.add('driver-btn-copied');
    setTimeout(function() {
      btn.innerHTML = origHtml;
      btn.classList.remove('driver-btn-copied');
    }, 2200);
  }

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(markSuccess).catch(function() {
      try {
        if (el.select) el.select();
        document.execCommand('copy');
        markSuccess();
      } catch (err) {
        console.error('Failed to copy', err);
      }
    });
  } else {
    try {
      if (el.select) el.select();
      document.execCommand('copy');
      markSuccess();
    } catch (err) {
      console.error('Failed to copy', err);
    }
  }
}
</script>
`;
};

/**
 * Returns full standalone HTML document (for downloading as .html file or hosting anywhere)
 */
export const generateStandaloneHtmlDocument = (allFiles: DriveFileItem[], options: ExportOptions = {}): string => {
  const title = options.title || 'Google Drive Public File & Folder Directory';
  const description = options.description || 'Public directory of cloud files, documents, media, and downloadable resources with direct links and embeds.';
  const snippet = generateBloggerHtmlSnippet(allFiles, options);

  return `<!DOCTYPE html>
<html lang="en" prefix="og: https://ogp.me/ns#">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1">
  
  <!-- OpenGraph Metadata -->
  <meta property="og:type" content="website">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:site_name" content="Google Drive Resource Directory">
  
  <!-- Twitter Card Metadata -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(title)}">
  <meta name="twitter:description" content="${escapeHtml(description)}">
  
  <style>
    body {
      margin: 0;
      padding: 24px 16px;
      background-color: #f8fafc;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
    }
    .driver-page-wrapper {
      width: 100%;
      max-width: 920px;
    }
    .driver-top-controls {
      display: flex;
      justify-content: flex-end;
      gap: 10px;
      margin-bottom: 12px;
    }
    .driver-print-btn {
      background: #111827;
      color: #ffffff;
      border: 0;
      padding: 8px 16px;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      transition: background 0.15s ease;
    }
    .driver-print-btn:hover {
      background: #1f2937;
    }
    @media print {
      body {
        background: #ffffff;
        padding: 0;
      }
      .driver-top-controls {
        display: none !important;
      }
    }
  </style>
</head>
<body>
  <div class="driver-page-wrapper">
    <div class="driver-top-controls">
      <button class="driver-print-btn" onclick="window.print()">🖨️ Print / Save as PDF</button>
    </div>
    ${snippet}
  </div>
</body>
</html>`;
};
