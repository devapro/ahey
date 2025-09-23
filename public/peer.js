/* globals WebRTCManager, io */
"use strict";

// Global WebRTC manager instance
let webrtcManager = null;

// Legacy global window exposure for compatibility
window.signalingSocket = null;

// Event queue for events that arrive before Vue app is ready
let eventQueue = [];
let appReady = false;

// Initialize WebRTC Manager
function initializeWebRTCManager() {
	if (webrtcManager) {
		webrtcManager.destroy();
	}

	webrtcManager = new WebRTCManager();

	// Setup event listeners to bridge with the UI (App)
	setupEventListeners();

	return webrtcManager;
}

// Function to process queued events when App becomes ready
function processQueuedEvents() {
	console.log('peer.js: Processing', eventQueue.length, 'queued events');
	while (eventQueue.length > 0) {
		const { type, handler, data } = eventQueue.shift();
		console.log('peer.js: Processing queued', type, 'event');
		try {
			handler(data);
		} catch (error) {
			console.error('peer.js: Error processing queued event', type, error);
		}
	}
}

// Function to mark app as ready and process queue
function markAppReady() {
	console.log('peer.js: markAppReady called - appReady:', appReady, 'window.App:', !!window.App);
	if (!appReady && window.App) {
		console.log('peer.js: Vue App is now ready, processing queue');
		appReady = true;
		processQueuedEvents();
	} else if (!window.App) {
		console.log('peer.js: markAppReady called but App not available yet');
	} else if (appReady) {
		console.log('peer.js: markAppReady called but app already ready');
	}
}

// Helper function to handle events (either immediately or queue them)
const handleEvent = (eventType, handler) => {
	return (data) => {
		if (appReady && window.App) {
			handler(data);
		} else {
			console.log(`peer.js: Queueing ${eventType} event - App not ready yet`);
			eventQueue.push({ type: eventType, handler, data });
		}
	};
};

function setupEventListeners() {
	if (!webrtcManager) return;

	// Local stream ready
	webrtcManager.on('localStreamReady', (stream) => {
		if (window.App) {
			App.localMediaStream = stream;
		}
	});

	console.log('Setting up peer event listeners...');

	// Peer events
	webrtcManager.on('peerAdded', handleEvent('peerAdded', ({ peerId, peerData }) => {
		console.log('peer.js: Processing peerAdded event', peerId, peerData);
			// Use Vue.set or modern reactive assignment to ensure reactivity
			if (window.Vue && Vue.set) {
				Vue.set(App.peers, peerId, {
					rtc: webrtcManager.peers[peerId].rtc,
					stream: null,
					data: peerData
				});
			} else {
				// For Vue 3, direct assignment should work with reactive objects
				App.peers[peerId] = {
					rtc: webrtcManager.peers[peerId].rtc,
					stream: null,
					data: peerData
				};
				// Force reactivity update
				App.$forceUpdate?.();
			}
			// Ensure dataChannels are also synchronized
			if (webrtcManager.dataChannels[peerId]) {
				App.dataChannels[peerId] = webrtcManager.dataChannels[peerId];
			}
		console.log('peer.js: Added to App.peers:', peerId, peerData, 'Total peers:', Object.keys(App.peers).length);
	}));

	webrtcManager.on('peerStreamReady', handleEvent('peerStreamReady', ({ peerId, stream }) => {
		console.log('peer.js: Processing peerStreamReady event', peerId);
		if (App.peers[peerId]) {
			App.peers[peerId].stream = stream;
			// Handle audio stream with Audio() objects
			if (App.handlePeerStream) {
				App.handlePeerStream(peerId, stream);
			}
			// Force reactivity update for stream changes
			App.$forceUpdate?.();
			console.log('peer.js: Stream added to peer:', peerId);
		} else {
			console.warn('peer.js: Peer not found when setting stream', peerId, 'Available peers:', Object.keys(App.peers || {}));
		}
	}));

	webrtcManager.on('peerRemoved', handleEvent('peerRemoved', ({ peerId }) => {
		console.log('peer.js: Processing peerRemoved event', peerId);
		if (App.peers[peerId]) {
			// Clean up audio elements
			if (App.cleanupPeerAudio) {
				App.cleanupPeerAudio(peerId);
			}
			delete App.peers[peerId];
			// Force reactivity update
			App.$forceUpdate?.();
			console.log('peer.js: Removed from App.peers:', peerId);
		}
		if (App.dataChannels[peerId]) {
			delete App.dataChannels[peerId];
		}
		console.log('peer.js: Peer removed from all structures:', peerId, 'Remaining peers:', Object.keys(App.peers || {}).length);
	}));

	webrtcManager.on('allPeersRemoved', () => {
		if (window.App) {
			App.peers = {};
			App.dataChannels = {};
		}
	});

	webrtcManager.on('peerTalking', ({ peerId, isTalking }) => {
		if (window.App && App.setTalkingPeer) {
			App.setTalkingPeer(peerId, isTalking);
		}
	});

	webrtcManager.on('peerNameChanged', ({ peerId, name }) => {
		if (window.App && App.peers[peerId]) {
			App.peers[peerId].data.peerName = name;
		}
	});

	// Connection events
	webrtcManager.on('connected', ({ peerId }) => {
		if (window.App) {
			App.peerId = peerId;
		}
		// Expose signaling socket for backward compatibility
		window.signalingSocket = webrtcManager.signalingSocket;
	});

	webrtcManager.on('disconnected', () => {
		window.signalingSocket = null;
	});

	// Data channel events
	webrtcManager.on('dataChannelMessage', (dataMessage) => {
		if (window.App && App.handleIncomingDataChannelMessage) {
			App.handleIncomingDataChannelMessage(dataMessage);
		}
	});

	// Error handling
	webrtcManager.on('error', ({ type, error }) => {
		console.error(`WebRTC Error (${type}):`, error);
		if (window.App && App.setToast) {
			switch (type) {
				case 'mediaAccess':
					App.setToast("Unable to access camera/microphone");
					break;
				case 'deviceEnumeration':
					App.setToast("Failed to enumerate media devices");
					break;
				default:
					App.setToast(`WebRTC Error: ${type}`);
			}
		}
	});

	// Device enumeration
	webrtcManager.on('devicesEnumerated', ({ audioDevices, videoDevices }) => {
		if (window.App) {
			App.audioDevices = audioDevices;
			App.videoDevices = videoDevices;

			// Set default device ids
			const defaultAudioDeviceId = audioDevices.find((device) => device.deviceId === "default")?.deviceId;
			const defaultVideoDeviceId = videoDevices.find((device) => device.deviceId === "default")?.deviceId;

			App.selectedAudioDeviceId = defaultAudioDeviceId ?? audioDevices[0]?.deviceId;
			App.selectedVideoDeviceId = defaultVideoDeviceId ?? videoDevices[0]?.deviceId;

			// Update the manager's settings
			webrtcManager.selectedAudioDeviceId = App.selectedAudioDeviceId;
			webrtcManager.selectedVideoDeviceId = App.selectedVideoDeviceId;
		}
	});

	// Call state events
	webrtcManager.on('callInitiated', () => {
		// Call initiated event
	});

	webrtcManager.on('callEnded', () => {
		// Call ended event
	});
}

