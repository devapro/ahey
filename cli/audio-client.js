#!/usr/bin/env node

"use strict";

const WebSocket = require('ws');
const EventEmitter = require('events');
const readline = require('readline');
const { execSync } = require('child_process');
const net = require('net');

// WebRTC support
let io = null;
let nodeDatachannel = null;

try {
	io = require('socket.io-client');
	nodeDatachannel = require('node-datachannel');
	console.log('✅ WebRTC modules loaded successfully');
} catch (error) {
	console.log('ℹ️  WebRTC modules not available. Running in basic mode.');
}

// Audio support
let Speaker = null;
let recorder = null;

try {
	Speaker = require('speaker');
	recorder = require('node-record-lpcm16');
	console.log('✅ Audio modules loaded successfully');
} catch (error) {
	console.log('ℹ️  Audio modules not available. Audio will be simulated.');
}

class AudioClient extends EventEmitter {
	constructor() {
		super();
		this.channelId = "";
		this.peerId = "";
		this.name = "";
		this.audioEnabled = true;
		this.callInitiated = false;
		this.peers = {};
		this.dataChannels = {};
		this.peerConnections = {};
		this.socket = null;
		this.signalingSocket = null;
		this.serverUrls = ["wss://192.168.0.31:824", "wss://localhost:824"];
		this.serverUrl = null;
		this.webrtcEnabled = !!(io && nodeDatachannel);
		this.audioEnabled = !!(Speaker && recorder);

		// Audio playback
		this.speakers = {};
		this.microphoneStream = null;

		// ICE candidate buffering (to handle candidates arriving before remote description)
		this.pendingCandidates = {};
		this.remoteDescriptionSet = {};

		this.setupReadline();
	}

	setupReadline() {
		this.rl = readline.createInterface({
			input: process.stdin,
			output: process.stdout
		});

		this.rl.on('line', (input) => {
			this.handleCommand(input.trim());
		});
	}

	async selectBestServer() {
		console.log('🔍 Testing server connections...');

		for (const url of this.serverUrls) {
			const host = url.replace('wss://', '').replace('ws://', '').split(':')[0];
			const port = parseInt(url.split(':')[2]) || 824;

			console.log(`⏳ Testing ${host}:${port}...`);

			if (await this.testConnection(host, port)) {
				console.log(`✅ Connected to ${host}:${port}`);
				this.serverUrl = url;
				return url;
			} else {
				console.log(`❌ Failed to connect to ${host}:${port}`);
			}
		}

		console.log('⚠️  No servers available, using fallback: localhost:824');
		this.serverUrl = 'wss://localhost:824';
		return this.serverUrl;
	}

	testConnection(host, port, timeout = 3000) {
		return new Promise((resolve) => {
			const socket = new net.Socket();
			let resolved = false;

			const cleanup = () => {
				if (!resolved) {
					resolved = true;
					socket.destroy();
				}
			};

			socket.setTimeout(timeout);

			socket.on('connect', () => {
				if (!resolved) {
					resolved = true;
					socket.end();
					resolve(true);
				}
			});

			socket.on('error', () => {
				cleanup();
				resolve(false);
			});

			socket.on('timeout', () => {
				cleanup();
				resolve(false);
			});

			socket.connect(port, host);
		});
	}

