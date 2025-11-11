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

      .output(`${outputDir}/index.mpd`) // Ganti nama file output ke .mpd
      .outputOptions([
        '-f dash',                   
        '-seg_duration 4',           
        '-use_template 1',           
        '-use_timeline 1',           

        '-init_seg_name init-$RepresentationID$.m4s',
        '-media_seg_name segment-$RepresentationID$-$Number$.m4s',
      ])
      .on('end', async () => {
        await fs.remove(filePath);

        const cdnUrl = process.env.CDN_URL || '';

        const videoPath = cdnUrl
          ? `${cdnUrl}/videos/${title}/index.mpd`
          : `videos/${title}/index.mpd`;

        const thumbPath = cdnUrl
          ? `${cdnUrl}/videos/${title}/thumbnail.webp`
          : `videos/${title}/thumbnail.webp`;

        updateJsonData(title, videoPath, thumbPath);
        console.log('Video segments generation (DASH) completed.');
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
