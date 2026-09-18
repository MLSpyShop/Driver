/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useMemo } from 'react';
import { 
  CheckCircle, 
  HardDrive, 
  ShieldCheck, 
  Sparkles, 
  Trash2, 
  Search, 
  Download, 
  BarChart3, 
  PieChart as PieIcon, 
  FileText,
  Globe,
  Code,
  Eye,
  Folder,
  FolderOpen,
  ChevronRight,
  Layers
} from 'lucide-react';
import { auth, googleProvider } from './firebase';
import { signInWithPopup, onAuthStateChanged, signOut, User, browserPopupRedirectResolver } from 'firebase/auth';
import { GoogleAuthProvider } from 'firebase/auth';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { ExportModal } from './components/ExportModal';
import { DriveFileItem, getDriveFolders, FolderMeta } from './htmlExporter';

export default function App() {
  const [activeTab, setActiveTab] = useState<'duplicates' | 'insights' | 'export'>('duplicates');
  const [duplicates, setDuplicates] = useState<any[][]>([]);
  const [loading, setLoading] = useState(false);
  const [deletingFileIds, setDeletingFileIds] = useState<Set<string>>(new Set());
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [totalScanned, setTotalScanned] = useState<number>(0);
  const [insights, setInsights] = useState<any>(null);
  const [loadingInsights, setLoadingInsights] = useState(false);
  const [allFiles, setAllFiles] = useState<DriveFileItem[]>([]);
  const [loadingAllFiles, setLoadingAllFiles] = useState(false);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [selectedFolderForExport, setSelectedFolderForExport] = useState<string>('all');
  const [exportFormatForModal, setExportFormatForModal] = useState<'blogger' | 'html' | 'pdf'>('blogger');
  const [folderSearchFilter, setFolderSearchFilter] = useState('');

  // Deletion confirmation modal state
  const [pendingDelete, setPendingDelete] = useState<{
    fileIds: string[];
    title: string;
    description: string;
    fileNames?: string[];
    totalSize?: number;
  } | null>(null);

  const driveFolders = useMemo(() => {
    return getDriveFolders(allFiles);
  }, [allFiles]);

  const filteredDriveFolders = useMemo(() => {
    if (!folderSearchFilter.trim()) return driveFolders;
    const q = folderSearchFilter.toLowerCase();
    return driveFolders.filter(f => 
      f.name.toLowerCase().includes(q) || f.path.toLowerCase().includes(q)
    );
  }, [driveFolders, folderSearchFilter]);

  const totalReclaimableBytes = useMemo(() => {
    return duplicates.reduce((total, group) => {
      if (group.length <= 1) return total;
      const groupSize = group.slice(1).reduce((sum, file) => sum + (Number(file.size) || 0), 0);
      return total + groupSize;
    }, 0);
  }, [duplicates]);

  const formatBytes = (bytes: number) => {
    if (!bytes || bytes === 0) return '0 MB';
    const mb = bytes / (1024 * 1024);
    if (mb < 1024) return `${mb.toFixed(2)} MB`;
    return `${(mb / 1024).toFixed(2)} GB`;
  };

  useEffect(() => {
    return onAuthStateChanged(auth, async (u) => {
      setUser(u);
      // If user signed out from Firebase, clear tokens
      if (!u) {
        setAccessToken(null);
        setDuplicates([]);
        setInsights(null);
        setAllFiles([]);
      }
    });
  }, []);

  const login = async () => {
    setIsSigningIn(true);
    setAuthError(null);
    setScanError(null);
    try {
      const result = await signInWithPopup(auth, googleProvider, browserPopupRedirectResolver);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (!credential || !credential.accessToken) {
        throw new Error("No Google OAuth access token received from authentication provider.");
      }
      const token = credential.accessToken;
      setUser(result.user);
      setAccessToken(token);
      
      // Auto-scan duplicates and insights on fresh login
      scan(token);
      fetchInsights(token);
    } catch (error: any) {
      console.error("Login failed:", error);
      setAuthError(error?.message || "Failed to sign in with Google. Please try again.");
    } finally {
      setIsSigningIn(false);
    }
  };

  const scan = async (token?: string) => {
    const t = token || accessToken;
    if (!t) {
      setAccessToken(null);
      setScanError("Google authentication required. Please sign in to scan Drive.");
      return;
    }

    setLoading(true);
    setScanError(null);
    try {
      const res = await fetch('/api/scan', {
        headers: { 'Authorization': `Bearer ${t}` }
      });

      if (res.status === 401) {
        setAccessToken(null);
        setScanError("Your Google Drive session has expired. Please reconnect your account.");
        return;
      }

      if (res.ok) {
        const data = await res.json();
        setDuplicates(data.duplicates || []);
        setTotalScanned(data.totalScanned || 0);
      } else {
        const data = await res.json().catch(() => ({}));
        setScanError(data.error || "Failed to scan Google Drive for duplicates.");
      }
    } catch (e: any) {
      console.error("Failed to execute scan:", e);
      setScanError("Network error occurred while scanning Google Drive.");
    } finally {
      setLoading(false);
    }
  };

  const fetchInsights = async (token?: string) => {
    const t = token || accessToken;
    if (!t) return;
    setLoadingInsights(true);
    try {
      const res = await fetch('/api/drive-insights', {
        headers: { 'Authorization': `Bearer ${t}` }
      });
      if (res.status === 401) {
        setAccessToken(null);
        return;
      }
      if (res.ok) {
        const data = await res.json();
        setInsights(data);
      }
    } catch (e) {
      console.error("Failed to fetch insights", e);
    } finally {
      setLoadingInsights(false);
    }
  };

  const requestDeleteAllDuplicates = () => {
    const filesToDelete: any[] = [];
    duplicates.forEach(group => {
      if (group.length > 1) {
        filesToDelete.push(...group.slice(1));
      }
    });

    if (filesToDelete.length === 0) return;

    setPendingDelete({
      fileIds: filesToDelete.map(f => f.id),
      title: `Delete All ${filesToDelete.length} Redundant Duplicate Files?`,
      description: `This will permanently remove ${filesToDelete.length} redundant duplicate copies from Google Drive and free up approximately ${formatBytes(totalReclaimableBytes)}. The original newest files will be kept intact.`,
      fileNames: filesToDelete.slice(0, 5).map(f => f.name),
      totalSize: totalReclaimableBytes
    });
  };

  const requestDeleteGroupExceptNewest = (groupFiles: any[], groupIndex: number) => {
    const filesToDelete = groupFiles.slice(1);
    const fileIds = filesToDelete.map(f => f.id);
    const groupSize = filesToDelete.reduce((sum, f) => sum + (Number(f.size) || 0), 0);

    setPendingDelete({
      fileIds,
      title: `Delete ${filesToDelete.length} Older Copies in Duplicate Group ${groupIndex + 1}?`,
      description: `This will delete ${filesToDelete.length} redundant file(s) and preserve the newest copy ("${groupFiles[0]?.name}").`,
      fileNames: filesToDelete.map(f => f.name),
      totalSize: groupSize
    });
  };

  const requestDeleteSingleFile = (file: any) => {
    setPendingDelete({
      fileIds: [file.id],
      title: `Delete "${file.name}"?`,
      description: `Are you sure you want to delete this specific file (${formatBytes(Number(file.size || 0))}) from Google Drive? This action cannot be undone.`,
      fileNames: [file.name],
      totalSize: Number(file.size || 0)
    });
  };

  const executeConfirmedDelete = async () => {
    if (!pendingDelete || !accessToken) return;
    const fileIds = pendingDelete.fileIds;
    setPendingDelete(null);

    setDeletingFileIds(prev => new Set([...prev, ...fileIds]));
    try {
      const response = await fetch('/api/delete-group', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify({ fileIds })
      });

      if (response.status === 401) {
        setAccessToken(null);
        setScanError("Google authentication expired while deleting files. Please sign in again.");
        return;
      }

      if (response.ok) {
        setDuplicates(prevGroups => {
          return prevGroups
            .map(group => group.filter(file => !fileIds.includes(file.id)))
            .filter(group => group.length > 1);
        });
      }
    } catch (err) {
      console.error("Deletion failed:", err);
    } finally {
      setDeletingFileIds(prev => {
        const next = new Set(prev);
        fileIds.forEach(id => next.delete(id));
        return next;
      });
    }
  };

  const logout = async () => {
    await signOut(auth);
    setUser(null);
    setAccessToken(null);
    setDuplicates([]);
    setInsights(null);
    setAllFiles([]);
    setScanError(null);
  };

  const fetchAllFiles = async (token?: string): Promise<DriveFileItem[]> => {
    const t = token || accessToken;
    if (!t) return [];
    setLoadingAllFiles(true);
    try {
      const res = await fetch('/api/all-files', {
        headers: { 'Authorization': `Bearer ${t}` }
      });
      if (res.status === 401) {
        setAccessToken(null);
        return [];
      }
      if (res.ok) {
        const data = await res.json();
        const files: DriveFileItem[] = data.files || [];
        setAllFiles(files);
        return files;
      }
    } catch (e) {
      console.error("Failed to fetch all files", e);
    } finally {
      setLoadingAllFiles(false);
    }
    return [];
  };

  const handleOpenExportModal = async (folderId: string = 'all', format: 'blogger' | 'html' | 'pdf' = 'blogger') => {
    setSelectedFolderForExport(folderId);
    setExportFormatForModal(format);
    if (allFiles.length === 0) {
      await fetchAllFiles();
    }
    setExportModalOpen(true);
  };

  // If user is not signed in OR accessToken is missing/expired, show clean Google Sign-in screen
  if (!user || !accessToken) {
    return (
      <div className="min-h-screen bg-neutral-50 px-4 py-12 sm:px-6 lg:px-8 flex flex-col items-center justify-center">
        <div className="max-w-3xl w-full text-center space-y-8">
          <div className="space-y-4 flex flex-col items-center">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-blue-500/20 mb-2">
              <HardDrive className="w-8 h-8" />
            </div>
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-blue-50 border border-blue-100 text-blue-700 text-sm font-medium">
              <Sparkles className="w-4 h-4 text-blue-600" />
              <span>Smart Google Drive Manager</span>
            </div>
            <h1 className="text-4xl sm:text-5xl font-extrabold text-neutral-900 tracking-tight leading-tight">
              Driver
            </h1>
            <p className="text-lg sm:text-xl text-neutral-600 max-w-2xl mx-auto leading-relaxed">
              Scan duplicates, analyze storage quotas, view largest files, and export your complete folder directory to printable HTML.
            </p>
          </div>

          <div className="bg-white p-8 rounded-2xl shadow-sm border border-neutral-200/80 max-w-lg mx-auto flex flex-col items-center space-y-4">
            {user ? (
              <div className="text-center space-y-1">
                <p className="text-sm font-semibold text-neutral-900">Signed in as {user.email}</p>
                <p className="text-xs text-neutral-500">Connect Google Drive to grant access to scan and manage files.</p>
              </div>
            ) : (
              <p className="text-sm font-medium text-neutral-600">Sign in with your Google account to get started</p>
            )}

            {authError && (
              <div className="w-full p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs text-left">
                {authError}
              </div>
            )}

            {scanError && (
              <div className="w-full p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-xs text-left">
                {scanError}
              </div>
            )}

            <button
              onClick={login}
              disabled={isSigningIn}
              className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-semibold px-8 py-3.5 rounded-xl shadow-sm transition-all duration-200 flex items-center justify-center gap-3 text-base cursor-pointer"
            >
              <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
              </svg>
              <span>{isSigningIn ? 'Connecting...' : user ? 'Grant Google Drive Access' : 'Connect with Google Drive'}</span>
            </button>

            <div className="flex items-center gap-1.5 text-xs text-neutral-500 pt-1">
              <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>Secure OAuth connection. Read & delete permissions required.</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-left pt-4 max-w-3xl mx-auto">
            <div className="bg-white p-6 rounded-2xl border border-neutral-200/60 shadow-xs space-y-2">
              <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl w-fit mb-3">
                <Trash2 className="w-5 h-5" />
              </div>
              <h3 className="font-semibold text-neutral-900 text-base">Duplicate Cleanup</h3>
              <p className="text-sm text-neutral-600 leading-relaxed">
                Detects exact duplicate files by checksum and safely removes redundant copies.
              </p>
            </div>

            <div className="bg-white p-6 rounded-2xl border border-neutral-200/60 shadow-xs space-y-2">
              <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl w-fit mb-3">
                <BarChart3 className="w-5 h-5" />
              </div>
              <h3 className="font-semibold text-neutral-900 text-base">Storage Insights</h3>
              <p className="text-sm text-neutral-600 leading-relaxed">
                Analyze storage quotas and file breakdowns by type with visual analytics.
              </p>
            </div>

            <div className="bg-white p-6 rounded-2xl border border-neutral-200/60 shadow-xs space-y-2">
              <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl w-fit mb-3">
                <Globe className="w-5 h-5" />
              </div>
              <h3 className="font-semibold text-neutral-900 text-base">HTML Folder Export & Blogger</h3>
              <p className="text-sm text-neutral-600 leading-relaxed">
                Export SEO-ready HTML with clickable links, live document embeds, and scoped Blogger template compatibility.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const pieData = insights?.typeBreakdown ? Object.entries(insights.typeBreakdown).map(([name, val]: [string, any]) => ({
    name,
    size: Number(val.size || 0),
    count: val.count
  })).filter(d => d.size > 0) : [];

  const COLORS = ['#2563eb', '#7c3aed', '#db2777', '#d97706', '#059669', '#475569'];

  return (
    <div className="min-h-screen bg-neutral-50 p-4 sm:p-8">
      <div className="max-w-4xl mx-auto">
        <header className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-blue-500/20">
              <HardDrive className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-neutral-900 tracking-tight">Driver</h1>
              <p className="text-neutral-600 text-xs sm:text-sm">Connected as {user.email}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button 
              onClick={handleOpenExportModal}
              disabled={loadingAllFiles}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl font-semibold text-sm transition-colors flex items-center gap-2 shadow-xs cursor-pointer disabled:opacity-50"
            >
              <Download className="w-4 h-4" />
              <span>{loadingAllFiles ? 'Loading Files...' : 'Export HTML'}</span>
            </button>
            <button onClick={logout} className="text-xs text-neutral-500 hover:text-red-600 font-medium px-3 py-2 rounded-lg border border-neutral-200 bg-white cursor-pointer">Logout</button>
          </div>
        </header>

        {scanError && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-2xl flex items-center justify-between gap-4">
            <p className="text-sm font-medium text-red-800">{scanError}</p>
            <button 
              onClick={() => login()}
              className="text-xs font-semibold px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors cursor-pointer"
            >
              Reconnect
            </button>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="flex border-b border-neutral-200 mb-6 gap-6">
          <button
            onClick={() => setActiveTab('duplicates')}
            className={`pb-3 font-semibold text-sm flex items-center gap-2 border-b-2 transition-colors cursor-pointer ${activeTab === 'duplicates' ? 'border-blue-600 text-blue-600' : 'border-transparent text-neutral-500 hover:text-neutral-900'}`}
          >
            <Trash2 className="w-4 h-4" />
            <span>Duplicate Cleanup</span>
          </button>
          <button
            onClick={() => {
              setActiveTab('insights');
              if (!insights && accessToken) fetchInsights(accessToken);
            }}
            className={`pb-3 font-semibold text-sm flex items-center gap-2 border-b-2 transition-colors cursor-pointer ${activeTab === 'insights' ? 'border-blue-600 text-blue-600' : 'border-transparent text-neutral-500 hover:text-neutral-900'}`}
          >
            <BarChart3 className="w-4 h-4" />
            <span>Storage & Insights</span>
          </button>
          <button
            onClick={() => {
              setActiveTab('export');
              if (allFiles.length === 0 && accessToken) fetchAllFiles();
            }}
            className={`pb-3 font-semibold text-sm flex items-center gap-2 border-b-2 transition-colors cursor-pointer ${activeTab === 'export' ? 'border-blue-600 text-blue-600' : 'border-transparent text-neutral-500 hover:text-neutral-900'}`}
          >
            <Globe className="w-4 h-4" />
            <span>HTML Folder Export</span>
          </button>
        </div>

        {activeTab === 'duplicates' && (
          <div>
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-neutral-100 mb-8 flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-col">
                  <span className="text-neutral-900 font-semibold text-base">Duplicate Files Detector</span>
                  <span className="text-xs text-neutral-500 mt-0.5">
                    {totalScanned > 0 ? `Scanned ${totalScanned} files across your Google Drive` : 'Scans MD5 checksums to reclaim wasted space.'}
                  </span>
              </div>
              <div className="flex gap-3 items-center flex-wrap">
                {duplicates.length > 0 && (
                  <button 
                    onClick={requestDeleteAllDuplicates}
                    disabled={deletingFileIds.size > 0 || loading}
                    className="text-sm font-semibold text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 px-4 py-2.5 rounded-xl transition-colors disabled:opacity-50 cursor-pointer"
                  >
                      {deletingFileIds.size > 0 ? 'Deleting...' : `Delete All (${formatBytes(totalReclaimableBytes)})`}
                  </button>
                )}
                <button 
                  onClick={() => scan(accessToken!)} 
                  className="bg-neutral-900 hover:bg-neutral-800 text-white px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors flex items-center justify-center min-h-[42px] cursor-pointer" 
                  disabled={loading}
                >
                  {loading ? 'Scanning...' : 'Scan Duplicates'}
                </button>
              </div>
            </div>

            {duplicates.length === 0 && !loading && (
              <div className="text-center py-20 bg-white rounded-2xl shadow-sm border border-neutral-100 flex flex-col items-center">
                <CheckCircle className="w-16 h-16 text-emerald-500 mb-4" />
                <h3 className="text-xl font-semibold text-neutral-900">Your Drive is Clean!</h3>
                <p className="text-neutral-500 mt-2">Click "Scan Duplicates" above to check for redundant files.</p>
              </div>
            )}

            {duplicates.map((group, i) => (
              <div key={i} className="bg-white p-6 rounded-2xl shadow-sm border border-neutral-100 mb-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                  <h2 className="text-base font-semibold text-neutral-900">Duplicate Group {i+1} ({group.length} files)</h2>
                  <button 
                    onClick={() => requestDeleteGroupExceptNewest(group, i)} 
                    className="text-xs bg-orange-50 hover:bg-orange-100 text-orange-700 font-semibold px-3.5 py-2 rounded-lg transition-colors cursor-pointer"
                  >
                    Keep Newest, Delete Rest
                  </button>
                </div>
                <div className="space-y-3">
                  {group.map((file: any, index: number) => (
                    <div key={file.id} className="flex items-center justify-between gap-4 p-3 bg-neutral-50 rounded-xl">
                      <div className="flex flex-col truncate">
                        <span className="text-sm font-medium text-neutral-900 truncate">{file.name}</span>
                        <div className="flex items-center gap-3 mt-0.5">
                          {index === 0 && <span className="text-xs text-emerald-600 font-semibold bg-emerald-50 px-2 py-0.5 rounded">Newest Copy</span>}
                          <span className="text-xs text-neutral-500">{file.size ? formatBytes(Number(file.size)) : 'Unknown size'}</span>
                        </div>
                      </div>
                      <button 
                        onClick={() => requestDeleteSingleFile(file)} 
                        className="text-xs font-semibold text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 px-3 py-2 rounded-lg transition-colors shrink-0 disabled:opacity-50 cursor-pointer"
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
        )}

        {activeTab === 'insights' && (
          <div className="space-y-6">
            {loadingInsights && !insights && (
              <div className="text-center py-20 bg-white rounded-2xl shadow-sm border border-neutral-100">
                <p className="text-neutral-500">Analyzing your Google Drive storage quota and files...</p>
              </div>
            )}

            {insights && (
              <>
                {/* Quota Card */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-neutral-100 space-y-4">
                  <h3 className="text-base font-semibold text-neutral-900">Storage Quota</h3>
                  {insights.storageQuota ? (() => {
                    const limit = Number(insights.storageQuota.limit || 0);
                    const usage = Number(insights.storageQuota.usageInDrive || 0);
                    const pct = limit > 0 ? Math.min(100, Math.round((usage / limit) * 100)) : 0;
                    return (
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm text-neutral-600 font-medium">
                          <span>Used: {formatBytes(usage)}</span>
                          <span>Limit: {limit > 0 ? formatBytes(limit) : 'Unlimited'}</span>
                        </div>
                        <div className="w-full bg-neutral-100 h-3 rounded-full overflow-hidden">
                          <div className="bg-blue-600 h-full rounded-full transition-all duration-500" style={{ width: `${pct}%` }}></div>
                        </div>
                        <p className="text-xs text-neutral-500">{pct}% of total storage used in Google Drive ({insights.totalFiles} files analyzed)</p>
                      </div>
                    );
                  })() : (
                    <p className="text-sm text-neutral-500">Storage quota information unavailable.</p>
                  )}
                </div>

                {/* File Type Breakdown & Chart */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="bg-white p-6 rounded-2xl shadow-sm border border-neutral-100 flex flex-col items-center justify-center">
                    <h3 className="text-base font-semibold text-neutral-900 w-full text-left mb-4">Storage by File Type</h3>
                    {pieData.length > 0 ? (
                      <div className="w-full h-64">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={pieData}
                              dataKey="size"
                              nameKey="name"
                              cx="50%"
                              cy="50%"
                              outerRadius={80}
                              innerRadius={45}
                              paddingAngle={4}
                            >
                              {pieData.map((_, index) => (
                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                              ))}
                            </Pie>
                            <Tooltip formatter={(value: any) => formatBytes(Number(value))} />
                            <Legend />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                    ) : (
                      <p className="text-sm text-neutral-500 py-10">No file data available.</p>
                    )}
                  </div>

                  {/* Largest Files */}
                  <div className="bg-white p-6 rounded-2xl shadow-sm border border-neutral-100">
                    <h3 className="text-base font-semibold text-neutral-900 mb-4">Top 10 Largest Files</h3>
                    <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
                      {insights.largestFiles && insights.largestFiles.map((file: any) => (
                        <div key={file.id} className="flex items-center justify-between text-sm py-1.5 border-b border-neutral-100 last:border-0">
                          <span className="font-medium text-neutral-800 truncate max-w-[200px]" title={file.name}>{file.name}</span>
                          <span className="text-neutral-500 font-mono text-xs">{formatBytes(Number(file.size || 0))}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {activeTab === 'export' && (
          <div className="space-y-6">
            <div className="bg-white p-6 sm:p-8 rounded-2xl shadow-sm border border-neutral-100 space-y-6">
              
              {/* Header */}
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-neutral-100 pb-6">
                <div>
                  <h3 className="text-xl font-bold text-neutral-900">Google Drive Export Studio (Blogger HTML, HTML, PDF)</h3>
                  <p className="text-sm text-neutral-500 mt-1">
                    Pick any specific folder or export your entire Google Drive as a Blogger snippet, standalone HTML page, or PDF document catalog.
                  </p>
                </div>
                <div className="flex items-center gap-2.5 shrink-0 flex-wrap sm:flex-nowrap">
                  <button
                    onClick={() => handleOpenExportModal('all', 'blogger')}
                    disabled={loadingAllFiles}
                    className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-3.5 py-2.5 rounded-xl shadow-xs transition-colors flex items-center justify-center gap-2 text-xs cursor-pointer disabled:opacity-50"
                  >
                    <Globe className="w-4 h-4" />
                    <span>Blogger HTML</span>
                  </button>
                  <button
                    onClick={() => handleOpenExportModal('all', 'html')}
                    disabled={loadingAllFiles}
                    className="bg-neutral-800 hover:bg-neutral-900 text-white font-semibold px-3.5 py-2.5 rounded-xl shadow-xs transition-colors flex items-center justify-center gap-2 text-xs cursor-pointer disabled:opacity-50"
                  >
                    <Code className="w-4 h-4" />
                    <span>HTML Webpage</span>
                  </button>
                  <button
                    onClick={() => handleOpenExportModal('all', 'pdf')}
                    disabled={loadingAllFiles}
                    className="bg-red-600 hover:bg-red-700 text-white font-semibold px-3.5 py-2.5 rounded-xl shadow-xs transition-colors flex items-center justify-center gap-2 text-xs cursor-pointer disabled:opacity-50"
                  >
                    <FileText className="w-4 h-4" />
                    <span>PDF Document</span>
                  </button>
                </div>
              </div>

              {/* Feature Highlights Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 rounded-xl bg-blue-50/60 border border-blue-100/80 space-y-1.5">
                  <div className="flex items-center gap-2 text-blue-700 font-semibold text-sm">
                    <Globe className="w-4 h-4" />
                    <span>Public URLs & Direct Links</span>
                  </div>
                  <p className="text-xs text-neutral-600 leading-relaxed">
                    Generates public view links, folder links, and 1-click direct download URLs for all files.
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-emerald-50/60 border border-emerald-100/80 space-y-1.5">
                  <div className="flex items-center gap-2 text-emerald-700 font-semibold text-sm">
                    <Eye className="w-4 h-4" />
                    <span>Interactive Embeds</span>
                  </div>
                  <p className="text-xs text-neutral-600 leading-relaxed">
                    Embed previews for Google Docs, Sheets, Slides, PDFs, Videos, and Images with expandable toggles.
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-indigo-50/60 border border-indigo-100/80 space-y-1.5">
                  <div className="flex items-center gap-2 text-indigo-700 font-semibold text-sm">
                    <Code className="w-4 h-4" />
                    <span>Blogger Safe & SEO Ready</span>
                  </div>
                  <p className="text-xs text-neutral-600 leading-relaxed">
                    Zero style bleeding with scoped CSS rules, schema.org JSON-LD structured data, and search bar.
                  </p>
                </div>
              </div>

              {/* Folder Selector Explorer Section */}
              <div className="space-y-4 pt-2">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h4 className="text-base font-bold text-neutral-900 flex items-center gap-2">
                      <Folder className="w-5 h-5 text-blue-600" />
                      <span>Select Folder to Build HTML Directory</span>
                    </h4>
                    <p className="text-xs text-neutral-500 mt-0.5">
                      Choose a folder below to export only its contents, or use the entire drive.
                    </p>
                  </div>
                  
                  {/* Folder Search input */}
                  {driveFolders.length > 3 && (
                    <div className="relative w-full sm:w-64">
                      <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
                      <input
                        type="text"
                        value={folderSearchFilter}
                        onChange={(e) => setFolderSearchFilter(e.target.value)}
                        placeholder="Filter folders..."
                        className="w-full pl-9 pr-3 py-1.5 text-xs border border-neutral-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                      />
                    </div>
                  )}
                </div>

                {/* Folder Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  
                  {/* Root / All Files Card */}
                  <div className="p-4 rounded-xl border border-blue-200 bg-blue-50/40 hover:bg-blue-50/70 transition-all flex items-center justify-between gap-3 group">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="p-2.5 rounded-lg bg-blue-600 text-white shadow-xs">
                        <HardDrive className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <span className="text-sm font-bold text-neutral-900 block truncate">
                          Entire Google Drive
                        </span>
                        <span className="text-xs text-neutral-500 block">
                          {allFiles.length} total files and subfolders
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => handleOpenExportModal('all', 'blogger')}
                        disabled={loadingAllFiles}
                        className="px-2.5 py-1.5 text-xs font-semibold text-blue-700 bg-white hover:bg-blue-600 hover:text-white border border-blue-200 rounded-lg transition-colors shadow-xs cursor-pointer"
                        title="Export as Blogger HTML"
                      >
                        Blogger
                      </button>
                      <button
                        onClick={() => handleOpenExportModal('all', 'html')}
                        disabled={loadingAllFiles}
                        className="px-2.5 py-1.5 text-xs font-semibold text-neutral-700 bg-white hover:bg-neutral-800 hover:text-white border border-neutral-300 rounded-lg transition-colors shadow-xs cursor-pointer"
                        title="Export as Standalone HTML"
                      >
                        HTML
                      </button>
                      <button
                        onClick={() => handleOpenExportModal('all', 'pdf')}
                        disabled={loadingAllFiles}
                        className="px-2.5 py-1.5 text-xs font-semibold text-red-700 bg-white hover:bg-red-600 hover:text-white border border-red-200 rounded-lg transition-colors shadow-xs cursor-pointer"
                        title="Export as PDF Document"
                      >
                        PDF
                      </button>
                    </div>
                  </div>

                  {/* Individual Folder Cards */}
                  {filteredDriveFolders.map(folder => (
                    <div 
                      key={folder.id}
                      className="p-4 rounded-xl border border-neutral-200 hover:border-blue-300 hover:bg-neutral-50/70 transition-all flex items-center justify-between gap-3 group bg-white shadow-xs"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="p-2.5 rounded-lg bg-amber-50 text-amber-600 border border-amber-100 group-hover:bg-blue-50 group-hover:text-blue-600 group-hover:border-blue-100 transition-colors">
                          <Folder className="w-5 h-5" />
                        </div>
                        <div className="min-w-0">
                          <span className="text-sm font-semibold text-neutral-900 block truncate" title={folder.name}>
                            {folder.name}
                          </span>
                          <span className="text-xs text-neutral-500 block truncate font-mono text-[11px]" title={folder.path}>
                            {folder.path}
                          </span>
                          <span className="text-[11px] text-neutral-400 mt-0.5 block">
                            {folder.itemCount} items &bull; {formatBytes(folder.totalBytes)}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() => handleOpenExportModal(folder.id, 'blogger')}
                          disabled={loadingAllFiles}
                          className="px-2.5 py-1.5 text-xs font-semibold text-neutral-700 hover:text-blue-600 bg-neutral-100 hover:bg-blue-50 hover:border-blue-200 border border-transparent rounded-lg transition-colors cursor-pointer"
                          title="Export as Blogger HTML"
                        >
                          Blogger
                        </button>
                        <button
                          onClick={() => handleOpenExportModal(folder.id, 'html')}
                          disabled={loadingAllFiles}
                          className="px-2.5 py-1.5 text-xs font-semibold text-neutral-700 hover:text-neutral-900 bg-neutral-100 hover:bg-neutral-200 border border-transparent rounded-lg transition-colors cursor-pointer"
                          title="Export as Standalone HTML"
                        >
                          HTML
                        </button>
                        <button
                          onClick={() => handleOpenExportModal(folder.id, 'pdf')}
                          disabled={loadingAllFiles}
                          className="px-2.5 py-1.5 text-xs font-semibold text-red-700 hover:text-red-800 bg-red-50 hover:bg-red-100 border border-transparent rounded-lg transition-colors cursor-pointer"
                          title="Export as PDF Document"
                        >
                          PDF
                        </button>
                      </div>
                    </div>
                  ))}

                  {driveFolders.length === 0 && !loadingAllFiles && (
                    <div className="col-span-full py-8 text-center bg-neutral-50 rounded-xl border border-neutral-200/80 space-y-2">
                      <Folder className="w-8 h-8 text-neutral-400 mx-auto" />
                      <p className="text-sm text-neutral-600 font-medium">No custom folders found yet</p>
                      <p className="text-xs text-neutral-400">Click "Open Export Studio" to export all files from your drive root.</p>
                      <button
                        onClick={() => fetchAllFiles()}
                        className="px-3 py-1.5 bg-white text-xs font-semibold text-neutral-700 border border-neutral-300 rounded-lg hover:bg-neutral-50 cursor-pointer"
                      >
                        Refresh Directory
                      </button>
                    </div>
                  )}

                  {filteredDriveFolders.length === 0 && driveFolders.length > 0 && (
                    <div className="col-span-full py-6 text-center text-xs text-neutral-500 bg-neutral-50 rounded-xl">
                      No folders matching "{folderSearchFilter}"
                    </div>
                  )}
                </div>
              </div>

              {/* Status / Quick Preview */}
              <div className="bg-neutral-50 rounded-xl p-5 border border-neutral-200 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="text-sm text-neutral-700">
                  <span className="font-semibold text-neutral-900">
                    {allFiles.length > 0 ? `${allFiles.length} items loaded across ${driveFolders.length} folders` : 'Click below to prepare files for export'}
                  </span>
                  <p className="text-xs text-neutral-500 mt-0.5">
                    Includes all folders, subfolders, documents, spreadsheets, media, and archives.
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => fetchAllFiles()}
                    disabled={loadingAllFiles}
                    className="px-4 py-2 bg-white hover:bg-neutral-100 text-neutral-700 font-medium text-xs rounded-lg border border-neutral-300 transition-colors cursor-pointer"
                  >
                    {loadingAllFiles ? 'Refreshing...' : 'Refresh Files'}
                  </button>
                  <button
                    onClick={() => handleOpenExportModal('all')}
                    disabled={loadingAllFiles}
                    className="px-4 py-2 bg-neutral-900 hover:bg-neutral-800 text-white font-medium text-xs rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Open Export Studio</span>
                  </button>
                </div>
              </div>

            </div>
          </div>
        )}
      </div>

      {/* Explicit User Confirmation Dialog for File Deletions (Workspace Compliance) */}
      {pendingDelete && (
        <div className="fixed inset-0 bg-neutral-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-xl border border-neutral-200 max-w-md w-full p-6 space-y-4">
            <div className="flex items-center gap-3 text-red-600">
              <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-bold text-neutral-900">{pendingDelete.title}</h3>
            </div>

            <p className="text-sm text-neutral-600 leading-relaxed">
              {pendingDelete.description}
            </p>

            {pendingDelete.fileNames && pendingDelete.fileNames.length > 0 && (
              <div className="bg-neutral-50 rounded-xl p-3 max-h-32 overflow-y-auto text-xs font-mono text-neutral-700 space-y-1">
                {pendingDelete.fileNames.map((name, idx) => (
                  <div key={idx} className="truncate">• {name}</div>
                ))}
                {pendingDelete.fileIds.length > pendingDelete.fileNames.length && (
                  <div className="text-neutral-500 italic">
                    ...and {pendingDelete.fileIds.length - pendingDelete.fileNames.length} more files
                  </div>
                )}
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setPendingDelete(null)}
                className="px-4 py-2.5 rounded-xl border border-neutral-200 text-neutral-700 text-sm font-semibold hover:bg-neutral-50 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={executeConfirmedDelete}
                className="px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-semibold transition-colors shadow-xs cursor-pointer"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}

      <ExportModal 
        isOpen={exportModalOpen}
        onClose={() => setExportModalOpen(false)}
        files={allFiles}
        userEmail={user?.email || undefined}
        initialFolderId={selectedFolderForExport}
        initialFormat={exportFormatForModal}
      />
    </div>
  );
}

