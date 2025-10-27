// Store configuration from server
let appConfig = {
  uriSigningParam: 'URISigningPackage' // default fallback
};

document.addEventListener('DOMContentLoaded', async () => {
  // Load configuration first
  await loadConfig();
  // Then load videos
  loadVideos();
});

/**
 * Load application configuration from server
 */
async function loadConfig() {
  try {
    const response = await fetch('/api/config');
    if (response.ok) {
      appConfig = await response.json();
      console.log('Configuration loaded:', appConfig);
    }
  } catch (error) {
    console.warn('Failed to load config, using defaults:', error);
  }
}

function loadVideos() {
  const videoList = document.getElementById('videoList');
  videoList.innerHTML = '';
  fetch('data.json')
    .then((response) => response.json())
    .then((data) => {
      data.videos.forEach((videoData) => {
        const videoItem = document.createElement('div');
        videoItem.className =
          'flex flex-col items-center w-72 bg-gray-100 rounded-lg shadow-md p-4 mb-4';

        videoItem.innerHTML = `
              <img src="${videoData.thumb}" data-video="${videoData.video}" class="w-full object-cover rounded cursor-pointer mb-2" onclick="openModal(this)" alt="${videoData.title}">
              <div class="text-lg font-bold">${videoData.title}</div>
            `;

        videoList.appendChild(videoItem);
      });
    })
    .catch((error) => {
      console.error('Error loading videos:', error);
    });
}

async function openModal(videoElement) {
  const modal = document.getElementById('modal');
  const video = document.getElementById('video');
  const videoSrc = videoElement.getAttribute('data-video');

  try {
    // Extract video name from path: /videos/movieName/playlist.m3u8 -> movieName
    const videoName = extractVideoName(videoSrc);
    
    // Generate JWT token for this video
    const token = await generateJWTToken(videoName);

    // Append token to manifest URL using configured parameter name
    const signedVideoSrc = `${videoSrc}?${appConfig.uriSigningParam}=${token}`;

    console.log('Loading video with signed URL:', signedVideoSrc);

    if (Hls.isSupported()) {
      const hls = new Hls({
        // Configure HLS.js to include credentials for cross-origin requests
        xhrSetup: function(xhr, url) {
          xhr.withCredentials = true;  // Include cookies for segment requests
        }
      });
      hls.loadSource(signedVideoSrc);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play();
      });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = signedVideoSrc;
      video.addEventListener('loadedmetadata', () => {
        video.play();
      });
    } else {
      console.error('HLS not supported in this browser');
    }

    modal.classList.remove('hidden');
    document.body.classList.add('no-scroll');
  } catch (error) {
    console.error('Error loading video:', error);
    alert('Failed to load video. Please try again.');
  }
}

/**
 * Extract video name from video path
 * Example: /videos/movies1/playlist.m3u8 -> movies1
 */
function extractVideoName(videoPath) {
  const parts = videoPath.split('/').filter(p => p);
  // Find index of 'videos' directory
  const videosIndex = parts.indexOf('videos');
  if (videosIndex >= 0 && parts.length > videosIndex + 1) {
    return parts[videosIndex + 1];
  }
  // Fallback: return second-to-last part
  return parts[parts.length - 2] || 'unknown';
}

/**
 * Generate JWT token for video from backend
 * @param {string} videoName - Name of the video directory
 * @returns {Promise<string>} JWT token
 */
async function generateJWTToken(videoName) {
  try {
    const response = await fetch(`/api/token/${videoName}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      throw new Error('Failed to generate token');
    }
    
    const data = await response.json();
    return data.token;
  } catch (error) {
    console.error('Error generating JWT token:', error);
    throw error;
  }
}

function closeModal() {
  const modal = document.getElementById('modal');
  const video = document.getElementById('video');
  video.pause();
  modal.classList.add('hidden');
  document.body.classList.remove('no-scroll');
}

function uploadVideo() {
  const title = document.getElementById('title').value;
  const fileInput = document.getElementById('videoUpload');
  const formData = new FormData();

  formData.append('title', title);
  formData.append('video', fileInput.files[0]);

  const loader = document.getElementById('loader');
  loader.classList.remove('hidden'); // Show loader
  document.body.classList.add('no-scroll');
  const messageDiv = document.getElementById('message');

  fetch('/upload', {
    method: 'POST',
    body: formData,
  })
    .then((response) => response.json())
    .then((data) => {
      if (data.message === 'Video uploaded and converted successfully.') {
        // loadTimeline();
        loader.classList.add('hidden'); // Hide loader
        document.body.classList.remove('no-scroll');
        alert('Video uploaded and converted successfully.');
        fileInput.value = null;
        loadVideos();
      } else {
        loader.classList.add('hidden');
        fileInput.value = null;
      }
    })
    .catch((error) => {
      console.error('Error:', error);
    });
}
