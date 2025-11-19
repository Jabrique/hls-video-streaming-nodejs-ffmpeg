const ffmpeg = require('fluent-ffmpeg');
const ffprobePath = require('ffprobe-static').path;
const ffmpegPath = require('ffmpeg-static');
const fs = require('fs-extra');
const { updateJsonData } = require('./updateJsonData');

ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath);

// Helper: Cek audio
function hasAudioStream(filePath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) return reject(err);
      const audioStream = metadata.streams.find(s => s.codec_type === 'audio');
      resolve(!!audioStream);
    });
  });
}

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

async function generateVideoSegments(filePath, outputDir, title) {
  const hasAudio = await hasAudioStream(filePath);
  console.log(`Audio stream detected: ${hasAudio}`);

  return new Promise((resolve, reject) => {
    const renditions = [
      { width: 640, height: 360, bitrate: '800k' },
      { width: 1280, height: 720, bitrate: '2500k' },
      { width: 1920, height: 1080, bitrate: '5000k' }
    ];

    let command = ffmpeg(filePath);
    const outputOptions = [];

    // --- Pengaturan Umum & GOP ---
    outputOptions.push('-c:v libx264');
    outputOptions.push('-preset medium');
    outputOptions.push('-crf 24');
    outputOptions.push('-keyint_min 48');
    outputOptions.push('-g 48');
    outputOptions.push('-sc_threshold 0');

    // --- Mapping Video ---
    renditions.forEach((rendition, index) => {
      outputOptions.push(`-map 0:v:0`);
      outputOptions.push(`-filter:v:${index} scale=-2:${rendition.height}`);
      outputOptions.push(`-b:v:${index} ${rendition.bitrate}`);
      outputOptions.push(`-maxrate:v:${index} ${parseInt(rendition.bitrate) * 1.2}k`);
      outputOptions.push(`-bufsize:v:${index} ${parseInt(rendition.bitrate) * 1.5}k`);
    });

    // --- Mapping Audio (ENCODE ULANG YANG AMAN) ---
    if (hasAudio) {
      outputOptions.push('-map 0:a:0');
      outputOptions.push('-c:a aac');     // Encode ke AAC
      outputOptions.push('-b:a 128k');    // Bitrate standar
      outputOptions.push('-ac 2');        // FORCE Stereo (Penting!)
      outputOptions.push('-ar 44100');    // FORCE 44.1kHz (Penting!)
    }

    // --- Konfigurasi DASH ---
    outputOptions.push('-f dash');
    outputOptions.push('-seg_duration 4');
    outputOptions.push('-use_template 1');
    outputOptions.push('-use_timeline 1');
    outputOptions.push('-init_seg_name init-$RepresentationID$.m4s');
    outputOptions.push('-media_seg_name segment-$RepresentationID$-$Number$.m4s');
    
    // --- Adaptation Sets (FIXED: Use explicit stream indices) ---
    // Stream 0,1,2 are video (3 renditions), Stream 3 is audio
    if (hasAudio) {
      outputOptions.push('-adaptation_sets', 'id=0,streams=0,1,2 id=1,streams=3');
    } else {
      outputOptions.push('-adaptation_sets', 'id=0,streams=0,1,2');
    }

    command
      .outputOptions(outputOptions)
      .output(`${outputDir}/index.mpd`)
      .on('start', (commandLine) => {
        console.log('Spawned Ffmpeg with command: ' + commandLine);
      })
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
        console.log('Video segments generation (DASH ABR) completed.');
        resolve();
      })
      .on('error', (err, stdout, stderr) => {
        console.error('FFmpeg error:', err.message);
        if (stderr) console.error('FFmpeg stderr:', stderr);
        reject(err);
      })
      .run();
  });
}

module.exports = { generateThumbnail, generateVideoSegments };