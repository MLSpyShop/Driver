import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { google } from "googleapis";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Helper to extract and validate bearer token
  const extractToken = (req: express.Request): string | null => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return null;
    }
    const token = authHeader.split('Bearer ')[1]?.trim();
    if (!token || token === 'null' || token === 'undefined') {
      return null;
    }
    return token;
  };

  // Helper to get Drive client
  const getDriveClient = (token: string) => {
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: token, token_type: 'Bearer' });
    return google.drive({ version: 'v3', auth: oauth2Client });
  };

  // Helper to handle API errors cleanly
  const handleDriveError = (res: express.Response, error: any, context: string) => {
    const status = error?.response?.status || error?.status || error?.code;
    const isAuthError = status === 401 || status === 403 || 
      error?.message?.includes('invalid authentication') || 
      error?.message?.includes('invalid_grant') || 
      error?.message?.includes('Invalid Credentials') ||
      error?.name === 'GaxiosError';

    if (isAuthError) {
      console.warn(`[${context}] Authentication error:`, error?.message || error);
      return res.status(401).json({
        error: "Google OAuth access token is expired or invalid. Please sign in again.",
        code: "UNAUTHENTICATED"
      });
    }

    console.error(`[${context}] API error:`, error);
    return res.status(500).json({
      error: error?.message || `Failed to perform ${context}`,
      code: "INTERNAL_ERROR"
    });
  };

  // API Routes
  app.get("/api/scan", async (req, res) => {
    const token = extractToken(req);
    if (!token) {
      return res.status(401).json({ 
        error: "Unauthorized: Missing or invalid Google OAuth access token", 
        code: "UNAUTHENTICATED" 
      });
    }
    
    try {
        const drive = getDriveClient(token);
        const allFiles: any[] = [];
        let nextPageToken: string | undefined = undefined;

        do {
            const response = await drive.files.list({
              pageSize: 1000,
              pageToken: nextPageToken,
              fields: 'nextPageToken, files(id, name, md5Checksum, size, createdTime)',
              q: "trashed = false and mimeType != 'application/vnd.google-apps.folder'"
            });
            allFiles.push(...(response.data.files || []));
            nextPageToken = response.data.nextPageToken || undefined;
        } while (nextPageToken);
        
        const duplicates: any[] = [];
        const seen = new Map<string, any[]>();

        for (const file of allFiles) {
          if (!file.md5Checksum) continue;
          if (seen.has(file.md5Checksum)) {
             seen.get(file.md5Checksum)!.push(file);
          } else {
             seen.set(file.md5Checksum, [file]);
          }
        }
        
        for (const [md5, files] of seen) {
            if (files.length > 1) {
                // Sort by createdTime descending (newest first)
                files.sort((a, b) => new Date(b.createdTime!).getTime() - new Date(a.createdTime!).getTime());
                duplicates.push(files);
            }
        }
        res.json({ duplicates, totalScanned: allFiles.length });
    } catch (e) {
        return handleDriveError(res, e, "Scan duplicates");
    }
  });

  app.get("/api/all-files", async (req, res) => {
    const token = extractToken(req);
    if (!token) {
      return res.status(401).json({ 
        error: "Unauthorized: Missing or invalid Google OAuth access token", 
        code: "UNAUTHENTICATED" 
      });
    }
    
    try {
        const drive = getDriveClient(token);
        const allFiles: any[] = [];
        let nextPageToken: string | undefined = undefined;

        do {
            const response = await drive.files.list({
              pageSize: 1000,
              pageToken: nextPageToken,
              fields: 'nextPageToken, files(id, name, mimeType, parents, size, createdTime, modifiedTime, webViewLink, webContentLink, iconLink, thumbnailLink, description)',
              q: "trashed = false"
            });
            allFiles.push(...(response.data.files || []));
            nextPageToken = response.data.nextPageToken || undefined;
        } while (nextPageToken);
        
        res.json({ files: allFiles });
    } catch (e) {
        return handleDriveError(res, e, "Fetch all files");
    }
  });

  app.get("/api/drive-insights", async (req, res) => {
    const token = extractToken(req);
    if (!token) {
      return res.status(401).json({ 
        error: "Unauthorized: Missing or invalid Google OAuth access token", 
        code: "UNAUTHENTICATED" 
      });
    }
    
    try {
        const drive = getDriveClient(token);
        
        // Get storage quota
        const aboutRes = await drive.about.get({
          fields: 'storageQuota, user'
        });

        // Get all non-trashed files for analysis
        const allFiles: any[] = [];
        let nextPageToken: string | undefined = undefined;

        do {
            const response = await drive.files.list({
              pageSize: 1000,
              pageToken: nextPageToken,
              fields: 'nextPageToken, files(id, name, mimeType, size, createdTime, webViewLink, iconLink)',
              q: "trashed = false and mimeType != 'application/vnd.google-apps.folder'"
            });
            allFiles.push(...(response.data.files || []));
            nextPageToken = response.data.nextPageToken || undefined;
        } while (nextPageToken);

        // Compute file types breakdown
        const typeMap: Record<string, { count: number, size: number }> = {
          'Images': { count: 0, size: 0 },
          'Videos': { count: 0, size: 0 },
          'Documents': { count: 0, size: 0 },
          'Audio': { count: 0, size: 0 },
          'Archives': { count: 0, size: 0 },
          'Others': { count: 0, size: 0 }
        };

        const sortedBySize = [...allFiles].sort((a, b) => Number(b.size || 0) - Number(a.size || 0));
        const largestFiles = sortedBySize.slice(0, 10);

        for (const file of allFiles) {
          const mime = file.mimeType || '';
          const size = Number(file.size || 0);

          if (mime.includes('image/')) {
            typeMap['Images'].count++;
            typeMap['Images'].size += size;
          } else if (mime.includes('video/')) {
            typeMap['Videos'].count++;
            typeMap['Videos'].size += size;
          } else if (mime.includes('pdf') || mime.includes('document') || mime.includes('sheet') || mime.includes('presentation') || mime.includes('text/')) {
            typeMap['Documents'].count++;
            typeMap['Documents'].size += size;
          } else if (mime.includes('audio/')) {
            typeMap['Audio'].count++;
            typeMap['Audio'].size += size;
          } else if (mime.includes('zip') || mime.includes('compressed') || mime.includes('tar') || mime.includes('rar')) {
            typeMap['Archives'].count++;
            typeMap['Archives'].size += size;
          } else {
            typeMap['Others'].count++;
            typeMap['Others'].size += size;
          }
        }

        res.json({
          storageQuota: aboutRes.data.storageQuota,
          user: aboutRes.data.user,
          typeBreakdown: typeMap,
          largestFiles,
          totalFiles: allFiles.length
        });
    } catch (e) {
        return handleDriveError(res, e, "Drive insights");
    }
  });

  app.post("/api/delete-group", async (req, res) => {
    const token = extractToken(req);
    if (!token) {
      return res.status(401).json({ 
        error: "Unauthorized: Missing or invalid Google OAuth access token", 
        code: "UNAUTHENTICATED" 
      });
    }
    
    const { fileIds } = req.body;
    if (!Array.isArray(fileIds) || fileIds.length === 0) {
      return res.status(400).json({ error: "Missing fileIds array" });
    }

    try {
        const drive = getDriveClient(token);
        for (const fileId of fileIds) {
            await drive.files.delete({ fileId });
        }
        res.json({ success: true });
    } catch (e) {
        return handleDriveError(res, e, "Delete files");
    }
  });

  // Vite middleware
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
