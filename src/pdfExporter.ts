import { jsPDF } from 'jspdf';
import { DriveFileItem, ExportOptions, buildFileHierarchy, FolderMeta, getFileEmbedCode, getEmbedUrl } from './htmlExporter';

const formatBytes = (bytes: number): string => {
  if (!bytes || bytes === 0) return '0 KB';
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
};

const getFileTypeShort = (mimeType: string): string => {
  if (mimeType === 'application/vnd.google-apps.folder') return 'Folder';
  if (mimeType.includes('document') || mimeType.includes('word')) return 'Google Doc';
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel')) return 'Google Sheet';
  if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) return 'Google Slide';
  if (mimeType.includes('pdf')) return 'PDF File';
  if (mimeType.includes('image/')) return 'Image';
  if (mimeType.includes('video/')) return 'Video';
  if (mimeType.includes('audio/')) return 'Audio';
  if (mimeType.includes('zip') || mimeType.includes('tar') || mimeType.includes('compressed')) return 'Archive';
  return 'File';
};

/**
 * Generates a clean, professional PDF directory catalog from Google Drive files
 */
export const generatePdfDocument = (
  files: DriveFileItem[],
  options: ExportOptions = {}
): jsPDF => {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;

  const title = options.title || 'Google Drive File Directory';
  const description = options.description || 'Complete catalog and directory report of Google Drive files.';
  const folderName = options.selectedFolderName || 'Entire Google Drive';

  let currentY = margin;

  const drawHeader = () => {
    // Top banner accent
    doc.setFillColor(37, 99, 235); // #2563eb
    doc.rect(margin, currentY, contentWidth, 24, 'F');

    // Title
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(255, 255, 255);
    doc.text(title, margin + 4, currentY + 9);

    // Subtitle / Scope
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(219, 234, 254);
    doc.text(`Scope: ${folderName}  |  Generated: ${new Date().toLocaleDateString()}  |  ${files.length} items`, margin + 4, currentY + 18);

    currentY += 28;

    // Metadata details block
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(75, 85, 99);
    
    // Split description into lines if too long
    const splitDesc = doc.splitTextToSize(description, contentWidth);
    doc.text(splitDesc, margin, currentY);
    currentY += splitDesc.length * 4 + 3;

    if (options.authorEmail) {
      doc.text(`Author / Drive Account: ${options.authorEmail}`, margin, currentY);
      currentY += 5;
    }

    // Separator line
    doc.setDrawColor(229, 231, 235);
    doc.setLineWidth(0.3);
    doc.line(margin, currentY, margin + contentWidth, currentY);
    currentY += 6;
  };

  drawHeader();

  // Summary statistics
  const folderCount = files.filter(f => f.mimeType === 'application/vnd.google-apps.folder').length;
  const fileCount = files.filter(f => f.mimeType !== 'application/vnd.google-apps.folder').length;
  const totalBytes = files.reduce((acc, f) => acc + (f.size ? Number(f.size) : 0), 0);

  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(margin, currentY, contentWidth, 12, 1.5, 1.5, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(30, 41, 59);
  doc.text(`Summary:`, margin + 3, currentY + 7);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);
  doc.text(`${folderCount} Folders  |  ${fileCount} Files  |  ${formatBytes(totalBytes)} Storage Space`, margin + 22, currentY + 7);

  currentY += 16;

  // Table Column Headers
  const drawTableHeaders = (yPos: number) => {
    doc.setFillColor(241, 245, 249);
    doc.rect(margin, yPos, contentWidth, 7, 'F');
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.2);
    doc.line(margin, yPos + 7, margin + contentWidth, yPos + 7);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(51, 65, 85);
    doc.text('Item Name & Details', margin + 3, yPos + 4.8);
    doc.text('Type', margin + contentWidth - 62, yPos + 4.8);
    doc.text('Size', margin + contentWidth - 36, yPos + 4.8);
    doc.text('Action / Link', margin + contentWidth - 18, yPos + 4.8);
  };

  drawTableHeaders(currentY);
  currentY += 8;

  // Flatten the hierarchy to print in structured tree order
  const { rootItems } = buildFileHierarchy(files);

  const printItem = (item: DriveFileItem, depth: number = 0) => {
    const isFolder = item.mimeType === 'application/vnd.google-apps.folder';
    const rowHeight = isFolder ? 8 : 10;

    // Page break check
    if (currentY + rowHeight > pageHeight - margin - 8) {
      doc.addPage();
      currentY = margin;
      drawTableHeaders(currentY);
      currentY += 8;
    }

    // Row alternating background
    if (isFolder) {
      doc.setFillColor(248, 250, 252);
      doc.rect(margin, currentY, contentWidth, rowHeight, 'F');
    }

    const indentX = margin + 3 + (depth * 4);
    const maxNameWidth = contentWidth - 70 - (depth * 4);

    // Draw item icon/prefix and name
    doc.setFont('helvetica', isFolder ? 'bold' : 'normal');
    doc.setFontSize(8);
    
    if (isFolder) {
      doc.setTextColor(37, 99, 235);
      doc.text(`[Folder] ${item.name}`, indentX, currentY + 5.5, { maxWidth: maxNameWidth });
    } else {
      doc.setTextColor(15, 23, 42);
      doc.text(item.name, indentX, currentY + 4.5, { maxWidth: maxNameWidth });
    }

    // Type Badge
    const typeLabel = getFileTypeShort(item.mimeType);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text(typeLabel, margin + contentWidth - 62, currentY + 5);

    // File Size
    const sizeLabel = item.size ? formatBytes(Number(item.size)) : (isFolder ? '-' : '-');
    doc.text(sizeLabel, margin + contentWidth - 36, currentY + 5);

    // Clickable link
    const viewUrl = item.webViewLink || `https://drive.google.com/file/d/${item.id}/view`;
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(37, 99, 235);
    doc.textWithLink('Open ↗', margin + contentWidth - 18, currentY + 5, { url: viewUrl });

    // Underline divider
    doc.setDrawColor(241, 245, 249);
    doc.setLineWidth(0.15);
    doc.line(margin, currentY + rowHeight, margin + contentWidth, currentY + rowHeight);

    currentY += rowHeight;

    // Recurse children
    if (item.children && item.children.length > 0) {
      item.children.forEach(child => printItem(child, depth + 1));
    }
  };

  rootItems.forEach(root => printItem(root, 0));

  // Add Page Numbers to all pages
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184);
    doc.text(
      `Google Drive Exporter • ${title} • Page ${i} of ${totalPages}`,
      pageWidth / 2,
      pageHeight - 6,
      { align: 'center' }
    );
  }

  return doc;
};

