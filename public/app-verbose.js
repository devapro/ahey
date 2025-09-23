/* globals Vue */

"use strict";

// eslint-disable-next-line no-unused-vars
const App = Vue.createApp({
	data() {
		const channelId = window.location.pathname.substr(1);
		const searchParams = new URLSearchParams(window.location.search);
		const name = searchParams.get("name");

		return {
			channelId,
			peerId: "",
			userAgent: "",
			audioDevices: [],
			audioEnabled: true,
			selectedAudioDeviceId: null,
			name: name ?? window.localStorage.name,
			callInitiated: false,
			localMediaStream: null,
			peers: {},
			dataChannels: {},
			peerAudioElements: {}, // Store Audio() objects for each peer
			showExtraControls: false,
			showAudioDevices: false,
			toast: [{ type: "", message: "" }],
		};
	},
	computed: {
		peersArray() {
			const peers = Object.keys(this.peers);
			console.log('peersArray computed - total peers:', peers.length, 'peers:', peers);
			const filtered = peers.filter((p) => this.peers[p].data?.userAgent);
			console.log('peersArray computed - filtered peers:', filtered.length);
			return filtered.map((peer) => ({
				id: peer,
				name: this.peers[peer].data.peerName,
				isTalking: this.peers[peer].data.isTalking,
			}));
		},
	},
	methods: {
		toggleExtraControls() {
			this.showExtraControls = !this.showExtraControls;
		},
		getWebRTCManager() {
			return window.getWebRTCManager();
		},
		resetPopups() {
			this.showExtraControls = false;
			this.showAudioDevices = false;
		},
		async toggleMedia(kind) {
			if (kind !== "audio") return; // Only handle audio

			const enabledKey = "audioEnabled";
			const selectedDeviceIdKey = "selectedAudioDeviceId";
			const getTracks = "getAudioTracks";
			const replaceTrackMethod = "replaceAudioTrack";

			const existingTrack = this.localMediaStream[getTracks]()[0];

			if (existingTrack && this[enabledKey]) {
				existingTrack.enabled = false;
				this[enabledKey] = false;
				existingTrack.stop();
				this.removeMediaTrack(kind);
			} else {
				try {
					const constraints = { audio: { deviceId: { exact: this[selectedDeviceIdKey] } }, video: false };
					const newStream = await navigator.mediaDevices.getUserMedia(constraints);
					const newTrack = newStream[getTracks]()[0];
					this[replaceTrackMethod](newTrack);
					this[enabledKey] = true;
				} catch {
					this.setToast(`Failed to enable ${kind}`);
				}
			}
		},
		async switchMediaDevice(newDeviceId, kind) {
			if (kind !== "audio") return; // Only handle audio

			try {
				const constraints = { audio: { deviceId: { exact: newDeviceId } }, video: false };
				const newStream = await navigator.mediaDevices.getUserMedia(constraints);
				const getTracks = "getAudioTracks";
				const replaceTrackMethod = "replaceAudioTrack";
				if (this.localMediaStream) {
					const oldTrack = this.localMediaStream[getTracks]()[0];
					if (oldTrack) oldTrack.stop();
				}
				const newTrack = newStream[getTracks]()[0];
				this[replaceTrackMethod](newTrack);
				this.setToast(`${kind.charAt(0).toUpperCase() + kind.slice(1)} device changed successfully`, "success");
			} catch {
				this.setToast(`Failed to switch ${kind} device`);
			}
		},
		replaceMediaTrack(newTrack, kind) {
			if (kind !== "audio") return; // Only handle audio

			Object.keys(this.peers).forEach((peerId) => {
				const peerConnection = this.peers[peerId].rtc;
				const senders = peerConnection.getSenders();
				const sender = senders.find((s) => s.track && s.track.kind === "audio");
				if (sender) {
					sender.replaceTrack(newTrack);
				} else {
					peerConnection.addTrack(newTrack, this.localMediaStream);
					this.triggerRenegotiation(peerId);
				}
			});
			if (this.localMediaStream) {
				const oldTrack = this.localMediaStream.getAudioTracks()[0];
				if (oldTrack) this.localMediaStream.removeTrack(oldTrack);
				this.localMediaStream.addTrack(newTrack);
			}
		},
		removeMediaTrack(kind) {
			if (kind !== "audio") return; // Only handle audio

			const blankTrack = this.getBlankTrack(kind);
			if (!blankTrack) return;

			// Replace track in all peer connections
			Object.keys(this.peers).forEach((peerId) => {
				const peerConnection = this.peers[peerId].rtc;
				const senders = peerConnection.getSenders();
				const sender = senders.find((s) => s.track && s.track.kind === "audio");
				if (sender) {
					sender.replaceTrack(blankTrack);
				}
			});

			// Replace in localMediaStream
			if (this.localMediaStream) {
				const oldTrack = this.localMediaStream.getAudioTracks()[0];
				if (oldTrack) this.localMediaStream.removeTrack(oldTrack);
				this.localMediaStream.addTrack(blankTrack);
			}
		},
		async triggerRenegotiation(peerId) {
			try {
				const peerConnection = this.peers[peerId].rtc;

				const offer = await peerConnection.createOffer();
				await peerConnection.setLocalDescription(offer);

				// Send the offer through the signaling server
				if (window.signalingSocket) {
					window.signalingSocket.emit("relaySessionDescription", {
						peer_id: peerId,
						session_description: offer,
					});
				}
			} catch (error) {
				console.error(`Error during renegotiation for peer ${peerId}:`, error);
			}
		},
		replaceAudioTrack(newAudioTrack) {
			// Replace audio track in all peer connections
			Object.keys(this.peers).forEach((peerId) => {
				const peerConnection = this.peers[peerId].rtc;
				const senders = peerConnection.getSenders();
				const audioSender = senders.find((sender) => sender.track && sender.track.kind === "audio");

				if (audioSender) {
					// Replace existing audio track
					audioSender.replaceTrack(newAudioTrack);
				} else {
					// No existing audio sender, add new audio track
					peerConnection.addTrack(newAudioTrack, this.localMediaStream);
					// Trigger renegotiation for this peer
					this.triggerRenegotiation(peerId);
				}
			});

			// Update local media stream
			if (this.localMediaStream) {
				const oldAudioTrack = this.localMediaStream.getAudioTracks()[0];
				if (oldAudioTrack) {
					this.localMediaStream.removeTrack(oldAudioTrack);
				}
				this.localMediaStream.addTrack(newAudioTrack);
			}
		},
		async initiateCall() {
			await this.getPreCallMedia();
			if (this.audioDevices.length === 0 ) {
				alert("Check microphone permissions and reload the page");
				setTimeout(async () => {
					// Enumerate devices once during pre-call flow if not already done
					if (this.audioDevices.length === 0) {
						await this.enumerateDevices();
					}
					this.initiateCall();
				}, 2000);
				return;
			}
			if (!this.channelId) {
				this.channelId = window.location.pathname.substr(1);
			}
			if (!this.name) {
				const deviceName = hash(navigator.userAgent);
				this.name = deviceName || "Guest";
			}

			this.callInitiated = true;
			this.showExtraControls = false;
			window.initiateCall();
		},
		setToast(message, type = "error") {
			this.toast = { type, message, time: new Date().getTime() };
			setTimeout(() => {
				if (new Date().getTime() - this.toast.time >= 3000) {
					this.toast.message = "";
				}
			}, 3500);
		},
		copyURL() {
			navigator.clipboard.writeText(`${window.location.origin}/${this.channelId}`).then(
				() => this.setToast("Channel URL copied 👍", "success"),
				() => console.error("Unable to copy channel URL")
			);
		},
		toggleAudio() {
			return this.toggleMedia("audio");
		},
		switchAudioDevice(newDeviceId) {
			return this.switchMediaDevice(newDeviceId, "audio");
		},
		togglePreCallAudio() {
			this.audioEnabled = !this.audioEnabled;
			this.getPreCallMedia();
		},
		endCall() {
			const webrtcManager = this.getWebRTCManager();
			webrtcManager.endCall();

			// Clean up peer audio elements
			Object.keys(this.peerAudioElements).forEach(peerId => {
				if (this.peerAudioElements[peerId]) {
					this.peerAudioElements[peerId].pause();
					this.peerAudioElements[peerId] = null;
				}
			});
			this.peerAudioElements = {};

			// Reset call state
			this.callInitiated = false;

			// Show toast
			this.setToast("Call ended", "success");

			// Re-initialize pre-call preview
			this.getPreCallMedia();
		},
		stopEvent(e) {
			e.preventDefault();
			e.stopPropagation();
		},
		updateName() {
			window.localStorage.name = this.name;
		},
		updateNameAndPublish() {
			window.localStorage.name = this.name;
			this.updateUserData("peerName", this.name);
		},
		updateUserData(key, value) {
			this.sendDataMessage(key, value);
		},
		sendDataMessage(key, value) {
			const date = new Date().toISOString();
			const dataMessage = { type: key, name: this.name, peerId: this.peerId, message: value, date };

			switch (key) {
				default:
					break;
			}

			Object.keys(this.dataChannels).map((peer_id) => this.dataChannels[peer_id].send(JSON.stringify(dataMessage)));
		},
		setTalkingPeer(peerId, isTalking) {
			if (this.peers[peerId] && this.peers[peerId].data.isTalking !== isTalking) {
				this.peers[peerId].data.isTalking = isTalking;
			}
		},
		handleIncomingDataChannelMessage(dataMessage) {
			if (!this.peers[dataMessage.peerId]) return;
			switch (dataMessage.type) {
				case "peerName":
					this.peers[dataMessage.peerId].data.peerName = dataMessage.message;
					break;
				default:
					break;
			}
		},
		// Handle peer stream using Audio() objects instead of video tags
		handlePeerStream(peerId, stream) {
			console.log('Handling peer stream for:', peerId);

			// Clean up existing audio element if any
			if (this.peerAudioElements[peerId]) {
				this.peerAudioElements[peerId].pause();
				this.peerAudioElements[peerId] = null;
			}

			// Create new Audio element
			const audioElement = new Audio();
			audioElement.srcObject = stream;
			audioElement.autoplay = true;
			audioElement.playsInline = true;

			// Store reference
			this.peerAudioElements[peerId] = audioElement;

			// Handle play errors
			audioElement.play().catch(error => {
				console.error('Error playing peer audio:', error);
				// Try to play again after user interaction
				setTimeout(() => {
					audioElement.play().catch(e => {
						console.error('Failed to auto-play peer audio even after delay:', e);
					});
				}, 1000);
			});
		},
		// Clean up peer audio when peer leaves
		cleanupPeerAudio(peerId) {
			if (this.peerAudioElements[peerId]) {
				this.peerAudioElements[peerId].pause();
				this.peerAudioElements[peerId] = null;
				delete this.peerAudioElements[peerId];
			}
		},
		async enumerateDevices() {
			// Request media permissions and enumerate devices
			try {
				const devices = await navigator.mediaDevices.enumerateDevices();
				this.audioDevices = devices.filter((device) => device.kind === "audioinput");

				// Set default device ids
				const defaultAudioDeviceId = this.audioDevices.find((device) => device.deviceId == "default")?.deviceId;
				this.selectedAudioDeviceId = defaultAudioDeviceId ?? this.audioDevices[0]?.deviceId;
			} catch (error) {
				console.error("Failed to initialize media devices:", error);
			}
		},
		getBlankTrack(kind) {
			if (kind === "audio") {
				const ctx = new (window.AudioContext || window.webkitAudioContext)();
				const oscillator = ctx.createOscillator();
				const dst = ctx.createMediaStreamDestination();
				oscillator.connect(dst);
				oscillator.start();
				oscillator.stop(ctx.currentTime + 0.01);
				return dst.stream.getAudioTracks()[0];
			}
			return null;
		},
		async getPreCallMedia() {
			try {
				if (this.localMediaStream) {
					this.localMediaStream.getTracks().forEach((track) => track.stop());
				}
				const constraints = {
					audio: this.audioEnabled
						? this.selectedAudioDeviceId
							? { deviceId: this.selectedAudioDeviceId }
							: true
						: false,
					video: false, // Never request video
				};
				this.localMediaStream = await navigator.mediaDevices.getUserMedia(constraints);

				// Enumerate devices once during pre-call flow if not already done
				if (this.audioDevices.length === 0) {
					await this.enumerateDevices();
				}
			} catch {
				// If user denies access, create blank tracks as needed
				this.audioEnabled = false;
				const tracks = [this.getBlankTrack("audio")];
				this.localMediaStream = new MediaStream(tracks);
				this.setToast("Unable to access microphone");
			}
		},
	},
	mounted() {
		console.log('Vue App mounted! window.markAppReady available:', !!window.markAppReady);
		// Notify peer.js that Vue App is ready
		if (window.markAppReady) {
			console.log('Vue App calling markAppReady()');
			window.markAppReady();
		} else {
			console.warn('Vue App mounted but markAppReady not available');
		}
		if (!this.callInitiated) {
			this.getPreCallMedia();
		}

		// Auto-initiate call if URL path is /join
		if (window.location.pathname === '/join') {
			console.log('Auto-initiating call for /join URL');
			setTimeout(() => {
				this.initiateCall();
			}, 1000); // Small delay to ensure everything is initialized
		}
	},
}).mount("#app");

window.App = App;

// Register service worker for PWA functionality
if ("serviceWorker" in navigator) {
	navigator.serviceWorker.register("/sw.js");
}