	handleCommand(command) {
		const [cmd, ...args] = command.split(' ');

		switch (cmd.toLowerCase()) {
			case 'help':
			case 'h':
				this.showHelp();
				break;
			case 'connect':
			case 'c':
				const channel = args[0] || 'test';
				if (this.webrtcEnabled) {
					console.log('💡 Using WebRTC mode (for web compatibility). Use "basic <channel>" for WebSocket-only mode.');
					this.connectWebRTC(channel).catch(error => {
						console.error('WebRTC connection failed:', error.message);
						this.prompt();
					});
				} else {
					this.connectBasic(channel).catch(error => {
						console.error('Basic connection failed:', error.message);
						this.prompt();
					});
				}
				break;
			case 'webrtc':
			case 'w':
				const webrtcChannel = args[0] || 'test';
				if (this.webrtcEnabled) {
					this.connectWebRTC(webrtcChannel).catch(error => {
						console.error('WebRTC connection failed:', error.message);
						this.prompt();
					});
				} else {
					console.log('❌ WebRTC not available. Install dependencies: npm install socket.io-client node-datachannel');
					this.prompt();
				}
				break;
			case 'basic':
			case 'b':
				const basicChannel = args[0] || 'test';
				this.connectBasic(basicChannel).catch(error => {
					console.error('Basic connection failed:', error.message);
					this.prompt();
				});
				break;
			case 'disconnect':
			case 'd':
				this.disconnect();
				break;
			case 'name':
			case 'n':
				const newName = args.join(' ');
				if (newName) {
					this.setName(newName);
				} else {
					console.log(`Current name: ${this.name}`);
				}
				break;
			case 'audio':
			case 'a':
				this.toggleAudio();
				break;
			case 'peers':
			case 'p':
				this.listPeers();
				break;
			case 'say':
			case 's':
				const message = args.join(' ');
				this.sendMessage(message);
				break;
			case 'status':
				this.showStatus();
				break;
			case 'servers':
				this.showServers();
				break;
			case 'server':
				if (args[0]) {
					this.setServer(args[0]);
				} else {
					this.showServers();
				}
				break;
			case 'quit':
			case 'q':
			case 'exit':
				this.quit();
				break;
			default:
				if (command) {
					console.log(`Unknown command: ${cmd}. Type 'help' for available commands.`);
				}
				this.prompt();
		}
	}

	showHelp() {
		const webrtcStatus = this.webrtcEnabled ? '✅' : '❌';
		console.log(`
📞 Audio Client Commands:
  connect <channel>    (c) - Connect to audio channel (${webrtcStatus} WebRTC when available)
  webrtc <channel>     (w) - Connect with WebRTC support (for web compatibility)
  basic <channel>      (b) - Connect with basic WebSocket only
  disconnect          (d) - Disconnect from current channel
  name <name>         (n) - Set your display name
  audio               (a) - Toggle audio on/off
  peers               (p) - List connected peers
  say <message>       (s) - Send text message to channel
  status                  - Show connection status
  servers                 - List available servers
  server <number>         - Set server by number (1-${this.serverUrls.length})
  help                (h) - Show this help
  quit                (q) - Exit application

💡 WebRTC mode ${webrtcStatus}: ${this.webrtcEnabled ? 'Available - connect with web users!' : 'Install: npm install socket.io-client node-datachannel'}
🔗 'connect' now defaults to WebRTC mode when available for web compatibility.
		`);
		this.prompt();
	}

	async connectBasic(channelId) {
		if (this.socket && this.socket.readyState === WebSocket.OPEN) {
			console.log('⚠️  Already connected. Disconnect first.');
			this.prompt();
			return;
		}

		this.channelId = channelId;

		if (!this.name) {
			this.name = `CLI-User-${Math.random().toString(36).substr(2, 6)}`;
		}

		console.log(`📞 Connecting to channel: ${channelId}`);
		console.log(`👤 Using name: ${this.name}`);

		// Select the best available server (if not manually set)
		if (!this.serverUrl) {
			await this.selectBestServer();
		}
		console.log(`🌐 Using server: ${this.serverUrl}`);

		// Connect to WebSocket (simulating the web client)
		const wsOptions = {};
		if (this.serverUrl.startsWith('wss://')) {
			// Allow self-signed certificates for development
			// WARNING: This is insecure and should only be used for development
			wsOptions.rejectUnauthorized = false;
		}

		try {
			this.socket = new WebSocket(`${this.serverUrl}/socket.io/?EIO=4&transport=websocket`, wsOptions);
		} catch (error) {
			console.error(`❌ WebSocket connection error: ${error.message}`);
			if (error.message.includes('certificate')) {
				console.log(`
🔒 SSL Certificate Issue Detected!

Solutions:
1. Use HTTP instead of HTTPS:
   server 2  (for localhost)

2. Set environment variable (insecure):
   NODE_TLS_REJECT_UNAUTHORIZED=0 node audio-client.js

3. Add certificate to system trust store
				`);
			}
			this.prompt();
			return;
		}

		this.socket.on('open', () => {
			console.log('🔗 Connected to server');
			this.joinChannel();
		});

		this.socket.on('message', (data) => {
			this.handleMessage(data.toString());
		});

		this.socket.on('close', () => {
			console.log('❌ Disconnected from server');
			this.callInitiated = false;
			this.peers = {};
			this.prompt();
		});

		this.socket.on('error', (error) => {
			console.error('🚨 Connection error:', error.message);
			this.prompt();
		});
	}

