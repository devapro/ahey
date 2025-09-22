/* globals ICE_SERVERS */
"use strict";

/**
 * Pure JavaScript WebRTC Manager
 * Framework-agnostic WebRTC functionality that can be used with any UI framework
 */

class WebRTCManager {
	constructor() {
		// Core state
		this.peers = {};
		this.dataChannels = {};
		this.localMediaStream = null;
		this.signalingSocket = null;
		this.peerId = null;
		this.channelId = null;
		this.userAgent = navigator.userAgent;
		this.name = null;

		// Media settings
		this.audioEnabled = true;
		this.videoEnabled = true;
		this.selectedAudioDeviceId = null;
		this.selectedVideoDeviceId = null;

		// Audio analysis
		this.audioStreams = new Map();
		this.VOLUME_THRESHOLD = 24;
		this.AUDIO_WINDOW_SIZE = 256;

		// Event listeners
		this.eventListeners = {};

		// Bind methods
		this.handleSocketConnect = this.handleSocketConnect.bind(this);
		this.handleSocketDisconnect = this.handleSocketDisconnect.bind(this);
		this.handleAddPeer = this.handleAddPeer.bind(this);
		this.handleRemovePeer = this.handleRemovePeer.bind(this);
		this.handleSessionDescription = this.handleSessionDescription.bind(this);
		this.handleIceCandidate = this.handleIceCandidate.bind(this);
	}

	// Event system
	on(event, callback) {
		if (!this.eventListeners[event]) {
			this.eventListeners[event] = [];
		}
		this.eventListeners[event].push(callback);
	}

	off(event, callback) {
		if (!this.eventListeners[event]) return;
		const index = this.eventListeners[event].indexOf(callback);
		if (index > -1) {
			this.eventListeners[event].splice(index, 1);
		}
	}

	emit(event, data) {
		if (!this.eventListeners[event]) return;
		this.eventListeners[event].forEach(callback => callback(data));
	}

	// Media device management
	async enumerateDevices() {
		try {
			const devices = await navigator.mediaDevices.enumerateDevices();
			const audioDevices = devices.filter(device => device.kind === "audioinput");
			const videoDevices = devices.filter(device => device.kind === "videoinput");

			this.emit('devicesEnumerated', { audioDevices, videoDevices });
			return { audioDevices, videoDevices };
		} catch (error) {
			this.emit('error', { type: 'deviceEnumeration', error });
			throw error;
		}
	}

	// Media stream management
	async getUserMedia(constraints = null) {
		try {
			const finalConstraints = constraints || {
				audio: this.audioEnabled ?
					(this.selectedAudioDeviceId ? { deviceId: this.selectedAudioDeviceId } : true) :
					false,
				video: this.videoEnabled ?
					(this.selectedVideoDeviceId ? { deviceId: this.selectedVideoDeviceId } : true) :
					false,
			};

			const stream = await navigator.mediaDevices.getUserMedia(finalConstraints);
			this.localMediaStream = stream;
			this.emit('localStreamReady', stream);
			return stream;
		} catch (error) {
			this.emit('error', { type: 'mediaAccess', error });
			throw error;
		}
	}

	// WebRTC Peer Connection management
	createPeerConnection() {
		return new RTCPeerConnection({ iceServers: ICE_SERVERS });
	}

	setupPeerConnectionHandlers(peerConnection, peerId) {
		peerConnection.onicecandidate = (event) => {
			if (event.candidate && this.signalingSocket) {
				this.signalingSocket.emit("relayICECandidate", {
					peer_id: peerId,
					ice_candidate: {
						sdpMLineIndex: event.candidate.sdpMLineIndex,
						candidate: event.candidate.candidate,
					},
				});
			}
		};

		peerConnection.ontrack = (event) => {
			const stream = event.streams[0];
			this.peers[peerId].stream = stream;
			console.log('WebRTCManager: Peer stream ready', peerId);
			this.emit('peerStreamReady', { peerId, stream });

			// Handle audio stream for talking detection
			if (stream.getAudioTracks().length > 0 && !this.audioStreams.has(peerId)) {
				this.handleAudioStream(stream, peerId);
			}
		};

		peerConnection.ondatachannel = (event) => {
			event.channel.onmessage = (msg) => {
				try {
					const dataMessage = JSON.parse(msg.data);
					this.handleIncomingDataChannelMessage(dataMessage);
				} catch (err) {
					this.emit('error', { type: 'dataChannel', error: err });
				}
			};
		};
	}