/**
 * Triggers a formatted print window for direct vector PDF printing
 */
export const printDirectoryReport = (
  files: DriveFileItem[],
  options: ExportOptions = {}
) => {
  const title = options.title || 'Google Drive File Directory';
  const description = options.description || 'File directory report generated from Google Drive.';
  const folderName = options.selectedFolderName || 'Entire Google Drive';

  const { rootItems } = buildFileHierarchy(files);

  const renderPrintNode = (item: DriveFileItem, depth: number = 0): string => {
    const isFolder = item.mimeType === 'application/vnd.google-apps.folder';
    const viewUrl = item.webViewLink || `https://drive.google.com/file/d/${item.id}/view`;
    const typeLabel = getFileTypeShort(item.mimeType);
    const sizeLabel = item.size ? formatBytes(Number(item.size)) : '-';

    let html = `
      <tr class="${isFolder ? 'folder-row' : 'file-row'}">
        <td style="padding-left: ${12 + depth * 18}px;">
          <span class="icon">${isFolder ? '📁' : '📄'}</span>
          <span class="name ${isFolder ? 'folder-name' : ''}">${item.name}</span>
        </td>
        <td><span class="badge">${typeLabel}</span></td>
        <td>${sizeLabel}</td>
        <td><a href="${viewUrl}" target="_blank" class="link">View Drive ↗</a></td>
      </tr>
    `;

    if (item.children && item.children.length > 0) {
      html += item.children.map(child => renderPrintNode(child, depth + 1)).join('');
    }

    return html;
  };

  const printHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${title} - Print / PDF Report</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 1.2cm;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      color: #1e293b;
      margin: 0;
      padding: 20px;
      font-size: 11px;
      line-height: 1.4;
    }
    .header {
      border-bottom: 2px solid #2563eb;
      padding-bottom: 12px;
      margin-bottom: 16px;
    }
    .title {
      font-size: 20px;
      font-weight: bold;
      color: #1e293b;
      margin: 0 0 4px 0;
    }
    .meta {
      color: #64748b;
      font-size: 11px;
      margin: 0 0 8px 0;
    }
    .summary {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 8px 12px;
      margin-bottom: 16px;
      font-weight: 500;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 8px;
    }
    th {
      background: #f1f5f9;
      text-align: left;
      padding: 6px 8px;
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      border-bottom: 1px solid #cbd5e1;
    }
    td {
      padding: 5px 8px;
      border-bottom: 1px solid #f1f5f9;
      vertical-align: middle;
    }
    .folder-row {
      background: #f8fafc;
      font-weight: 600;
    }
    .folder-name {
      color: #2563eb;
    }
    .badge {
      font-size: 9px;
      padding: 2px 5px;
      background: #f1f5f9;
      border-radius: 4px;
      color: #475569;
    }
    .link {
      color: #2563eb;
      text-decoration: none;
      font-weight: 600;
    }
    @media print {
      body { padding: 0; }
      .no-print { display: none; }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1 class="title">${title}</h1>
    <p class="meta">Scope: <strong>${folderName}</strong> &bull; Generated on ${new Date().toLocaleDateString()} ${options.authorEmail ? `&bull; Account: ${options.authorEmail}` : ''}</p>
    <p style="margin:0;color:#475569;">${description}</p>
  </div>
  <div class="summary">
    ${files.length} total items (${files.filter(f => f.mimeType === 'application/vnd.google-apps.folder').length} folders, ${files.filter(f => f.mimeType !== 'application/vnd.google-apps.folder').length} files)
  </div>
  <table>
    <thead>
      <tr>
        <th style="width: 55%;">Item Name</th>
        <th style="width: 15%;">Type</th>
        <th style="width: 15%;">Size</th>
        <th style="width: 15%;">Link</th>
      </tr>
    </thead>
    <tbody>
      ${rootItems.map(root => renderPrintNode(root, 0)).join('')}
    </tbody>
  </table>
  <script>
    window.onload = function() {
      setTimeout(function() {
        window.print();
      }, 400);
    };
  </script>
</body>
</html>
  `;

  const printWindow = window.open('', '_blank');
  if (printWindow) {
    printWindow.document.write(printHtml);
    printWindow.document.close();
  }
};
