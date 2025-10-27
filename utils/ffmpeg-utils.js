const ffmpeg = require('fluent-ffmpeg');
const ffprobePath = require('ffprobe-static').path; // ffmpeg binary
const ffmpegPath = require('ffmpeg-static'); // ffmpeg binary
const fs = require('fs-extra');
const { updateJsonData } = require('./updateJsonData');

ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath);

async function generateThumbnail(filePath, outputDir) {
  return new Promise((resolve, reject) => {
    ffmpeg(filePath)
      .on('filenames', function (filenames) {
        console.log('Generating thumbnail:', filenames);
      })
      .on('end', function () {
        console.log('Thumbnail generation completed.');
        resolve();
      })
      .on('error', function (err) {
        console.error('Error generating thumbnail:', err);
        reject(err);
      })
      .screenshots({
        count: 1,
        folder: outputDir,
        filename: 'thumbnail.webp',
        size: '320x?',
      });
  });
}

async function generateVideoSegments(filePath, outputDir, title, res) {
  return new Promise((resolve, reject) => {
    ffmpeg(filePath)
      .on('filenames', function (title) {
        console.log('Generating Video Segments:', title);
      })
      .outputOptions([
        '-c:v libx264', // Specifies the H.264 video codec.
        '-c:a aac', // Specifies the AAC audio codec.
        '-preset medium', // Compression preset
        '-crf 24', // CRF for quality control (lower is better quality)
      ])
      .output(`${outputDir}/index.m3u8`)
      .outputOptions([
        '-start_number 0', // Sets the starting number for the HLS segments.
        '-hls_time 4', // Duration of each HLS segment in seconds.
        '-hls_list_size 0', // Ensures all segments are included in the playlist.
        '-hls_playlist_type vod', // Designates the playlist as VOD and includes the EXT-X-ENDLIST tag.
        '-f hls', // Specifies the output format as HLS (HTTP Live Streaming).
      ])
      .on('end', async () => {
        await fs.remove(filePath);
        // Use CDN URL if available, otherwise use relative path
        const cdnUrl = process.env.CDN_URL || '';
        const videoPath = cdnUrl ? `${cdnUrl}/videos/${title}/index.m3u8` : `videos/${title}/index.m3u8`;
        const thumbPath = cdnUrl ? `${cdnUrl}/videos/${title}/thumbnail.webp` : `videos/${title}/thumbnail.webp`;
        
        updateJsonData(
          title,
          videoPath,
          thumbPath
        );
        console.log('Video segments generation completed.');
        res.json({ message: 'Video uploaded and converted successfully.' });
        resolve();
      })
      .on('error', (err) => {
        console.error('FFmpeg error:', err);
        res.status(500).json({ message: 'Error converting video.' });
        reject(err);
      })
      .run();
  });
}

module.exports = { generateThumbnail, generateVideoSegments };