	addLocalTracksToPeer(peerConnection) {
		if (this.localMediaStream) {
			this.localMediaStream.getTracks().forEach((track) => {
				const sender = peerConnection.addTrack(track, this.localMediaStream);
				// Set codec preferences for video tracks if supported
				if (track.kind === "video" && window.RTCRtpSender && RTCRtpSender.getCapabilities) {
					const codecs = RTCRtpSender.getCapabilities("video").codecs;
					const preferredCodecs = codecs.filter((codec) => codec.mimeType.toLowerCase() === "video/h264");
					const transceiver = peerConnection.getTransceivers().find((t) => t.sender === sender);
					if (transceiver && transceiver.setCodecPreferences && preferredCodecs.length) {
						transceiver.setCodecPreferences(preferredCodecs);
					}
				}
			});
		}
	}

	// SDP manipulation for H.264 preference
	preferH264(sdp) {
		const sdpLines = sdp.split("\r\n");
		const mLineIndex = sdpLines.findIndex((line) => line.startsWith("m=video"));
		if (mLineIndex === -1) return sdp;

		// Find all H264 payload types
		const h264PayloadTypes = sdpLines
			.filter((line) => line.startsWith("a=rtpmap") && line.toLowerCase().includes("h264"))
			.map((line) => {
				const match = line.match(/^a=rtpmap:(\d+)\s+H264/i);
				return match ? match[1] : null;
			})
			.filter(Boolean);

		if (h264PayloadTypes.length === 0) return sdp;

		// Reorder m=video line to put H264 first
		const mLineParts = sdpLines[mLineIndex].split(" ");
		const newMLine = [
			...mLineParts.slice(0, 3),
			...h264PayloadTypes,
			...mLineParts.slice(3).filter((pt) => !h264PayloadTypes.includes(pt)),
		];
		sdpLines[mLineIndex] = newMLine.join(" ");

		return sdpLines.join("\r\n");
	}

	setupOfferCreation(peerConnection, peerId) {
		peerConnection.onnegotiationneeded = () => {
			peerConnection
				.createOffer()
				.then((localDescription) => {
					// Prefer H.264 in SDP for Safari compatibility
					localDescription.sdp = this.preferH264(localDescription.sdp);
					peerConnection
						.setLocalDescription(localDescription)
						.then(() => {
							if (this.signalingSocket) {
								this.signalingSocket.emit("relaySessionDescription", {
									peer_id: peerId,
									session_description: localDescription,
								});
							}
						})
						.catch((error) => this.emit('error', { type: 'setLocalDescription', error }));
				})
				.catch((error) => this.emit('error', { type: 'createOffer', error }));
		};
	}

	// Audio stream analysis for talking detection
	handleAudioStream(stream, peerId) {
		const audioContext = new AudioContext();
		const mediaStreamSource = audioContext.createMediaStreamSource(stream);
		const analyserNode = audioContext.createAnalyser();
		analyserNode.fftSize = this.AUDIO_WINDOW_SIZE;
		mediaStreamSource.connect(analyserNode);
		const bufferLength = analyserNode.frequencyBinCount;
		const dataArray = new Uint8Array(bufferLength);

		const processAudio = () => {
			analyserNode.getByteFrequencyData(dataArray);
			const averageVolume = dataArray.reduce((acc, val) => acc + val, 0) / bufferLength;
			const isTalking = averageVolume > this.VOLUME_THRESHOLD;

			if (this.peers[peerId] && this.peers[peerId].data.isTalking !== isTalking) {
				this.peers[peerId].data.isTalking = isTalking;
				this.emit('peerTalking', { peerId, isTalking });
			}

			requestAnimationFrame(processAudio);
		};

		processAudio();
		this.audioStreams.set(peerId, { stream, analyserNode });
	}

	removeAudioStream(peerId) {
		const streamData = this.audioStreams.get(peerId);
		if (streamData) {
			streamData.stream.getTracks().forEach((track) => track.stop());
			streamData.analyserNode.disconnect();
			this.audioStreams.delete(peerId);
		}
	}

	// Data channel message handling
	handleIncomingDataChannelMessage(dataMessage) {
		if (!this.peers[dataMessage.peerId]) return;

		switch (dataMessage.type) {
			case "peerName":
				this.peers[dataMessage.peerId].data.peerName = dataMessage.message;
				this.emit('peerNameChanged', { peerId: dataMessage.peerId, name: dataMessage.message });
				break;
			default:
				this.emit('dataChannelMessage', dataMessage);
				break;
		}
	}