	joinChannel() {
		// Simulate joining the channel
		const joinMessage = {
			type: 'join',
			channelId: this.channelId,
			peerId: this.generatePeerId(),
			name: this.name,
			userAgent: 'CLI Audio Client'
		};

		this.peerId = joinMessage.peerId;
		console.log(`🎯 Joined channel: ${this.channelId}`);
		console.log(`🆔 Your peer ID: ${this.peerId}`);
		this.callInitiated = true;
		this.showStatus();
		this.prompt();
	}

	disconnect() {
		if (this.socket) {
			this.socket.close();
			this.socket = null;
		}
		this.callInitiated = false;
		this.peers = {};
		console.log('👋 Disconnected');
		this.prompt();
	}

	setName(name) {
		const oldName = this.name;
		this.name = name;
		console.log(`👤 Name changed: ${oldName} → ${name}`);

		if (this.callInitiated) {
			this.sendDataMessage('peerName', name);
		}
		this.prompt();
	}

	toggleAudio() {
		this.audioEnabled = !this.audioEnabled;
		const status = this.audioEnabled ? '🔊 ON' : '🔇 OFF';
		console.log(`🎤 Audio: ${status}`);
		this.prompt();
	}

	listPeers() {
		const peerCount = Object.keys(this.peers).length;
		console.log(`👥 Connected peers: ${peerCount}`);

		if (peerCount > 0) {
			Object.keys(this.peers).forEach(peerId => {
				const peer = this.peers[peerId];
				const talkingStatus = peer.isTalking ? '🗣️' : '🤐';
				console.log(`  ${talkingStatus} ${peer.name} (${peerId})`);
			});
		} else {
			console.log('  No other peers connected');
		}
		this.prompt();
	}

	sendMessage(message) {
		if (!this.callInitiated) {
			console.log('⚠️  Not connected to any channel');
			this.prompt();
			return;
		}

		if (!message) {
			console.log('⚠️  Message cannot be empty');
			this.prompt();
			return;
		}

		console.log(`💬 You: ${message}`);
		this.sendDataMessage('message', message);
		this.prompt();
	}

	sendDataMessage(type, message) {
		const dataMessage = {
			type,
			name: this.name,
			peerId: this.peerId,
			message,
			date: new Date().toISOString()
		};

		// Send via WebRTC data channels if available
		if (this.signalingSocket && Object.keys(this.dataChannels).length > 0) {
			const messageStr = JSON.stringify(dataMessage);
			Object.keys(this.dataChannels).forEach((peerId) => {
				try {
					this.dataChannels[peerId].sendMessage(messageStr);
				} catch (error) {
					console.error(`❌ Error sending to ${peerId}:`, error.message);
				}
			});
			console.log(`📤 Sent via WebRTC ${type}:`, message);
		} else {
			// Fallback for basic mode
			console.log(`📤 Sending ${type}:`, message);
		}
	}

	showStatus() {
		console.log(`
📊 Status:
  Channel: ${this.channelId || 'Not connected'}
  Name: ${this.name}
  Peer ID: ${this.peerId}
  Audio: ${this.audioEnabled ? '🔊 ON' : '🔇 OFF'}
  Connected: ${this.callInitiated ? '✅ YES' : '❌ NO'}
  Peers: ${Object.keys(this.peers).length}
  Server: ${this.serverUrl || 'Auto-select'}
		`);
		this.prompt();
	}

	showServers() {
		console.log(`
🌐 Available Servers:
${this.serverUrls.map((url, i) =>
	`  ${i + 1}. ${url} ${this.serverUrl === url ? '← current' : ''}`
).join('\n')}

Usage:
  server <number>  - Set server by number
  servers         - Show this list
		`);
		this.prompt();
	}

