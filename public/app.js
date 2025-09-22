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
		       showExtraControls: false,
		       showAudioDevices: false,
		       toast: [{ type: "", message: "" }],
	       };
       },
	computed: {
		peersArray() {
			return Object.keys(this.peers)
				.filter((p) => this.peers[p].data.userAgent)
				.map((peer) => ({
					stream: this.peers[peer].stream,
					name: this.peers[peer].data.peerName,
					isTalking: this.peers[peer].data.isTalking,
				}));
		},
	},
	watch: {
		callInitiated(newValue, oldValue) {
			// if (oldValue && !newValue) {
			// 	// Call ended, clean up screen sharing
			// 	this.cleanupScreenShare();
			// }
		},
	},
	methods: {
		toggleExtraControls() {
			this.showExtraControls = !this.showExtraControls;
		},
		resetPopups() {
			this.showExtraControls = false;
			this.showAudioDevices = false;
		},
			   // ...existing code...
			   // ...existing code...
			   // ...existing code...
			   // ...existing code...
			   // ...existing code...
			   // ...existing code...

	       async initiateCall() {
		       if (!this.channelId) return alert("Invalid channel id");
		       if (!this.name) return alert("Please enter your name");
		       this.callInitiated = true;
		       this.showExtraControls = false;
		       window.initiateCall();
	       },
	   async autoInitiateCall() {
		       if (this.audioDevices.length === 0 ) {
			       alert("Check microphone permissions and reload the page");
			       setTimeout(async () => {
				       if (this.audioDevices.length === 0) {
					       await this.enumerateDevices();
				       }
				       this.autoInitiateCall();
			       }, 2000);
			       return;
		       }
		       this.channelId = window.location.pathname.substr(1);
		       const deviceName = hash(navigator.userAgent);
		       this.name = deviceName || "Guest";
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
		toggleVideo() {
			return this.toggleMedia("video");
		},
		switchAudioDevice(newDeviceId) {
			return this.switchMediaDevice(newDeviceId, "audio");
		},
		switchVideoDevice(newDeviceId) {
			return this.switchMediaDevice(newDeviceId, "video");
		},
		togglePreCallAudio() {
			this.audioEnabled = !this.audioEnabled;
			this.getPreCallMedia();
		},
		togglePreCallVideo() {
			this.videoEnabled = !this.videoEnabled;
			this.getPreCallMedia();
		},
		endCall() {
			// Disconnect from signaling server
			if (window.signalingSocket) {
				window.signalingSocket.disconnect();
			}

			// Clean up all peer connections
			Object.keys(this.peers).forEach((peerId) => {
				if (this.peers[peerId].rtc) {
					this.peers[peerId].rtc.close();
				}
			});

			// Clean up data channels
			Object.keys(this.dataChannels).forEach((peerId) => {
				if (this.dataChannels[peerId]) {
					this.dataChannels[peerId].close();
				}
			});

			// Reset call state
			this.peers = {};
			this.dataChannels = {};
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
		formatDate(dateString) {
			const date = new Date(dateString);
			const hours = date.getHours() > 12 ? date.getHours() - 12 : date.getHours();
			return (
				(hours < 10 ? "0" + hours : hours) +
				":" +
				(date.getMinutes() < 10 ? "0" + date.getMinutes() : date.getMinutes()) +
				" " +
				(date.getHours() >= 12 ? "PM" : "AM")
			);
		},
		sanitizeString(str) {
			const tagsToReplace = { "&": "&amp;", "<": "&lt;", ">": "&gt;" };
			const replaceTag = (tag) => tagsToReplace[tag] || tag;
			const safe_tags_replace = (str) => str.replace(/[&<>]/g, replaceTag);
			return safe_tags_replace(str);
		},
		endCall() {
			// Disconnect from signaling server
			if (window.signalingSocket) {
				window.signalingSocket.disconnect();
			}

			// Clean up all peer connections
			Object.keys(this.peers).forEach((peerId) => {
				if (this.peers[peerId].rtc) {
					this.peers[peerId].rtc.close();
				}
			});

			// Clean up data channels
			Object.keys(this.dataChannels).forEach((peerId) => {
				if (this.dataChannels[peerId]) {
					this.dataChannels[peerId].close();
				}
			});

			// Reset call state
			this.peers = {};
			this.dataChannels = {};
			this.callInitiated = false;

			// Show toast
			this.setToast("Call ended", "success");

			// Re-initialize pre-call preview
			this.getPreCallMedia();
		},
		async enumerateDevices() {
		       try {
			       const devices = await navigator.mediaDevices.enumerateDevices();
			       this.audioDevices = devices.filter((device) => device.kind === "audioinput");
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
			       };
			       this.localMediaStream = await navigator.mediaDevices.getUserMedia(constraints);

			       if (this.audioDevices.length === 0) {
				       await this.enumerateDevices();
			       }
		       } catch {
			       this.audioEnabled = false;
			       const tracks = [this.getBlankTrack("audio")];
			       this.localMediaStream = new MediaStream(tracks);
			       this.setToast("Unable to access microphone");
		       }
	       },
	},
	mounted() {
		// if (!this.callInitiated) {
		// 	this.getPreCallMedia(); ///????
		// }
	},
}).mount("#app");

// Register service worker for PWA functionality
// if ("serviceWorker" in navigator) {
// 	navigator.serviceWorker.register("/sw.js");
// }