	// Peer management
	cleanupPeer(peerId) {
		console.log('WebRTCManager: Cleaning up peer', peerId);
		if (peerId in this.peers) {
			this.peers[peerId].rtc.close();
		}
		delete this.dataChannels[peerId];
		delete this.peers[peerId];
		this.removeAudioStream(peerId);
		this.emit('peerRemoved', { peerId });
	}

	cleanupAllPeers() {
		console.log('WebRTCManager: Cleaning up all peers', Object.keys(this.peers));
		Object.keys(this.peers).forEach((peerId) => {
			this.peers[peerId].rtc.close();
		});
		this.peers = {};
		this.emit('allPeersRemoved');
	}

	// Signaling handlers
	handleSocketConnect() {
		console.log('WebRTCManager: Socket connected');
		this.peerId = this.signalingSocket.id;
		const userData = { peerName: this.name, userAgent: this.userAgent };
		console.log('WebRTCManager: My peer ID:', this.peerId, 'userData:', userData);

		if (this.localMediaStream) {
			console.log('WebRTCManager: Joining channel with existing media');
			this.joinChannel(this.channelId, userData);
		} else {
			console.log('WebRTCManager: Getting media then joining channel');
			this.getUserMedia().then(() => {
				this.joinChannel(this.channelId, userData);
			}).catch(() => {
				console.log('WebRTCManager: Failed to get media, joining anyway');
				// Join anyway with no media
				this.joinChannel(this.channelId, userData);
			});
		}

		this.emit('connected', { peerId: this.peerId });
	}

	handleSocketDisconnect() {
		console.log('WebRTCManager: Socket disconnected');
		this.cleanupAllPeers();
		this.emit('disconnected');
	}

	handleAddPeer(config) {
		const peerId = config.peer_id;
		if (peerId in this.peers) return;

		const peerConnection = this.createPeerConnection();
		this.peers[peerId] = {
			rtc: peerConnection,
			data: config.channel[peerId].userData,
			stream: null
		};

		this.setupPeerConnectionHandlers(peerConnection, peerId);
		this.addLocalTracksToPeer(peerConnection);
		this.dataChannels[peerId] = peerConnection.createDataChannel("ot__data_channel");

		if (config.should_create_offer) {
			this.setupOfferCreation(peerConnection, peerId);
		}

		console.log('WebRTCManager: Peer added', peerId, this.peers[peerId].data);
		this.emit('peerAdded', { peerId, peerData: this.peers[peerId].data });
	}

	handleRemovePeer(config) {
		console.log('WebRTCManager: Received removePeer event', config.peer_id);
		this.cleanupPeer(config.peer_id);
	}

	handleSessionDescription(config) {
		const peerId = config.peer_id;
		const peer = this.peers[peerId]?.rtc;
		if (!peer) return;

		const remoteDescription = config.session_description;

		// Prefer H.264 in SDP for Safari compatibility
		if (remoteDescription && remoteDescription.sdp) {
			remoteDescription.sdp = this.preferH264(remoteDescription.sdp);
		}

		const desc = new RTCSessionDescription(remoteDescription);
		peer.setRemoteDescription(
			desc,
			() => {
				if (remoteDescription.type === "offer") {
					peer.createAnswer(
						(localDescription) => {
							// Prefer H.264 in SDP for Safari compatibility
							localDescription.sdp = this.preferH264(localDescription.sdp);
							peer.setLocalDescription(
								localDescription,
								() => {
									if (this.signalingSocket) {
										this.signalingSocket.emit("relaySessionDescription", {
											peer_id: peerId,
											session_description: localDescription,
										});
									}
								},
								(error) => this.emit('error', { type: 'answerSetLocalDescription', error })
							);
						},
						(error) => this.emit('error', { type: 'createAnswer', error })
					);
				}
			},
			(error) => this.emit('error', { type: 'setRemoteDescription', error })
		);
	}

	handleIceCandidate(config) {
		const peer = this.peers[config.peer_id]?.rtc;
		if (!peer) return;

		const iceCandidate = config.ice_candidate;
		peer.addIceCandidate(new RTCIceCandidate(iceCandidate)).catch((error) => {
			this.emit('error', { type: 'addIceCandidate', error });
		});
	}

	// Public API
	joinChannel(channelId, userData) {
		console.log('WebRTCManager: Joining channel', channelId, 'with userData:', userData);
		if (this.signalingSocket) {
			this.signalingSocket.emit("join", { channel: channelId, userData });
			console.log('WebRTCManager: Join event sent');
		} else {
			console.warn('WebRTCManager: No signaling socket available for join');
		}
	}

