const express = require('express');
const multer = require('multer');
const path = require('path');
const { clearTempUploads } = require('./utils/clearTempUploads');
const {
  generateThumbnail,
  generateVideoSegments,
} = require('./utils/ffmpeg-utils');
const fs = require('fs-extra');
const {
  generateManifestToken,
  generateTokenForPath,
  verifyToken
} = require('./utils/jwt-signing');

const app = express();

const upload = multer({ dest: 'temp-uploads/' });

app.use(express.static('public'));
app.use('/videos', express.static(path.join(__dirname, 'public', 'videos')));
app.use(express.json());

// Clear temp-uploads directory on server startup for half finished upload.
clearTempUploads();

app.post('/upload', upload.single('video'), async (req, res) => {
  if (!req.file) {
    return res
      .status(400)
      .json({ message: 'No file selected. Please select a file to upload.' });
  }

  let { title, date, info } = req.body;
  const filePath = req.file.path;

  console.log(title);

  if (!date) date = '';
  if (!title) title = path.parse(req.file.originalname).name;
  if (!info) info = '';

  const outputDir = path.join(__dirname, 'public', 'videos', title);
  await fs.ensureDir(outputDir);

  try {
    await generateThumbnail(filePath, outputDir);
    await generateVideoSegments(filePath, outputDir, title); 

    res.json({ message: 'Video uploaded and converted successfully.' });

  } catch (error) {
    console.error("Processing failed:", error);
    if (!res.headersSent) {
      res.status(500).json({ message: 'Error processing video.', detail: error.message });
    }
  }
});

app.get('/data', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'data.json'));
});

/**
 * API: Get client configuration
 * GET /api/config
 * Returns configuration values needed by the frontend
 */
app.get('/api/config', (_req, res) => {
  res.json({
    uriSigningParam: process.env.URI_SIGNING_PARAM || 'URISigningPackage'
  });
});

/**
 * Internal API: Generate JWT token for video
 * GET /api/token/:videoName
 * Returns only the token string (lightweight)
 */
app.get('/api/token/:videoName', (req, res) => {
  try {
    const { videoName } = req.params;
    const {
      expiresIn = 3600,
      renewalDuration = 300,
      hostname = '[^/]*'
    } = req.query;
    
    const token = generateManifestToken(videoName, {
      expiresIn: parseInt(expiresIn),
      renewalDuration: parseInt(renewalDuration),
      hostname
    });
    
    // Return only token (lightweight response)
    res.json({ token });
  } catch (error) {
    console.error('Error generating token:', error);
    res.status(500).json({
      error: 'Failed to generate token'
    });
  }
});

const PORT = process.env.PORT || 80;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
