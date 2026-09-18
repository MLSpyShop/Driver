import { useState, useMemo, useEffect } from 'react';
import { 
  X, 
  Download, 
  Copy, 
  Check, 
  Eye, 
  Code, 
  Globe, 
  Sparkles, 
  Search,
  FileCheck,
  Folder,
  FolderOpen,
  Layers,
  ChevronRight,
  HardDrive,
  FileText,
  FileCode,
  ExternalLink,
  Sliders,
  Printer,
  FileType
} from 'lucide-react';
import { 
  DriveFileItem, 
  getDriveFolders,
  filterFilesByFolder,
  generateBloggerHtmlSnippet, 
  generateStandaloneHtmlDocument,
  getEmbedUrl,
  getFileEmbedCode,
  FolderMeta
} from '../htmlExporter';
import { generatePdfDocument, printDirectoryReport } from '../pdfExporter';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  files: DriveFileItem[];
  userEmail?: string;
  initialFolderId?: string;
  initialFormat?: 'blogger' | 'html' | 'pdf';
}

const formatBytes = (bytes: number): string => {
  if (!bytes || bytes === 0) return '0 B';
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
};

const getFileBadgeInfo = (mimeType: string) => {
  if (mimeType.includes('document') || mimeType.includes('word') || mimeType.includes('text/plain')) {
    return { icon: '📝', label: 'Google Doc', color: '#2563eb', bg: '#eff6ff' };
  }
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel') || mimeType.includes('csv')) {
    return { icon: '📊', label: 'Google Sheet', color: '#16a34a', bg: '#f0fdf4' };
  }
  if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) {
    return { icon: '📽️', label: 'Google Slides', color: '#ea580c', bg: '#fff7ed' };
  }
  if (mimeType.includes('pdf')) {
    return { icon: '📕', label: 'PDF Document', color: '#dc2626', bg: '#fef2f2' };
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
  if (mimeType.includes('form')) {
    return { icon: '📋', label: 'Google Form', color: '#7c3aed', bg: '#f5f3ff' };
  }
  return { icon: '📄', label: 'Document', color: '#4b5563', bg: '#f3f4f6' };
};