	setServer(serverRef) {
		const serverIndex = parseInt(serverRef) - 1;

		if (serverIndex >= 0 && serverIndex < this.serverUrls.length) {
			this.serverUrl = this.serverUrls[serverIndex];
			console.log(`🌐 Server set to: ${this.serverUrl}`);
		} else {
			console.log(`❌ Invalid server number. Use 1-${this.serverUrls.length}`);
		}
		this.prompt();
	}

	handleMessage(message) {
		try {
			// Parse Socket.IO message format
			if (message.startsWith('42')) {
				const data = JSON.parse(message.substring(2));
				const [event, ...args] = data;
				this.handleSocketEvent(event, ...args);
			}
		} catch (error) {
			// Ignore parsing errors for demo
		}
	}

	handleSocketEvent(event, data) {
		switch (event) {
			case 'peerConnected':
				this.handlePeerConnected(data);
				break;
			case 'peerDisconnected':
				this.handlePeerDisconnected(data);
				break;
			case 'dataChannelMessage':
				this.handleDataChannelMessage(data);
				break;
		}
	}

	handlePeerConnected(data) {
		this.peers[data.peerId] = {
			name: data.name,
			isTalking: false
		};
		console.log(`\n🟢 ${data.name} joined the channel`);
		this.prompt();
	}

	handlePeerDisconnected(data) {
		const peer = this.peers[data.peerId];
		if (peer) {
			console.log(`\n🔴 ${peer.name} left the channel`);
			delete this.peers[data.peerId];
		}
		this.prompt();
	}

	handleDataChannelMessage(data) {
		const peer = this.peers[data.peerId];
		if (!peer) return;

		switch (data.type) {
			case 'peerName':
				const oldName = peer.name;
				peer.name = data.message;
				console.log(`\n👤 ${oldName} changed name to ${data.message}`);
				break;
			case 'message':
				console.log(`\n💬 ${peer.name}: ${data.message}`);
				break;
		}
		this.prompt();
	}

	generatePeerId() {
		return 'cli-' + Math.random().toString(36).substr(2, 16);
	}

	prompt() {
		if (this.rl && !this.rl.closed) {
			const status = this.callInitiated ? `[${this.channelId}]` : '[disconnected]';
			this.rl.setPrompt(`${status} > `);
			this.rl.prompt();
		}
	}

	async connectWebRTC(channelId) {
		if (this.signalingSocket && this.signalingSocket.connected) {
			console.log('⚠️  Already connected via WebRTC. Disconnect first.');
			this.prompt();
			return;
		}

		this.channelId = channelId;

		if (!this.name) {
			this.name = `CLI-User-${Math.random().toString(36).substr(2, 6)}`;
		}

		console.log(`📞 Connecting to WebRTC channel: ${channelId}`);
		console.log(`👤 Using name: ${this.name}`);

		// Select the best available server
		if (!this.serverUrl) {
			await this.selectBestServer();
		}
		console.log(`🌐 Using server: ${this.serverUrl}`);

		// Connect to Socket.IO server for WebRTC signaling
		const serverUrl = this.serverUrl.replace('/socket.io/', '');
		console.log(`🔌 Connecting to signaling server: ${serverUrl}`);

		this.signalingSocket = io(serverUrl, {
			rejectUnauthorized: false,
			transports: ['websocket', 'polling']
		});

		this.signalingSocket.on('connect', () => {
			console.log('🔗 Connected to signaling server');
			this.peerId = this.signalingSocket.id;

			// Join the channel with proper server format
			const userData = {
				peerName: this.name,
				userAgent: 'CLI WebRTC Client'
			};
			this.signalingSocket.emit('join', {
				channel: this.channelId,
				userData: userData
			});

			console.log(`🎯 Joined WebRTC channel: ${this.channelId}`);
			console.log(`🆔 Your peer ID: ${this.peerId}`);
			this.callInitiated = true;
			this.showStatus();
			this.prompt();
		});

		this.signalingSocket.on('disconnect', () => {
			console.log('❌ Disconnected from signaling server');
			this.callInitiated = false;
			this.peers = {};
			this.prompt();
		});

		this.signalingSocket.on('addPeer', (data) => {
			const { peer_id, channel } = data;
			console.log(`\n🟢 Peer ${peer_id} joined the channel (WebRTC)`);

			if (channel && channel[peer_id] && channel[peer_id].userData) {
				const peerName = channel[peer_id].userData.peerName || 'Unknown';
				this.peers[peer_id] = {
					name: peerName,
					isTalking: false,
					webrtc: true
				};
				console.log(`\n🟢 ${peerName} joined the channel (WebRTC)`);
			} else {
				this.peers[peer_id] = {
					name: `Peer-${peer_id.slice(-6)}`,
					isTalking: false,
					webrtc: true
				};
			}

			this.createPeerConnection(peer_id);
			this.prompt();
		});

		this.signalingSocket.on('removePeer', (data) => {
			const { peer_id } = data;
			const peer = this.peers[peer_id];
			if (peer) {
				console.log(`\n🔴 ${peer.name} left the channel`);
				this.cleanupPeerConnection(peer_id);
				delete this.peers[peer_id];
			}
			this.prompt();
		});

		// Handle WebRTC signaling
		this.signalingSocket.on('sessionDescription', (data) => {
			this.handleSessionDescription(data);
		});

		this.signalingSocket.on('iceCandidate', (data) => {
			this.handleIceCandidate(data);
		});

		this.signalingSocket.on('error', (error) => {
			console.error('🚨 Signaling error:', error);
			this.prompt();
		});
	}

