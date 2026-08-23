import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { google } from "googleapis";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Helper to get Drive client
  const getDriveClient = (token: string) => {
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: token, token_type: 'Bearer' });
    return google.drive({ version: 'v3', auth: oauth2Client });
  };

  // API Routes
  app.get("/api/scan", async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const token = authHeader.split('Bearer ')[1];
    
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
        console.error("Scan error", e);
        res.status(500).json({ error: "Scan error" });
    }
  });

  app.get("/api/all-files", async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const token = authHeader.split('Bearer ')[1];
    
    try {
        const drive = getDriveClient(token);
        const allFiles: any[] = [];
        let nextPageToken: string | undefined = undefined;

        do {
            const response = await drive.files.list({
              pageSize: 1000,
              pageToken: nextPageToken,
              fields: 'nextPageToken, files(id, name, mimeType, parents, size, createdTime, webViewLink)',
              q: "trashed = false"
            });
            allFiles.push(...(response.data.files || []));
            nextPageToken = response.data.nextPageToken || undefined;
        } while (nextPageToken);
        
        res.json({ files: allFiles });
    } catch (e) {
        console.error("All files fetch error", e);
        res.status(500).json({ error: "Failed to fetch files" });
    }
  });

  app.post("/api/delete-group", async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const token = authHeader.split('Bearer ')[1];
    
    const { fileIds } = req.body;
    try {
        const drive = getDriveClient(token);
        for (const fileId of fileIds) {
            await drive.files.delete({ fileId });
        }
        res.json({ success: true });
    } catch (e) {
        console.error("Delete error", e);
        res.status(500).json({ error: "Delete error" });
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