export function ExportModal({ 
  isOpen, 
  onClose, 
  files, 
  userEmail,
  initialFolderId = 'all',
  initialFormat = 'blogger'
}: ExportModalProps) {
  const [activeTab, setActiveTab] = useState<'options' | 'embeds' | 'preview' | 'code'>('options');
  const [exportFormat, setExportFormat] = useState<'blogger' | 'html' | 'pdf'>(initialFormat);
  const [selectedFolderId, setSelectedFolderId] = useState<string>(initialFolderId);
  const [folderSearchQuery, setFolderSearchQuery] = useState('');
  
  // Custom metadata fields
  const [title, setTitle] = useState('Google Drive Resource & Folder Directory');
  const [description, setDescription] = useState('Explore our public archive of documents, media, and downloadable files directly hosted on Google Drive.');
  const [includeEmbeds, setIncludeEmbeds] = useState(true);
  const [includeSearch, setIncludeSearch] = useState(true);
  const [copied, setCopied] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);

  // Embeds Tab specific state
  const [embedSearchQuery, setEmbedSearchQuery] = useState('');
  const [embedTypeFilter, setEmbedTypeFilter] = useState<'all' | 'doc' | 'sheet' | 'slide' | 'pdf' | 'media'>('all');
  const [embedStyle, setEmbedStyle] = useState<'responsive' | 'standard'>('standard');
  const [embedHeight, setEmbedHeight] = useState<'360px' | '480px' | '600px'>('480px');
  const [copiedEmbedFileId, setCopiedEmbedFileId] = useState<string | null>(null);
  const [previewingEmbedFileId, setPreviewingEmbedFileId] = useState<string | null>(null);
  const [copiedAllEmbeds, setCopiedAllEmbeds] = useState(false);

  // Sync initialFolderId and initialFormat when modal opens
  useEffect(() => {
    if (isOpen) {
      setSelectedFolderId(initialFolderId || 'all');
      setExportFormat(initialFormat || 'blogger');
    }
  }, [isOpen, initialFolderId, initialFormat]);

  // Extract all folders with stats
  const folderOptions = useMemo(() => {
    return getDriveFolders(files);
  }, [files]);

  // Filtered folders by search query
  const displayedFolders = useMemo(() => {
    if (!folderSearchQuery.trim()) return folderOptions;
    const q = folderSearchQuery.toLowerCase();
    return folderOptions.filter(f => 
      f.name.toLowerCase().includes(q) || f.path.toLowerCase().includes(q)
    );
  }, [folderOptions, folderSearchQuery]);

  // Find currently selected folder meta
  const selectedFolderMeta = useMemo(() => {
    if (selectedFolderId === 'all' || !selectedFolderId) return null;
    return folderOptions.find(f => f.id === selectedFolderId) || null;
  }, [folderOptions, selectedFolderId]);

  // Target files subset based on folder choice
  const { filteredFiles, selectedFolder } = useMemo(() => {
    return filterFilesByFolder(files, selectedFolderId);
  }, [files, selectedFolderId]);

  // Extract all embeddable files within the chosen scope
  const embeddableFiles = useMemo(() => {
    return filteredFiles.filter(f => f.mimeType !== 'application/vnd.google-apps.folder' && getEmbedUrl(f) !== null);
  }, [filteredFiles]);

  // Filter embeddable files based on search & category
  const displayedEmbedFiles = useMemo(() => {
    return embeddableFiles.filter(file => {
      // Category filter
      if (embedTypeFilter === 'doc' && !(file.mimeType.includes('document') || file.mimeType.includes('text'))) return false;
      if (embedTypeFilter === 'sheet' && !(file.mimeType.includes('spreadsheet') || file.mimeType.includes('excel') || file.mimeType.includes('csv'))) return false;
      if (embedTypeFilter === 'slide' && !(file.mimeType.includes('presentation') || file.mimeType.includes('powerpoint'))) return false;
      if (embedTypeFilter === 'pdf' && !file.mimeType.includes('pdf')) return false;
      if (embedTypeFilter === 'media' && !(file.mimeType.includes('image/') || file.mimeType.includes('video/') || file.mimeType.includes('audio/'))) return false;

      // Text query
      if (embedSearchQuery.trim()) {
        const q = embedSearchQuery.toLowerCase();
        return file.name.toLowerCase().includes(q);
      }
      return true;
    });
  }, [embeddableFiles, embedTypeFilter, embedSearchQuery]);

  // Auto-suggest title and description when folder changes
  const handleSelectFolder = (folderId: string) => {
    setSelectedFolderId(folderId);
    if (folderId === 'all') {
      setTitle('Google Drive Resource & Folder Directory');
      setDescription('Explore our public archive of documents, media, and downloadable files directly hosted on Google Drive.');
    } else {
      const folder = folderOptions.find(f => f.id === folderId);
      if (folder) {
        setTitle(`${folder.name} - Google Drive Directory`);
        setDescription(`Public directory of files, subfolders, and resources inside "${folder.name}" on Google Drive.`);
      }
    }
  };

  const exportOptions = useMemo(() => ({
    title,
    description,
    includeEmbeds,
    includeSearch,
    authorEmail: userEmail,
    selectedFolderId,
    selectedFolderName: selectedFolder?.name
  }), [title, description, includeEmbeds, includeSearch, userEmail, selectedFolderId, selectedFolder]);

  const bloggerSnippet = useMemo(() => {
    if (!isOpen) return '';
    return generateBloggerHtmlSnippet(filteredFiles, exportOptions);
  }, [filteredFiles, exportOptions, isOpen]);

  const fullHtml = useMemo(() => {
    if (!isOpen) return '';
    return generateStandaloneHtmlDocument(filteredFiles, exportOptions);
  }, [filteredFiles, exportOptions, isOpen]);

  if (!isOpen) return null;

  const handleCopyCode = async () => {
    const textToCopy = exportFormat === 'blogger' ? bloggerSnippet : fullHtml;
    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (err) {
      console.error('Failed to copy code', err);
    }
  };

  const handleDownloadBloggerSnippet = () => {
    const blob = new Blob([bloggerSnippet], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const safeTitle = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    a.download = `${safeTitle || 'blogger-directory'}-${new Date().toISOString().slice(0, 10)}.blogger.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDownloadHtml = () => {
    const blob = new Blob([fullHtml], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const safeTitle = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    a.download = `${safeTitle || 'google-drive-directory'}-${new Date().toISOString().slice(0, 10)}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDownloadPdf = () => {
    try {
      setGeneratingPdf(true);
      const doc = generatePdfDocument(filteredFiles, exportOptions);
      const safeTitle = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      doc.save(`${safeTitle || 'drive-directory'}-${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (err) {
      console.error('Failed to generate PDF', err);
    } finally {
      setGeneratingPdf(false);
    }
  };

  const handlePrintPdf = () => {
    printDirectoryReport(filteredFiles, exportOptions);
  };

  const handleCopySingleEmbedCode = async (file: DriveFileItem) => {
    const code = getFileEmbedCode(file, {
      height: embedHeight,
      responsive: embedStyle === 'responsive'
    });
    try {
      await navigator.clipboard.writeText(code);
      setCopiedEmbedFileId(file.id);
      setTimeout(() => setCopiedEmbedFileId(null), 2200);
    } catch (err) {
      console.error('Failed to copy embed code', err);
    }
  };

  const handleCopyAllEmbeds = async () => {
    const allEmbedCodes = displayedEmbedFiles.map(file => {
      const code = getFileEmbedCode(file, {
        height: embedHeight,
        responsive: embedStyle === 'responsive'
      });
      return `<!-- Embed for: ${file.name} -->\n<h3>${file.name}</h3>\n${code}\n`;
    }).join('\n');

    try {
      await navigator.clipboard.writeText(allEmbedCodes);
      setCopiedAllEmbeds(true);
      setTimeout(() => setCopiedAllEmbeds(false), 2500);
    } catch (err) {
      console.error('Failed to copy all embeds', err);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-900/60 backdrop-blur-xs">
      <div className="bg-white w-full max-w-5xl rounded-2xl shadow-2xl border border-neutral-200 flex flex-col max-h-[92vh] overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-neutral-100 flex items-center justify-between bg-neutral-50/70">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white shadow-xs">
              <Globe className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-neutral-900 leading-tight">Export Google Drive Directory</h2>
              <p className="text-xs text-neutral-500">Choose Blogger HTML, Standalone HTML, or PDF Document &bull; Embeds &amp; Direct Downloads</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 rounded-lg transition-colors cursor-pointer"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Buttons */}
        <div className="px-6 border-b border-neutral-200 flex gap-6 bg-white shrink-0 overflow-x-auto">
          <button
            onClick={() => setActiveTab('options')}
            className={`py-3 text-sm font-semibold flex items-center gap-2 border-b-2 transition-colors cursor-pointer shrink-0 ${
              activeTab === 'options' 
                ? 'border-blue-600 text-blue-600' 
                : 'border-transparent text-neutral-500 hover:text-neutral-900'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            <span>Export Format &amp; Scope</span>
          </button>

          <button
            onClick={() => setActiveTab('embeds')}
            className={`py-3 text-sm font-semibold flex items-center gap-2 border-b-2 transition-colors cursor-pointer shrink-0 ${
              activeTab === 'embeds' 
                ? 'border-blue-600 text-blue-600' 
                : 'border-transparent text-neutral-500 hover:text-neutral-900'
            }`}
          >
            <FileCode className="w-4 h-4" />
            <span>Embed Documents (HTML Code)</span>
            <span className="px-1.5 py-0.5 text-[11px] font-bold rounded-full bg-blue-100 text-blue-700">
              {embeddableFiles.length}
            </span>
          </button>
          
          <button
            onClick={() => setActiveTab('preview')}
            className={`py-3 text-sm font-semibold flex items-center gap-2 border-b-2 transition-colors cursor-pointer shrink-0 ${
              activeTab === 'preview' 
                ? 'border-blue-600 text-blue-600' 
                : 'border-transparent text-neutral-500 hover:text-neutral-900'
            }`}
          >
            <Eye className="w-4 h-4" />
            <span>Live Interactive Preview</span>
          </button>

          <button
            onClick={() => setActiveTab('code')}
            className={`py-3 text-sm font-semibold flex items-center gap-2 border-b-2 transition-colors cursor-pointer shrink-0 ${
              activeTab === 'code' 
                ? 'border-blue-600 text-blue-600' 
                : 'border-transparent text-neutral-500 hover:text-neutral-900'
            }`}
          >
            <Code className="w-4 h-4" />
            <span>Generated Source Code</span>
          </button>
        </div>

        {/* Body Content */}
        <div className="flex-1 overflow-y-auto p-6 bg-neutral-50/50">
          
          {/* TAB 1: OPTIONS & FORMAT SELECTION */}
          {activeTab === 'options' && (
            <div className="space-y-6">
              
              {/* Format Selector Cards */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold text-neutral-900 flex items-center gap-2">
                    <FileType className="w-4 h-4 text-blue-600" />
                    <span>Select Export Format:</span>
                  </h4>
                  <span className="text-xs text-neutral-500">
                    Scope: <strong>{selectedFolderMeta ? selectedFolderMeta.name : 'Entire Drive'}</strong> ({filteredFiles.length} items)
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
                  
                  {/* Option 1: Blogger HTML */}
                  <div
                    onClick={() => setExportFormat('blogger')}
                    className={`p-4 rounded-xl border-2 transition-all cursor-pointer flex flex-col justify-between space-y-3 ${
                      exportFormat === 'blogger'
                        ? 'border-blue-600 bg-blue-50/70 shadow-xs'
                        : 'border-neutral-200 bg-white hover:border-neutral-300 hover:bg-neutral-50'
                    }`}
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">🌐</span>
                          <span className="text-sm font-bold text-neutral-900">Blogger HTML</span>
                        </div>
                        {exportFormat === 'blogger' && (
                          <span className="text-[10px] font-bold uppercase bg-blue-600 text-white px-2 py-0.5 rounded-full">
                            Active
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-neutral-600 leading-relaxed">
                        Scoped HTML snippet with non-destructive CSS. Paste directly into Blogger post/page HTML editor.
                      </p>
                    </div>
                    <div className="flex items-center gap-2 pt-2 border-t border-neutral-200/60">
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setExportFormat('blogger'); handleCopyCode(); }}
                        className="flex-1 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy Code</span>
                      </button>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); handleDownloadBloggerSnippet(); }}
                        className="p-1.5 text-xs font-semibold text-neutral-700 bg-neutral-100 hover:bg-neutral-200 rounded-lg transition-colors cursor-pointer"
                        title="Download .blogger.html"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Option 2: Standalone HTML */}
                  <div
                    onClick={() => setExportFormat('html')}
                    className={`p-4 rounded-xl border-2 transition-all cursor-pointer flex flex-col justify-between space-y-3 ${
                      exportFormat === 'html'
                        ? 'border-blue-600 bg-blue-50/70 shadow-xs'
                        : 'border-neutral-200 bg-white hover:border-neutral-300 hover:bg-neutral-50'
                    }`}
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">📄</span>
                          <span className="text-sm font-bold text-neutral-900">Standalone HTML</span>
                        </div>
                        {exportFormat === 'html' && (
                          <span className="text-[10px] font-bold uppercase bg-blue-600 text-white px-2 py-0.5 rounded-full">
                            Active
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-neutral-600 leading-relaxed">
                        Complete HTML5 web page with SEO metadata, OpenGraph tags, schema JSON-LD, and responsive layout.
                      </p>
                    </div>
                    <div className="flex items-center gap-2 pt-2 border-t border-neutral-200/60">
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); handleDownloadHtml(); }}
                        className="flex-1 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Download HTML</span>
                      </button>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setExportFormat('html'); handleCopyCode(); }}
                        className="p-1.5 text-xs font-semibold text-neutral-700 bg-neutral-100 hover:bg-neutral-200 rounded-lg transition-colors cursor-pointer"
                        title="Copy Full HTML"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Option 3: PDF Document */}
                  <div
                    onClick={() => setExportFormat('pdf')}
                    className={`p-4 rounded-xl border-2 transition-all cursor-pointer flex flex-col justify-between space-y-3 ${
                      exportFormat === 'pdf'
                        ? 'border-blue-600 bg-blue-50/70 shadow-xs'
                        : 'border-neutral-200 bg-white hover:border-neutral-300 hover:bg-neutral-50'
                    }`}
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">📕</span>
                          <span className="text-sm font-bold text-neutral-900">PDF Document</span>
                        </div>
                        {exportFormat === 'pdf' && (
                          <span className="text-[10px] font-bold uppercase bg-blue-600 text-white px-2 py-0.5 rounded-full">
                            Active
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-neutral-600 leading-relaxed">
                        Multi-page PDF catalog with tree hierarchy, storage stats, and clickable direct Drive links.
                      </p>
                    </div>
                    <div className="flex items-center gap-2 pt-2 border-t border-neutral-200/60">
                      <button
                        type="button"
                        disabled={generatingPdf}
                        onClick={(e) => { e.stopPropagation(); handleDownloadPdf(); }}
                        className="flex-1 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>{generatingPdf ? 'Building PDF...' : 'Download PDF'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); handlePrintPdf(); }}
                        className="p-1.5 text-xs font-semibold text-neutral-700 bg-neutral-100 hover:bg-neutral-200 rounded-lg transition-colors cursor-pointer"
                        title="Print / Save as PDF"
                      >
                        <Printer className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                </div>
              </div>

              {/* 1. Folder Selection Section */}
              <div className="bg-white p-6 rounded-xl border border-neutral-200 shadow-xs space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-neutral-100 pb-3">
                  <div>
                    <h4 className="text-sm font-bold text-neutral-900 flex items-center gap-2">
                      <Folder className="w-4 h-4 text-blue-600" />
                      <span>Choose Folder or Entire Drive to Export</span>
                    </h4>
                    <p className="text-xs text-neutral-500 mt-0.5">
                      Select a specific folder or export all files across your entire Google Drive.
                    </p>
                  </div>
                  <div className="text-xs text-neutral-600 font-medium bg-neutral-100 px-2.5 py-1 rounded-lg w-fit">
                    {folderOptions.length} folders detected
                  </div>
                </div>

                {/* Folder search & Quick options */}
                <div className="space-y-3">
                  {folderOptions.length > 5 && (
                    <div className="relative">
                      <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
                      <input
                        type="text"
                        value={folderSearchQuery}
                        onChange={(e) => setFolderSearchQuery(e.target.value)}
                        placeholder="Search folders by name or path..."
                        className="w-full pl-9 pr-3.5 py-2 text-xs border border-neutral-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                      />
                    </div>
                  )}

                  <div className="grid grid-cols-1 gap-2 max-h-56 overflow-y-auto pr-1">
                    {/* Entire Drive Option */}
                    <div
                      onClick={() => handleSelectFolder('all')}
                      className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                        selectedFolderId === 'all'
                          ? 'border-blue-600 bg-blue-50/70 text-blue-900 ring-1 ring-blue-600'
                          : 'border-neutral-200 hover:border-neutral-300 hover:bg-neutral-50 text-neutral-700'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`p-2 rounded-lg ${selectedFolderId === 'all' ? 'bg-blue-600 text-white' : 'bg-neutral-100 text-neutral-600'}`}>
                          <HardDrive className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <span className="text-sm font-bold block truncate">Entire Google Drive (All Files &amp; Folders)</span>
                          <span className="text-xs text-neutral-500 block">Complete root hierarchy and all subdirectories</span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="text-xs font-semibold text-neutral-900 block">{files.length} items</span>
                        <span className="text-[11px] text-neutral-500">Root Drive</span>
                      </div>
                    </div>

                    {/* Individual Folder Options */}
                    {displayedFolders.map((folder) => {
                      const isSelected = selectedFolderId === folder.id;
                      return (
                        <div
                          key={folder.id}
                          onClick={() => handleSelectFolder(folder.id)}
                          className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                            isSelected
                              ? 'border-blue-600 bg-blue-50/70 text-blue-900 ring-1 ring-blue-600'
                              : 'border-neutral-200 hover:border-neutral-300 hover:bg-neutral-50 text-neutral-700'
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className={`p-2 rounded-lg ${isSelected ? 'bg-blue-600 text-white' : 'bg-amber-50 text-amber-600'}`}>
                              {isSelected ? <FolderOpen className="w-4 h-4" /> : <Folder className="w-4 h-4" />}
                            </div>
                            <div className="min-w-0">
                              <span className="text-sm font-semibold block truncate text-neutral-900">{folder.name}</span>
                              <span className="text-xs text-neutral-500 block truncate font-mono text-[11px]">
                                {folder.path}
                              </span>
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <span className="text-xs font-semibold text-neutral-900 block">
                              {folder.itemCount} items
                            </span>
                            <span className="text-[11px] text-neutral-500 block">
                              {formatBytes(folder.totalBytes)}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* 2. Metadata & Features Settings */}
              <div className="bg-white p-6 rounded-xl border border-neutral-200 shadow-xs space-y-4">
                <h4 className="text-sm font-bold text-neutral-900 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-indigo-600" />
                  <span>Directory Title, Description &amp; Embeds</span>
                </h4>

                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 mb-1">
                      Directory Page Title
                    </label>
                    <input
                      type="text"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                      placeholder="e.g., Marketing Assets Directory"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 mb-1">
                      Meta Description / Introduction
                    </label>
                    <textarea
                      rows={2}
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                      placeholder="Describe what files or resources are included in this directory..."
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                    <label className="flex items-start gap-3 p-3 rounded-lg border border-neutral-200 hover:bg-neutral-50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={includeEmbeds}
                        onChange={(e) => setIncludeEmbeds(e.target.checked)}
                        className="mt-0.5 w-4 h-4 text-blue-600 rounded border-neutral-300 focus:ring-blue-500"
                      />
                      <div>
                        <span className="text-sm font-semibold text-neutral-900 block">Include Document Embeds</span>
                        <span className="text-xs text-neutral-500 block">Interactive iframe previews and copyable HTML embed snippets</span>
                      </div>
                    </label>

                    <label className="flex items-start gap-3 p-3 rounded-lg border border-neutral-200 hover:bg-neutral-50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={includeSearch}
                        onChange={(e) => setIncludeSearch(e.target.checked)}
                        className="mt-0.5 w-4 h-4 text-blue-600 rounded border-neutral-300 focus:ring-blue-500"
                      />
                      <div>
                        <span className="text-sm font-semibold text-neutral-900 block">Live Search &amp; Filtering</span>
                        <span className="text-xs text-neutral-500 block">Embedded JavaScript search bar for instant keyword filtering</span>
                      </div>
                    </label>
                  </div>
                </div>
              </div>

            </div>
          )}

          {/* TAB 2: DOCUMENT EMBEDS & CODE GENERATOR */}
          {activeTab === 'embeds' && (
            <div className="space-y-6">
              
              {/* Embed Generator Banner & Settings */}
              <div className="bg-white p-6 rounded-xl border border-neutral-200 shadow-xs space-y-4">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-neutral-100 pb-4">
                  <div>
                    <h3 className="text-base font-bold text-neutral-900 flex items-center gap-2">
                      <FileCode className="w-5 h-5 text-blue-600" />
                      <span>Document HTML Embed Code Generator</span>
                    </h3>
                    <p className="text-xs text-neutral-500 mt-0.5">
                      Copy clean, responsive HTML iframe embed codes for your Google Docs, Sheets, Slides, PDFs, and media files.
                    </p>
                  </div>
                  <button
                    onClick={handleCopyAllEmbeds}
                    disabled={displayedEmbedFiles.length === 0}
                    className="bg-neutral-900 hover:bg-neutral-800 text-white font-semibold text-xs px-3.5 py-2 rounded-lg transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer shrink-0 disabled:opacity-50"
                  >
                    {copiedAllEmbeds ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedAllEmbeds ? 'All Embeds Copied!' : `Copy All (${displayedEmbedFiles.length}) Embeds`}</span>
                  </button>
                </div>

                {/* Controls Bar: Format, Height, Search & Category Filters */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
                  
                  {/* Search Bar */}
                  <div className="relative">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
                    <input
                      type="text"
                      value={embedSearchQuery}
                      onChange={(e) => setEmbedSearchQuery(e.target.value)}
                      placeholder="Filter documents..."
                      className="w-full pl-9 pr-3 py-1.5 text-xs border border-neutral-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                  </div>

                  {/* Embed Format */}
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-semibold text-neutral-600 shrink-0">Style:</label>
                    <select
                      value={embedStyle}
                      onChange={(e) => setEmbedStyle(e.target.value as 'responsive' | 'standard')}
                      className="w-full px-2.5 py-1.5 text-xs border border-neutral-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                    >
                      <option value="standard">Standard Iframe</option>
                      <option value="responsive">Responsive Box Container</option>
                    </select>
                  </div>

                  {/* Embed Height */}
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-semibold text-neutral-600 shrink-0">Height:</label>
                    <select
                      value={embedHeight}
                      onChange={(e) => setEmbedHeight(e.target.value as any)}
                      className="w-full px-2.5 py-1.5 text-xs border border-neutral-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                    >
                      <option value="360px">Compact (360px)</option>
                      <option value="480px">Standard (480px)</option>
                      <option value="600px">Spacious (600px)</option>
                    </select>
                  </div>

                  {/* Document Category Filter */}
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-semibold text-neutral-600 shrink-0">Type:</label>
                    <select
                      value={embedTypeFilter}
                      onChange={(e) => setEmbedTypeFilter(e.target.value as any)}
                      className="w-full px-2.5 py-1.5 text-xs border border-neutral-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                    >
                      <option value="all">All Documents ({embeddableFiles.length})</option>
                      <option value="doc">Google Docs</option>
                      <option value="sheet">Google Sheets</option>
                      <option value="slide">Google Slides</option>
                      <option value="pdf">PDFs</option>
                      <option value="media">Media / Video</option>
                    </select>
                  </div>

                </div>
              </div>

              {/* Document List */}
              <div className="space-y-4">
                {displayedEmbedFiles.map((file) => {
                  const badge = getFileBadgeInfo(file.mimeType);
                  const embedUrl = getEmbedUrl(file);
                  const codeSnippet = getFileEmbedCode(file, {
                    height: embedHeight,
                    responsive: embedStyle === 'responsive'
                  });
                  const isCopied = copiedEmbedFileId === file.id;
                  const isPreviewing = previewingEmbedFileId === file.id;

                  return (
                    <div 
                      key={file.id} 
                      className="bg-white rounded-xl border border-neutral-200 shadow-xs p-4 sm:p-5 space-y-3 transition-all hover:border-blue-300"
                    >
                      {/* Document Card Header */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="text-2xl shrink-0" aria-hidden="true">{badge.icon}</span>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h4 className="text-sm font-bold text-neutral-900 truncate" title={file.name}>
                                {file.name}
                              </h4>
                              <span 
                                className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
                                style={{ backgroundColor: badge.bg, color: badge.color }}
                              >
                                {badge.label}
                              </span>
                            </div>
                            <div className="flex items-center gap-3 text-xs text-neutral-500 mt-0.5">
                              {file.size && <span>{formatBytes(Number(file.size))}</span>}
                              <a 
                                href={file.webViewLink || `https://drive.google.com/file/d/${file.id}/view`} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="text-blue-600 hover:underline inline-flex items-center gap-1"
                              >
                                <span>Open Drive</span>
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            </div>
                          </div>
                        </div>

                        {/* Card Action Buttons */}
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            onClick={() => setPreviewingEmbedFileId(isPreviewing ? null : file.id)}
                            className="px-3 py-1.5 text-xs font-semibold text-neutral-700 bg-neutral-100 hover:bg-neutral-200 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5 text-neutral-600" />
                            <span>{isPreviewing ? 'Hide Preview' : 'Preview Embed'}</span>
                          </button>
                          <button
                            onClick={() => handleCopySingleEmbedCode(file)}
                            className="px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
                          >
                            {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-300" /> : <Copy className="w-3.5 h-3.5" />}
                            <span>{isCopied ? 'Code Copied!' : 'Copy HTML Embed Code'}</span>
                          </button>
                        </div>
                      </div>

                      {/* Easily Copy-Pasteable HTML Code Box */}
                      <div className="space-y-1.5 pt-1">
                        <div className="flex items-center justify-between text-[11px] font-semibold text-neutral-600">
                          <span>HTML Embed Code (Click snippet to copy):</span>
                          <span className="font-mono text-[10px] text-neutral-400">height: {embedHeight} &bull; width: 100%</span>
                        </div>
                        <div className="relative">
                          <textarea
                            readOnly
                            rows={embedStyle === 'responsive' ? 3 : 2}
                            value={codeSnippet}
                            onClick={(e) => {
                              (e.target as HTMLTextAreaElement).select();
                              handleCopySingleEmbedCode(file);
                            }}
                            title="Click to copy HTML embed code"
                            className="w-full p-2.5 bg-neutral-900 text-neutral-200 rounded-lg font-mono text-xs border border-neutral-800 focus:ring-2 focus:ring-blue-500 outline-none leading-relaxed cursor-pointer hover:bg-neutral-850"
                          />
                        </div>
                      </div>

                      {/* Live Embed Preview Accordion */}
                      {isPreviewing && embedUrl && (
                        <div className="pt-2 border-t border-neutral-100 animate-in fade-in duration-200">
                          <div className="p-3 bg-neutral-50 rounded-lg border border-neutral-200 space-y-2">
                            <div className="flex items-center justify-between text-xs text-neutral-600 font-semibold">
                              <span>Live Iframe Preview ({file.name})</span>
                              <span className="text-[11px] text-emerald-600 font-medium">Rendered via Google Drive Embed Service</span>
                            </div>
                            <div 
                              className="w-full rounded-lg overflow-hidden border border-neutral-300 bg-white shadow-inner"
                              style={{ height: embedHeight }}
                            >
                              <iframe 
                                src={embedUrl} 
                                className="w-full h-full border-0" 
                                loading="lazy" 
                                allowFullScreen 
                                title={`Embed Preview of ${file.name}`}
                              />
                            </div>
                          </div>
                        </div>
                      )}

                    </div>
                  );
                })}

                {displayedEmbedFiles.length === 0 && (
                  <div className="p-8 text-center bg-white rounded-xl border border-neutral-200 space-y-2">
                    <FileCode className="w-8 h-8 text-neutral-400 mx-auto" />
                    <p className="text-sm font-semibold text-neutral-700">No embeddable documents found</p>
                    <p className="text-xs text-neutral-500">
                      {embedSearchQuery ? `No files matching "${embedSearchQuery}"` : 'Ensure your selected folder contains Google Docs, Sheets, Slides, PDFs, or media files.'}
                    </p>
                  </div>
                )}
              </div>

            </div>
          )}

          {/* TAB 3: LIVE DIRECTORY PREVIEW */}
          {activeTab === 'preview' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-neutral-500 px-1">
                <span>
                  Previewing directory for: <strong>{selectedFolderMeta ? selectedFolderMeta.name : 'Entire Google Drive'}</strong> ({filteredFiles.length} items)
                </span>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-neutral-700">Active Format:</span>
                  <span className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded font-semibold uppercase text-[10px]">
                    {exportFormat}
                  </span>
                </div>
              </div>

              {exportFormat === 'pdf' ? (
                <div className="bg-white rounded-xl border border-neutral-200 shadow-xs p-6 space-y-4 text-center">
                  <div className="max-w-md mx-auto space-y-3">
                    <div className="p-3 bg-red-50 text-red-600 rounded-full w-12 h-12 flex items-center justify-center mx-auto">
                      <FileText className="w-6 h-6" />
                    </div>
                    <h3 className="text-base font-bold text-neutral-900">PDF Directory Report Preview</h3>
                    <p className="text-xs text-neutral-500 leading-relaxed">
                      Generates a multi-page document with hierarchy table, file sizes, Drive hyperlinks, and storage summaries.
                    </p>
                    <div className="flex items-center justify-center gap-3 pt-2">
                      <button
                        onClick={handleDownloadPdf}
                        disabled={generatingPdf}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer disabled:opacity-50"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>{generatingPdf ? 'Generating PDF...' : 'Download .PDF'}</span>
                      </button>
                      <button
                        onClick={handlePrintPdf}
                        className="px-4 py-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-800 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
                      >
                        <Printer className="w-3.5 h-3.5" />
                        <span>Print / Save as PDF</span>
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div 
                  className="bg-white rounded-xl border border-neutral-200 shadow-xs p-4 overflow-x-auto"
                  dangerouslySetInnerHTML={{ __html: bloggerSnippet }}
                />
              )}
            </div>
          )}

          {/* TAB 4: FULL SOURCE CODE */}
          {activeTab === 'code' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <span className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">
                  {exportFormat === 'blogger' ? 'Blogger-Compatible Scoped Snippet' : 'Standalone HTML Document'} ({exportFormat === 'blogger' ? bloggerSnippet.length.toLocaleString() : fullHtml.length.toLocaleString()} characters)
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleCopyCode}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                  >
                    {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copied ? 'Copied!' : 'Copy Code'}</span>
                  </button>
                  <button
                    onClick={exportFormat === 'blogger' ? handleDownloadBloggerSnippet : handleDownloadHtml}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-white rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download File</span>
                  </button>
                </div>
              </div>
              <pre className="p-4 bg-neutral-900 text-neutral-100 rounded-xl text-xs font-mono overflow-x-auto max-h-[500px] border border-neutral-800 leading-relaxed">
                <code>{exportFormat === 'blogger' ? bloggerSnippet : fullHtml}</code>
              </pre>
            </div>
          )}

        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-neutral-200 bg-white flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-neutral-500">
            <Sparkles className="w-3.5 h-3.5 text-blue-600" />
            <span>Format: <strong>{exportFormat === 'blogger' ? 'Blogger HTML' : exportFormat === 'html' ? 'Standalone HTML' : 'PDF Document'}</strong> &bull; {filteredFiles.length} items</span>
          </div>
          <div className="flex items-center gap-2.5">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-semibold text-neutral-600 hover:text-neutral-900 bg-neutral-100 hover:bg-neutral-200 rounded-lg transition-colors cursor-pointer"
            >
              Close
            </button>
            
            {exportFormat === 'blogger' && (
              <button
                onClick={handleCopyCode}
                className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors flex items-center gap-2 shadow-xs cursor-pointer"
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                <span>{copied ? 'Copied!' : 'Copy Blogger HTML'}</span>
              </button>
            )}

            {exportFormat === 'html' && (
              <button
                onClick={handleDownloadHtml}
                className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors flex items-center gap-2 shadow-xs cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>Download .HTML</span>
              </button>
            )}

            {exportFormat === 'pdf' && (
              <button
                onClick={handleDownloadPdf}
                disabled={generatingPdf}
                className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors flex items-center gap-2 shadow-xs cursor-pointer disabled:opacity-50"
              >
                <Download className="w-4 h-4" />
                <span>{generatingPdf ? 'Building PDF...' : 'Download PDF'}</span>
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