	createPeerConnection(peerId) {
		if (!nodeDatachannel) {
			console.log('⚠️  WebRTC not available for peer connections');
			return;
		}

		console.log(`🔗 Creating peer connection for: ${peerId}`);

		try {
			const peerConnection = new nodeDatachannel.PeerConnection(peerId, {
				iceServers: [
					'stun:stun.l.google.com:19302',
					'stun:stun1.l.google.com:19302',
					'stun:stun2.l.google.com:19302',
					'stun:stun3.l.google.com:19302',
					'stun:stun4.l.google.com:19302',
					'stun:stun.relay.metered.ca:80',
					'stun:turn.ahey.net:3478'
				]
			});

			this.peerConnections[peerId] = peerConnection;

			// Create data channel for messaging
			const dataChannel = peerConnection.createDataChannel('messages');
			this.dataChannels[peerId] = dataChannel;

			dataChannel.onOpen(() => {
				console.log(`💬 Data channel opened for: ${this.peers[peerId]?.name || peerId}`);
			});

			dataChannel.onMessage((message) => {
				this.handleDataChannelMessage(peerId, message);
			});

			// Handle incoming data channels
			peerConnection.onDataChannel((channel) => {
				console.log(`📨 Incoming data channel from: ${this.peers[peerId]?.name || peerId}`);
				this.dataChannels[peerId] = channel;

				channel.onMessage((message) => {
					this.handleDataChannelMessage(peerId, message);
				});
			});

			// Handle ICE candidates
			peerConnection.onLocalCandidate((candidate) => {
				if (this.signalingSocket) {
					this.signalingSocket.emit('relayICECandidate', {
						peer_id: peerId,
						ice_candidate: candidate
					});
				}
			});

			// Handle local descriptions (offers/answers)
			peerConnection.onLocalDescription((description) => {
				if (this.signalingSocket) {
					this.signalingSocket.emit('relaySessionDescription', {
						peer_id: peerId,
						session_description: description
					});
				}
			});

			// Add an audio track to send to the peer
			if (nodeDatachannel.Audio && recorder) {
				const audioTrack = new nodeDatachannel.Audio('audio');
				audioTrack.addOpusCodec(96); // Add Opus codec support
				peerConnection.addTrack(audioTrack);
				console.log(`🎤 Added audio track for: ${this.peers[peerId]?.name || peerId}`);

				// Set up microphone input for this track
				this.setupMicrophoneForTrack(audioTrack, peerId);
			}

			// Handle incoming audio tracks
			peerConnection.onTrack((track) => {
				console.log(`🔊 Received audio track from: ${this.peers[peerId]?.name || peerId}`);
				this.handleAudioTrack(peerId, track);
			});

			// Create and send offer
			peerConnection.setLocalDescription('offer');

		} catch (error) {
			console.error(`❌ Error creating peer connection for ${peerId}:`, error.message);
		}
	}