// Legacy compatibility functions
window.initiateCall = async function() {
	if (!webrtcManager) {
		webrtcManager = initializeWebRTCManager();
	}

	// Sync settings from App if available
	if (window.App) {
		webrtcManager.audioEnabled = App.audioEnabled;
		webrtcManager.videoEnabled = App.videoEnabled;
		webrtcManager.selectedAudioDeviceId = App.selectedAudioDeviceId;
		webrtcManager.selectedVideoDeviceId = App.selectedVideoDeviceId;
		webrtcManager.name = App.name;

		// Update dataChannels reference
		App.dataChannels = webrtcManager.dataChannels;
	}

	const config = {
		channelId: window.App?.channelId || window.location.pathname.substr(1),
		name: webrtcManager.name,
		signalingServer: window.location.origin
	};

	try {
		await webrtcManager.initiateCall(config);
	} catch (error) {
		console.error('Failed to initiate call:', error);
		if (window.App && App.setToast) {
			App.setToast("Failed to start call");
		}
	}
};

// Legacy function for setting up local media (now handled by WebRTC manager)
function setupLocalMedia(callback) {
	if (!webrtcManager) {
		webrtcManager = initializeWebRTCManager();
	}

	// Sync settings from App
	if (window.App) {
		webrtcManager.audioEnabled = App.audioEnabled;
		webrtcManager.videoEnabled = App.videoEnabled;
		webrtcManager.selectedAudioDeviceId = App.selectedAudioDeviceId;
		webrtcManager.selectedVideoDeviceId = App.selectedVideoDeviceId;
	}

	if (webrtcManager.localMediaStream) {
		if (callback) callback();
		return;
	}

	webrtcManager.getUserMedia()
		.then((stream) => {
			if (callback) callback();
		})
		.catch((error) => {
			console.error('setupLocalMedia error:', error);
			if (window.App && App.setToast) {
				App.setToast("Unable to get microphone access.");
			}
		});
}

// Export the manager instance for direct access if needed
window.getWebRTCManager = function() {
	if (!webrtcManager) {
		webrtcManager = initializeWebRTCManager();
	}
	return webrtcManager;
};

// Export markAppReady function for Vue app to call
window.markAppReady = markAppReady;

// Initialize on load
if (typeof window !== 'undefined') {
	// Auto-initialize when the script loads
	webrtcManager = initializeWebRTCManager();

	// Poll for Vue app readiness as fallback
	const pollForApp = () => {
		if (!appReady && window.App) {
			console.log('peer.js: Vue App detected via polling');
			markAppReady();
		} else if (!appReady) {
			console.log('peer.js: Still polling for Vue App... window.App:', !!window.App, 'appReady:', appReady);
			setTimeout(pollForApp, 500);
		}
	};

	// Start polling after a short delay
	setTimeout(pollForApp, 100);
}