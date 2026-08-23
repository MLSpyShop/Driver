/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useMemo } from 'react';
import { CheckCircle, HardDrive, ShieldCheck, Sparkles, Trash2, Search, Download } from 'lucide-react';
import { auth, googleProvider } from './firebase';
import { signInWithPopup, onAuthStateChanged, signOut, User, browserPopupRedirectResolver } from 'firebase/auth';
import { GoogleAuthProvider } from 'firebase/auth';

export default function App() {
  const [duplicates, setDuplicates] = useState<any[][]>([]);
  const [loading, setLoading] = useState(false);
  const [deletingFileIds, setDeletingFileIds] = useState<Set<string>>(new Set());
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [totalScanned, setTotalScanned] = useState<number>(0);

  const totalReclaimableBytes = useMemo(() => {
    return duplicates.reduce((total, group) => {
      if (group.length <= 1) return total;
      // Sum sizes of files after index 0
      const groupSize = group.slice(1).reduce((sum, file) => sum + (Number(file.size) || 0), 0);
      return total + groupSize;
    }, 0);
  }, [duplicates]);

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 MB';
    const mb = bytes / (1024 * 1024);
    if (mb < 1024) return `${mb.toFixed(2)} MB`;
    return `${(mb / 1024).toFixed(2)} GB`;
  };

  useEffect(() => {
    return onAuthStateChanged(auth, async (user) => {
        setUser(user);
    });
  }, []);

  const login = async () => {
    try {
        const result = await signInWithPopup(auth, googleProvider, browserPopupRedirectResolver);
        const credential = GoogleAuthProvider.credentialFromResult(result);
        console.log("Login result:", result);
        console.log("Credential keys:", Object.keys(credential || {}));
        if (credential) {
            console.log("Credential has refreshToken:", !!(credential as any).refreshToken);
        }
        if (!credential || !credential.accessToken) {
            console.error("No access token found in credential!");
            return;
        }
        setUser(result.user);
        setAccessToken(credential!.accessToken!);
        scan(credential!.accessToken!);
    } catch (error) {
        console.error("Login failed:", error);
    }
  };

  const scan = async (token: string) => {
    setLoading(true);
    const res = await fetch('/api/scan', {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    if (res.status === 401) {
        console.error("Token expired during scan, logging out.");
        logout();
        return;
    }
    if (res.ok) {
        try {
            const data = await res.json();
            setDuplicates(data.duplicates);
            setTotalScanned(data.totalScanned);
        } catch (e) {
            console.error("Failed to parse JSON response:", e);
        }
    } else {
        console.error("Scan API failed with status:", res.status);
    }
    setLoading(false);
  };

  const deleteAllDuplicates = async () => {
    const idsToDelete = duplicates.reduce((acc: string[], group) => {
      if (group.length > 1) {
        acc.push(...group.slice(1).map((f: any) => f.id));
      }
      return acc;
    }, []);
    
    if (idsToDelete.length > 0) {
      await deleteFiles(idsToDelete);
    }
  };

  const deleteFiles = async (fileIds: string[]) => {
    if (!accessToken) {
        console.error("AccessToken missing!");
        return;
    }
    setDeletingFileIds(prev => new Set([...prev, ...fileIds]));
    const response = await fetch('/api/delete-group', {
        method: 'POST',
        headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify({ fileIds })
    });

    if (response.status === 401) {
        console.error("Token expired, logging out.");
        logout();
        return;
    }

    setDeletingFileIds(prev => {
        const next = new Set(prev);
        fileIds.forEach(id => next.delete(id));
        return next;
    });
    setDuplicates(prevGroups => {
        return prevGroups
            .map(group => group.filter(file => !fileIds.includes(file.id)))
            .filter(group => group.length > 0);
    });
  };

  const deleteGroupExceptNewest = async (groupFiles: any[]) => {
    // groupFiles is sorted newest first by server
    const filesToDelete = groupFiles.slice(1);
    const fileIds = filesToDelete.map(f => f.id);
    await deleteFiles(fileIds);
  };

  const logout = async () => {
    await signOut(auth);
    setUser(null);
    setAccessToken(null);
    setDuplicates([]);
  };

  const exportFileListHtml = async () => {
    if (!accessToken) return;
    try {
      setLoading(true);
      const res = await fetch('/api/all-files', {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });
      if (!res.ok) {
        console.error("Failed to fetch all files");
        setLoading(false);
        return;
      }
      const data = await res.json();
      const allFiles = data.files || [];

      // Build hierarchy
      const itemMap = new Map<string, any>();
      const rootItems: any[] = [];

      allFiles.forEach((file: any) => {
        itemMap.set(file.id, { ...file, children: [] });
      });

      allFiles.forEach((file: any) => {
        const item = itemMap.get(file.id);
        const parents = file.parents || [];
        if (parents.length === 0) {
          rootItems.push(item);
        } else {
          let addedToParent = false;
          for (const parentId of parents) {
            if (itemMap.has(parentId)) {
              itemMap.get(parentId).children.push(item);
              addedToParent = true;
              break;
            }
          }
          if (!addedToParent) {
            rootItems.push(item);
          }
        }
      });

      const renderTreeHtml = (items: any[]): string => {
        if (!items || items.length === 0) return '';
        let html = '<ul>';
        const sorted = [...items].sort((a, b) => {
          const aIsFolder = a.mimeType === 'application/vnd.google-apps.folder';
          const bIsFolder = b.mimeType === 'application/vnd.google-apps.folder';
          if (aIsFolder && !bIsFolder) return -1;
          if (!aIsFolder && bIsFolder) return 1;
          return a.name.localeCompare(b.name);
        });

        for (const item of sorted) {
          const isFolder = item.mimeType === 'application/vnd.google-apps.folder';
          if (isFolder) {
            html += `<li>
              <div class="folder">📁 <strong>${escapeHtml(item.name)}</strong> <span class="badge">Folder</span></div>
              ${renderTreeHtml(item.children)}
            </li>`;
          } else {
            const sizeStr = item.size ? formatBytesNum(Number(item.size)) : '';
            html += `<li>
              <div class="file">
                <span class="file-name">📄 ${escapeHtml(item.name)}</span>
                <span class="file-meta">${sizeStr}</span>
              </div>
            </li>`;
          }
        }
        html += '</ul>';
        return html;
      };

      const escapeHtml = (str: string) => {
        return (str || '').replace(/[&<>'"]/g, 
          tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
        );
      };

      const formatBytesNum = (bytes: number) => {
        if (!bytes || bytes === 0) return '';
        const mb = bytes / (1024 * 1024);
        if (mb < 1) return `${(bytes / 1024).toFixed(1)} KB`;
        if (mb < 1024) return `${mb.toFixed(1)} MB`;
        return `${(mb / 1024).toFixed(2)} GB`;
      };

      const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Google Drive Folder & File Directory</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 40px; color: #171717; max-width: 900px; margin: 0 auto; background: #fafafa; }
    h1 { font-size: 24px; margin-bottom: 8px; color: #111; }
    .subtitle { color: #666; font-size: 14px; margin-bottom: 24px; }
    .tree { background: #fff; border: 1px solid #e5e5e5; border-radius: 12px; padding: 24px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
    ul { list-style-type: none; padding-left: 20px; margin: 6px 0; border-left: 1px dashed #d1d5db; }
    li { margin: 8px 0; position: relative; }
    .folder { font-weight: 600; color: #2563eb; display: flex; align-items: center; gap: 6px; margin: 8px 0; }
    .file { font-weight: 400; color: #374151; display: flex; justify-content: space-between; align-items: center; padding: 6px 10px; border-radius: 6px; background: #f9fafb; margin: 4px 0; border: 1px solid #f3f4f6; }
    .file-name { display: flex; align-items: center; gap: 6px; }
    .file-meta { font-size: 12px; color: #6b7280; font-family: monospace; }
    .badge { font-size: 10px; background: #eff6ff; color: #1d4ed8; padding: 2px 6px; border-radius: 4px; font-weight: 500; }
    .print-btn { background: #2563eb; color: #fff; border: none; padding: 10px 20px; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; margin-bottom: 20px; }
    @media print {
      body { background: #fff; padding: 0; }
      .tree { border: none; box-shadow: none; padding: 0; }
      .file { background: none; border: none; border-bottom: 1px solid #eee; }
      .print-btn { display: none; }
    }
  </style>
</head>
<body>
  <button class="print-btn" onclick="window.print()">🖨️ Print / Save as PDF</button>
  <h1>Google Drive Folder & File Directory</h1>
  <div class="subtitle">Generated on ${new Date().toLocaleString()} | Total items: ${allFiles.length}</div>
  <div class="tree">
    ${renderTreeHtml(rootItems)}
  </div>
</body>
</html>`;

      const blob = new Blob([htmlContent], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `google-drive-file-list-${new Date().toISOString().slice(0, 10)}.html`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("Export HTML error", e);
    } finally {
      setLoading(false);
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-neutral-50 px-4 py-12 sm:px-6 lg:px-8 flex flex-col items-center justify-center">
        <div className="max-w-3xl w-full text-center space-y-8">
          {/* Header & Description */}
          <div className="space-y-4 flex flex-col items-center">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-blue-500/20 mb-2">
              <HardDrive className="w-8 h-8" />
            </div>
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-blue-50 border border-blue-100 text-blue-700 text-sm font-medium">
              <Sparkles className="w-4 h-4 text-blue-600" />
              <span>Free Up Google Drive Storage</span>
            </div>
            <h1 className="text-4xl sm:text-5xl font-extrabold text-neutral-900 tracking-tight leading-tight">
              Driver
            </h1>
            <p className="text-lg sm:text-xl text-neutral-600 max-w-2xl mx-auto leading-relaxed">
              Effortlessly scan your Google Drive to detect and delete exact duplicate files, and export your entire folder structure into a clean, printable HTML directory.
            </p>
          </div>

          {/* Action Card */}
          <div className="bg-white p-8 rounded-2xl shadow-sm border border-neutral-200/80 max-w-lg mx-auto flex flex-col items-center space-y-4">
            <p className="text-sm font-medium text-neutral-500">Sign in with your Google account to get started</p>
            <button
              onClick={login}
              className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white font-semibold px-8 py-3.5 rounded-xl shadow-sm transition-all duration-200 flex items-center justify-center gap-3 text-base cursor-pointer"
            >
              <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
              </svg>
              <span>Connect with Google Drive</span>
            </button>
            <div className="flex items-center gap-1.5 text-xs text-neutral-500 pt-1">
              <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>Secure OAuth login. Read & delete permissions required.</span>
            </div>
          </div>

          {/* Key Features Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-left pt-4 max-w-2xl mx-auto">
            <div className="bg-white p-6 rounded-2xl border border-neutral-200/60 shadow-xs space-y-2">
              <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl w-fit mb-3">
                <Trash2 className="w-5 h-5" />
              </div>
              <h3 className="font-semibold text-neutral-900 text-base">Duplicate Cleanup</h3>
              <p className="text-sm text-neutral-600 leading-relaxed">
                Detects exact duplicate files by checksum and name, reclaiming valuable cloud storage with 1-click cleanup.
              </p>
            </div>

            <div className="bg-white p-6 rounded-2xl border border-neutral-200/60 shadow-xs space-y-2">
              <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl w-fit mb-3">
                <Download className="w-5 h-5" />
              </div>
              <h3 className="font-semibold text-neutral-900 text-base">Folder to HTML Export</h3>
              <p className="text-sm text-neutral-600 leading-relaxed">
                Export your complete Google Drive folder and file tree into a neatly nested HTML document ready for printing or PDF saving.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-50 p-4 sm:p-8">
      <div className="max-w-3xl mx-auto">
        <header className="mb-8 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-blue-500/20">
            <HardDrive className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-3xl sm:text-4xl font-extrabold text-neutral-900 tracking-tight">Driver</h1>
            <p className="text-neutral-600 text-sm sm:text-base mt-0.5">Securely identify and remove duplicate files from your Google Drive.</p>
          </div>
        </header>
      
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-neutral-100 mb-8 flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-col">
              <span className="text-neutral-700 font-medium">Account: {user.email}</span>
              <button onClick={logout} className="text-xs text-neutral-500 hover:text-red-600 underline text-left">Logout</button>
          </div>
          {duplicates.length > 0 && (
            <div className="flex gap-4 items-center">
              <div className="text-sm text-neutral-600 font-medium bg-neutral-100 px-4 py-2 rounded-lg">
                  Scanned {totalScanned} files | Potential Storage Reclaim: <span className="text-neutral-900 font-bold">{formatBytes(totalReclaimableBytes)}</span>
              </div>
              <button 
                onClick={deleteAllDuplicates}
                disabled={deletingFileIds.size > 0 || loading}
                className="text-sm font-semibold text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
              >
                  {deletingFileIds.size > 0 ? 'Deleting...' : 'Delete All Duplicates'}
              </button>
            </div>
          )}
          <div className="flex gap-3 items-center flex-wrap">
            <button 
              onClick={exportFileListHtml}
              disabled={loading}
              className="bg-white hover:bg-neutral-50 text-neutral-800 border border-neutral-200 px-5 py-3 rounded-xl font-semibold transition-colors flex items-center gap-2 min-h-[48px] disabled:opacity-50"
            >
              <Download className="w-4 h-4 text-neutral-600" />
              <span>Export Folder HTML</span>
            </button>
            <button 
              onClick={() => scan(accessToken!)} 
              className="bg-neutral-900 hover:bg-neutral-800 text-white px-6 py-3 rounded-xl font-semibold transition-colors flex items-center justify-center min-h-[48px]" 
              disabled={loading}
            >
              {loading ? 'Scanning...' : 'Scan for Duplicates'}
            </button>
          </div>
        </div>

        {duplicates.length === 0 && !loading && (
          <div className="text-center py-20 bg-white rounded-2xl shadow-sm border border-neutral-100 flex flex-col items-center">
            <CheckCircle className="w-16 h-16 text-green-500 mb-4" />
            <h3 className="text-xl font-semibold text-neutral-900">Your Drive is Clean!</h3>
            <p className="text-neutral-500 mt-2">No duplicate files found.</p>
          </div>
        )}

        {duplicates.map((group, i) => (
          <div key={i} className="bg-white p-6 rounded-2xl shadow-sm border border-neutral-100 mb-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
              <h2 className="text-lg font-semibold text-neutral-900">Group {i+1}</h2>
              <button 
                onClick={() => deleteGroupExceptNewest(group)} 
                className="text-sm bg-orange-50 hover:bg-orange-100 text-orange-700 font-medium px-4 py-2 rounded-lg transition-colors min-h-[44px]"
              >
                Delete All Except Newest
              </button>
            </div>
            <div className="space-y-3">
              {group.map((file: any, index: number) => (
                <div key={file.id} className="flex items-center justify-between gap-4 p-3 bg-neutral-50 rounded-xl">
                  <div className="flex flex-col truncate">
                    <span className="text-sm font-medium text-neutral-900">{file.name}</span>
                    {index === 0 && <span className="text-xs text-green-600 font-semibold">Newest</span>}
                  </div>
                  <button 
                    onClick={() => deleteFiles([file.id])} 
                    className="text-xs font-semibold text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 px-3 py-2 rounded-lg transition-colors min-h-[40px] disabled:opacity-50"
                    disabled={deletingFileIds.has(file.id)}
                  >
                    {deletingFileIds.has(file.id) ? 'Deleting...' : 'Delete'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