	handleAudioTrack(peerId, track) {
		if (!Speaker) {
			console.log('⚠️  Speaker not available for audio playback');
			return;
		}

		console.log(`🎵 Setting up audio playback for: ${this.peers[peerId]?.name || peerId}`);

		try {
			// Create a new Speaker instance for this peer
			const speaker = new Speaker({
				channels: 2,          // 2 channels (stereo)
				bitDepth: 16,         // 16-bit samples
				sampleRate: 48000     // 48kHz sample rate (Opus default)
			});

			// Store the speaker for this peer
			this.speakers[peerId] = speaker;

			// Set up media handler for the track to receive audio data
			track.setMediaHandler({
				onSample: (sample) => {
					console.log(`🎵 Received audio sample from ${peerId}, size: ${sample ? sample.length : 'null'}`);
					if (this.speakers[peerId] && sample) {
						try {
							// Write PCM audio data to the speaker
							this.speakers[peerId].write(sample);
						} catch (error) {
							console.error(`❌ Audio playbook error for ${peerId}:`, error.message);
						}
					}
				},
				onFrame: (frame) => {
					console.log(`🎬 Received audio frame from ${peerId}, size: ${frame ? frame.length : 'null'}`);
				}
			});

			track.onClosed(() => {
				console.log(`🔇 Audio track closed for: ${this.peers[peerId]?.name || peerId}`);
				if (this.speakers[peerId]) {
					this.speakers[peerId].end();
					delete this.speakers[peerId];
				}
			});

		} catch (error) {
			console.error(`❌ Error setting up audio playback for ${peerId}:`, error.message);
		}
	}

	setupMicrophoneForTrack(audioTrack, peerId) {
		if (!recorder) {
			console.log('⚠️  Recorder not available for microphone input');
			return;
		}

		console.log(`🎙️  Setting up microphone for: ${this.peers[peerId]?.name || peerId}`);

		try {
			// Create a microphone recording stream
			const micStream = recorder.record({
				sampleRateHertz: 48000,     // 48kHz sample rate (Opus standard)
				threshold: 0,               // Silence threshold (0 = no threshold)
				verbose: false,             // Don't show verbose output
				recordProgram: 'rec',       // Use 'rec' command for recording
				silence: '1.0',             // Stop after 1 second of silence
				channels: 1                 // Mono audio
			});

			// Set up media handler to send microphone data to the track
			audioTrack.setMediaHandler({
				onSample: (sample) => {
					// This would be called when we need to send audio
					// For now, we'll use the stream data directly
				}
			});

			// Pipe microphone data to the audio track
			micStream.stream().on('data', (audioData) => {
				try {
					// Send microphone data to the audio track
					// Note: This may need format conversion depending on node-datachannel requirements
					audioTrack.sendMessage(audioData);
				} catch (error) {
					console.error(`❌ Error sending microphone data for ${peerId}:`, error.message);
				}
			});

			micStream.stream().on('error', (error) => {
				console.error(`❌ Microphone error for ${peerId}:`, error.message);
			});

			// Store the microphone stream for cleanup
			this.microphoneStream = micStream;

		} catch (error) {
			console.error(`❌ Error setting up microphone for ${peerId}:`, error.message);
		}
	}

	handleSessionDescription(data) {
		const { peer_id, session_description } = data;
		const peerConnection = this.peerConnections[peer_id];

		if (!peerConnection) {
			console.log(`⚠️  No peer connection found for: ${peer_id}`);
			return;
		}

		console.log(`📋 Received session description from: ${this.peers[peer_id]?.name || peer_id}`);

		try {
			// Convert browser format to node-datachannel format
			// Browser: { sdp: string, type: string }
			// Node-datachannel: setRemoteDescription(sdp: string, type: string)
			const sdpString = session_description.sdp;
			const typeString = session_description.type;

			// Convert type to proper case for node-datachannel
			const normalizedType = typeString.charAt(0).toUpperCase() + typeString.slice(1).toLowerCase();

			peerConnection.setRemoteDescription(sdpString, normalizedType);

			// Mark remote description as set
			this.remoteDescriptionSet[peer_id] = true;

			// Process any buffered ICE candidates
			if (this.pendingCandidates[peer_id]) {
				console.log(`📦 Processing ${this.pendingCandidates[peer_id].length} buffered ICE candidates for: ${this.peers[peer_id]?.name || peer_id}`);
				for (const candidate of this.pendingCandidates[peer_id]) {
					try {
						peerConnection.addRemoteCandidate(candidate.candidateString, candidate.midString);
					} catch (error) {
						console.error(`❌ Error processing buffered candidate for ${peer_id}:`, error.message);
					}
				}
				delete this.pendingCandidates[peer_id];
			}

			if (session_description.type === 'offer') {
				// Create answer - onLocalDescription will handle sending it
				peerConnection.setLocalDescription('answer');
			}
		} catch (error) {
			console.error(`❌ Error handling session description from ${peer_id}:`, error);
		}
	}

