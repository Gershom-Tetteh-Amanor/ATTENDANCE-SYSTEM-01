/* student-location.js — GPS location and directions for Student Dashboard */
'use strict';

const STUDENT_LOCATION = (() => {
  const core = () => window.STUDENT_CORE;
  let audioContext = null;

  // Create audio context for notification sounds
  function initAudio() {
    if (!audioContext && typeof Audio !== 'undefined') {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
  }

  // Play notification sound
  async function playNotificationSound() {
    try {
      initAudio();
      if (audioContext) {
        if (audioContext.state === 'suspended') {
          await audioContext.resume();
        }
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        oscillator.frequency.value = 880;
        gainNode.gain.value = 0.3;
        oscillator.start();
        gainNode.gain.exponentialRampToValueAtTime(0.00001, audioContext.currentTime + 1.5);
        oscillator.stop(audioContext.currentTime + 1.5);
        setTimeout(() => {
          const osc2 = audioContext.createOscillator();
          const gain2 = audioContext.createGain();
          osc2.connect(gain2);
          gain2.connect(audioContext.destination);
          osc2.frequency.value = 880;
          gain2.gain.value = 0.3;
          osc2.start();
          gain2.gain.exponentialRampToValueAtTime(0.00001, audioContext.currentTime + 1);
          osc2.stop(audioContext.currentTime + 1);
        }, 800);
      }
    } catch(e) { console.warn('Could not play sound:', e); }
  }

  // Play a gentle reminder sound
  async function playReminderSound() {
    try {
      initAudio();
      if (audioContext) {
        if (audioContext.state === 'suspended') {
          await audioContext.resume();
        }
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        oscillator.frequency.value = 523.25;
        gainNode.gain.value = 0.2;
        oscillator.start();
        gainNode.gain.exponentialRampToValueAtTime(0.00001, audioContext.currentTime + 1);
        oscillator.stop(audioContext.currentTime + 1);
      }
    } catch(e) { console.warn('Could not play reminder sound:', e); }
  }

  // Request audio permission
  async function requestAudioPermission() {
    try {
      initAudio();
      if (audioContext && audioContext.state === 'suspended') {
        await audioContext.resume();
        console.log('[AUDIO] Audio context resumed');
      }
    } catch(e) { console.warn('Could not resume audio:', e); }
  }

  // Calculate distance between two coordinates
  function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3;
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  // Get user's current location
  async function getCurrentPosition() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocation not supported'));
        return;
      }
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      });
    });
  }

  // Show location directions
  async function showLocationDirections(lecturerLat, lecturerLng, lecturerName, courseCode) {
    try {
      const position = await getCurrentPosition();
      const userLat = position.coords.latitude;
      const userLng = position.coords.longitude;
      const distance = calculateDistance(userLat, userLng, lecturerLat, lecturerLng);
      const distanceKm = (distance / 1000).toFixed(1);
      const distanceM = Math.round(distance);
      
      let distanceText = distanceKm >= 1 ? `${distanceKm} km away` : `${distanceM} meters away`;
      
      const modalContent = `
        <div style="text-align: center;">
          <div style="font-size: 48px; margin-bottom: 10px;">📍</div>
          <h3>${core().escapeHtml(courseCode)} - ${core().escapeHtml(lecturerName)}</h3>
          <div class="inner-panel" style="margin: 15px 0;">
            <p><strong>Your Location:</strong></p>
            <p style="font-family: monospace; font-size: 12px;">${userLat.toFixed(6)}, ${userLng.toFixed(6)}</p>
            <p><strong>Lecturer's Location:</strong></p>
            <p style="font-family: monospace; font-size: 12px;">${lecturerLat.toFixed(6)}, ${lecturerLng.toFixed(6)}</p>
            <hr>
            <p><strong>📏 Distance:</strong> <span style="color: var(--ug); font-weight: bold;">${distanceText}</span></p>
          </div>
          <div style="display: flex; gap: 10px; justify-content: center; flex-wrap: wrap;">
            <button class="btn btn-ug" onclick="window.open('https://www.google.com/maps/dir/?api=1&destination=${lecturerLat},${lecturerLng}&travelmode=walking', '_blank')">🚶 Get Walking Directions</button>
            <button class="btn btn-secondary" onclick="window.open('https://www.google.com/maps/dir/?api=1&destination=${lecturerLat},${lecturerLng}&travelmode=driving', '_blank')">🚗 Get Driving Directions</button>
            <button class="btn btn-outline" onclick="window.open('https://www.google.com/maps/@${lecturerLat},${lecturerLng},17z', '_blank')">🗺️ View on Map</button>
          </div>
        </div>
      `;
      await MODAL.alert(`📍 Directions to ${courseCode} Class`, modalContent, { icon: '🗺️', btnLabel: 'Close', width: '550px' });
    } catch(err) {
      const modalContent = `
        <div style="text-align: center;">
          <div class="strip-amber" style="margin-bottom: 15px;">
            <strong>⚠️ Could not get your current location</strong><br>
            Please enable location services or manually open maps.
          </div>
          <div class="inner-panel">
            <p><strong>Lecturer's Location:</strong></p>
            <p style="font-family: monospace;">${lecturerLat.toFixed(6)}, ${lecturerLng.toFixed(6)}</p>
          </div>
          <button class="btn btn-ug" onclick="window.open('https://www.google.com/maps?q=${lecturerLat},${lecturerLng}', '_blank')">🗺️ Open in Google Maps</button>
        </div>
      `;
      await MODAL.alert(`📍 ${courseCode} Class Location`, modalContent, { icon: '🗺️', btnLabel: 'Close', width: '450px' });
    }
  }

  return {
    initAudio,
    playNotificationSound,
    playReminderSound,
    requestAudioPermission,
    calculateDistance,
    getCurrentPosition,
    showLocationDirections
  };
})();

window.STUDENT_LOCATION = STUDENT_LOCATION;