	async initiateCall(config) {
		this.channelId = config.channelId;
		this.name = config.name;

		// Import io from socket.io - ensure it's available
		if (!window.io) {
			throw new Error('Socket.io not available. Make sure socket.io script is loaded.');
		}
		this.signalingSocket = window.io(config.signalingServer);

		// Setup socket event listeners
		this.signalingSocket.on("connect", this.handleSocketConnect);
		this.signalingSocket.on("disconnect", this.handleSocketDisconnect);
		this.signalingSocket.on("addPeer", this.handleAddPeer);
		this.signalingSocket.on("removePeer", this.handleRemovePeer);
		this.signalingSocket.on("sessionDescription", this.handleSessionDescription);
		this.signalingSocket.on("iceCandidate", this.handleIceCandidate);

		this.emit('callInitiated');
	}

	endCall() {
		if (this.signalingSocket) {
			this.signalingSocket.disconnect();
		}
		this.cleanupAllPeers();

		// Clear data channels
		Object.keys(this.dataChannels).forEach((peerId) => {
			if (this.dataChannels[peerId]) {
				this.dataChannels[peerId].close();
			}
		});
		this.dataChannels = {};

		this.emit('callEnded');
	}

	sendDataMessage(type, message) {
		const date = new Date().toISOString();
		const dataMessage = {
			type,
			name: this.name,
			peerId: this.peerId,
			message,
			date
		};

		Object.keys(this.dataChannels).forEach(peerId => {
			try {
				this.dataChannels[peerId].send(JSON.stringify(dataMessage));
			} catch (error) {
				this.emit('error', { type: 'sendDataMessage', error, peerId });
			}
		});

		this.emit('dataSent', dataMessage);
	}

	// Media control
	async replaceVideoTrack(newVideoTrack) {
		// Replace video track in all peer connections
		Object.keys(this.peers).forEach((peerId) => {
			const peerConnection = this.peers[peerId].rtc;
			const senders = peerConnection.getSenders();
			const videoSender = senders.find((sender) => sender.track && sender.track.kind === "video");

			if (videoSender) {
				videoSender.replaceTrack(newVideoTrack);
			} else {
				peerConnection.addTrack(newVideoTrack, this.localMediaStream);
				this.triggerRenegotiation(peerId);
			}
		});

		// Update local video stream
		if (this.localMediaStream) {
			const oldVideoTrack = this.localMediaStream.getVideoTracks()[0];
			if (oldVideoTrack) {
				this.localMediaStream.removeTrack(oldVideoTrack);
			}
			this.localMediaStream.addTrack(newVideoTrack);
		}

		this.emit('videoTrackReplaced', { track: newVideoTrack });
	}

	async replaceAudioTrack(newAudioTrack) {
		// Replace audio track in all peer connections
		Object.keys(this.peers).forEach((peerId) => {
			const peerConnection = this.peers[peerId].rtc;
			const senders = peerConnection.getSenders();
			const audioSender = senders.find((sender) => sender.track && sender.track.kind === "audio");

			if (audioSender) {
				audioSender.replaceTrack(newAudioTrack);
			} else {
				peerConnection.addTrack(newAudioTrack, this.localMediaStream);
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

		this.emit('audioTrackReplaced', { track: newAudioTrack });
	}

	async triggerRenegotiation(peerId) {
		try {
			const peerConnection = this.peers[peerId].rtc;
			const offer = await peerConnection.createOffer();
			await peerConnection.setLocalDescription(offer);

			if (this.signalingSocket) {
				this.signalingSocket.emit("relaySessionDescription", {
					peer_id: peerId,
					session_description: offer,
				});
			}
		} catch (error) {
			this.emit('error', { type: 'renegotiation', error, peerId });
		}
	}

	// Utility methods
	getPeers() {
		return this.peers;
	}

	getPeerArray() {
		return Object.keys(this.peers)
			.filter(peerId => this.peers[peerId].data.userAgent)
			.map(peerId => ({
				id: peerId,
				stream: this.peers[peerId].stream,
				name: this.peers[peerId].data.peerName,
				isTalking: this.peers[peerId].data.isTalking,
			}));
	}

	getLocalMediaStream() {
		return this.localMediaStream;
	}

	// Cleanup
	destroy() {
		this.endCall();
		this.eventListeners = {};
	}
}

// Export for global use
window.WebRTCManager = WebRTCManager;