	handleIceCandidate(data) {
		const { peer_id, ice_candidate } = data;
		const peerConnection = this.peerConnections[peer_id];

		if (!peerConnection) {
			console.log(`⚠️  No peer connection found for ICE candidate from: ${peer_id}`);
			return;
		}

		console.log(`🧊 Received ICE candidate from: ${this.peers[peer_id]?.name || peer_id}`);

		try {
			// Convert browser format to node-datachannel format
			// Browser: { candidate: string, sdpMid: string, ... }
			// Node-datachannel: addRemoteCandidate(candidate: string, mid: string)
			const candidateString = ice_candidate.candidate;
			const midString = ice_candidate.sdpMid || '';

			// Check if remote description has been set for this peer
			if (this.remoteDescriptionSet[peer_id]) {
				// Remote description is set, add candidate immediately
				peerConnection.addRemoteCandidate(candidateString, midString);
			} else {
				// Remote description not set yet, buffer the candidate
				console.log(`📦 Buffering ICE candidate for: ${this.peers[peer_id]?.name || peer_id} (waiting for remote description)`);
				if (!this.pendingCandidates[peer_id]) {
					this.pendingCandidates[peer_id] = [];
				}
				this.pendingCandidates[peer_id].push({ candidateString, midString });
			}
		} catch (error) {
			console.error(`❌ Error handling ICE candidate from ${peer_id}:`, error);
		}
	}

	handleDataChannelMessage(peerId, message) {
		try {
			const data = JSON.parse(message);
			const peer = this.peers[peerId];

			if (!peer) return;

			switch (data.type) {
				case 'peerName':
					const oldName = peer.name;
					peer.name = data.message;
					console.log(`\n👤 ${oldName} changed name to ${data.message}`);
					break;
				case 'message':
					console.log(`\n💬 ${peer.name}: ${data.message}`);
					break;
			}
			this.prompt();
		} catch (error) {
			console.error('❌ Error parsing data channel message:', error);
		}
	}

	cleanupPeerConnection(peerId) {
		if (this.peerConnections[peerId]) {
			this.peerConnections[peerId].close();
			delete this.peerConnections[peerId];
		}
		if (this.dataChannels[peerId]) {
			delete this.dataChannels[peerId];
		}
		// Clean up audio speakers
		if (this.speakers[peerId]) {
			this.speakers[peerId].end();
			delete this.speakers[peerId];
		}
		// Clean up ICE candidate buffering
		delete this.pendingCandidates[peerId];
		delete this.remoteDescriptionSet[peerId];
		// Clean up microphone stream
		if (this.microphoneStream) {
			this.microphoneStream.stop();
			this.microphoneStream = null;
		}
	}

	quit() {
		console.log('👋 Goodbye!');

		// Clean up WebRTC connections
		Object.keys(this.peerConnections).forEach(peerId => {
			this.cleanupPeerConnection(peerId);
		});

		if (this.signalingSocket) {
			this.signalingSocket.disconnect();
		}
		if (this.socket) {
			this.socket.close();
		}
		this.rl.close();
		process.exit(0);
	}
}

// CLI Entry Point
function main() {
	console.log(`
🎤 Ahey Audio CLI Client
========================
Type 'help' for available commands
	`);

	const client = new AudioClient();

	// Handle Ctrl+C gracefully
	process.on('SIGINT', () => {
		client.quit();
	});

	// Parse command line arguments
	const args = process.argv.slice(2);
	if (args.length > 0) {
		const command = args.join(' ');
		client.handleCommand(command);
	} else {
		client.prompt();
	}
}

// Only run main if this file is executed directly
if (require.main === module) {
	main();
}

module.exports = AudioClient;