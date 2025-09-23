#!/usr/bin/env node

"use strict";

const io = require('socket.io-client');
const EventEmitter = require('events');
const readline = require('readline');
const net = require('net');

// WebRTC Node.js implementation using node-datachannel
let nodeDatachannel = null;
try {
	nodeDatachannel = require('node-datachannel');
	console.log('✅ node-datachannel loaded successfully');
} catch (error) {
	console.warn('⚠️  node-datachannel not available. Install with: npm install node-datachannel');
}

class WebRTCAudioClient extends EventEmitter {
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
		this.serverUrls = ["wss://192.168.0.31:824", "wss://localhost:824"];
		this.serverUrl = null;
		this.localMediaStream = null;
		this.audioContext = null;
		this.microphoneSource = null;

		this.setupReadline();
		this.initWebRTC();
	}

	initWebRTC() {
		if (!nodeDatachannel) {
			console.log('⚠️  WebRTC not available. Running in simulation mode.');
			return;
		}

		// Initialize audio context for CLI audio (simulated)
		try {
			// In Node.js, we'll simulate audio with a simple tone generator
			this.setupSimulatedAudio();
		} catch (error) {
			console.warn('Audio context initialization failed:', error.message);
		}
	}

	setupSimulatedAudio() {
		// Create a minimal audio simulation for CLI
		this.localMediaStream = new MediaStream();
		console.log('🎤 Simulated audio stream created for CLI');
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
				this.connect(channel).catch(error => {
					console.error('Connection failed:', error.message);
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
			case 'webrtc':
				this.showWebRTCStatus();
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
		console.log(`
📞 WebRTC Audio Client Commands:
  connect <channel>    (c) - Connect to audio channel (default: test)
  disconnect          (d) - Disconnect from current channel
  name <name>         (n) - Set your display name
  audio               (a) - Toggle audio on/off
  peers               (p) - List connected peers
  say <message>       (s) - Send text message to channel
  status                  - Show connection status
  webrtc                  - Show WebRTC connection status
  servers                 - List available servers
  server <number>         - Set server by number (1-${this.serverUrls.length})
  help                (h) - Show this help
  quit                (q) - Exit application

🎤 WebRTC Features:
  - Real peer-to-peer connections
  - Audio streaming (simulated in CLI)
  - Data channels for messaging
  - ICE candidate exchange
		`);
		this.prompt();
	}

	async connect(channelId) {
		if (this.socket && this.socket.connected) {
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

		// Connect using Socket.IO client
		const socketOptions = {
			transports: ['websocket'],
			upgrade: false,
			rejectUnauthorized: false // Allow self-signed certificates
		};

		try {
			this.socket = io(this.serverUrl, socketOptions);
			this.setupSocketHandlers();
		} catch (error) {
			console.error(`❌ Socket.IO connection error: ${error.message}`);
			if (error.message.includes('certificate')) {
				console.log(`
🔒 SSL Certificate Issue Detected!

Solutions:
1. Use HTTP instead of HTTPS:
   server 2  (for localhost)

2. Set environment variable (insecure):
   NODE_TLS_REJECT_UNAUTHORIZED=0 node webrtc-client.js

3. Add certificate to system trust store
				`);
			}
			this.prompt();
			return;
		}
	}

	setupSocketHandlers() {
		this.socket.on('connect', () => {
			console.log('🔗 Connected to server');
			this.joinChannel();
		});

		this.socket.on('disconnect', () => {
			console.log('❌ Disconnected from server');
			this.callInitiated = false;
			this.cleanupAllConnections();
			this.prompt();
		});

		this.socket.on('error', (error) => {
			console.error('🚨 Socket error:', error.message);
			this.prompt();
		});

		// WebRTC signaling events
		this.socket.on('userConnected', (data) => {
			console.log(`\n🟢 ${data.name} joined the channel`);
			this.handleUserConnected(data);
			this.prompt();
		});

		this.socket.on('userDisconnected', (data) => {
			console.log(`\n🔴 User left the channel`);
			this.handleUserDisconnected(data);
			this.prompt();
		});

		this.socket.on('relaySessionDescription', (data) => {
			this.handleSessionDescription(data);
		});

		this.socket.on('relayIceCandidate', (data) => {
			this.handleIceCandidate(data);
		});

		this.socket.on('message', (data) => {
			console.log(`\n💬 ${data.name}: ${data.message}`);
			this.prompt();
		});
	}

	joinChannel() {
		// Generate a unique peer ID
		this.peerId = 'cli-' + Math.random().toString(36).substr(2, 16);

		// Join the channel
		this.socket.emit('join', {
			channelId: this.channelId,
			peerId: this.peerId,
			name: this.name,
			userAgent: 'CLI WebRTC Client'
		});

		console.log(`🎯 Joined channel: ${this.channelId}`);
		console.log(`🆔 Your peer ID: ${this.peerId}`);
		this.callInitiated = true;
		this.showStatus();
		this.prompt();
	}

	async handleUserConnected(data) {
		if (!global.RTCPeerConnection) {
			// Fallback to simple peer tracking
			this.peers[data.peerId] = {
				name: data.name,
				isTalking: false
			};
			return;
		}

		console.log(`🔗 Setting up WebRTC connection with ${data.name} (${data.peerId})`);

		// Create peer connection
		const peerConnection = new RTCPeerConnection({
			iceServers: [
				{ urls: 'stun:stun.l.google.com:19302' },
				{ urls: 'stun:stun1.l.google.com:19302' }
			]
		});

		this.peerConnections[data.peerId] = peerConnection;

		// Add local stream (simulated)
		if (this.localMediaStream) {
			console.log(`📤 Adding local media stream to peer ${data.peerId}`);
		}

		// Create data channel for messaging
		const dataChannel = peerConnection.createDataChannel('messages', {
			ordered: true
		});

		this.dataChannels[data.peerId] = dataChannel;

		dataChannel.onopen = () => {
			console.log(`📡 Data channel opened with ${data.name}`);
		};

		dataChannel.onmessage = (event) => {
			const message = JSON.parse(event.data);
			this.handleDataChannelMessage(message);
		};

		// Handle incoming data channels
		peerConnection.ondatachannel = (event) => {
			const channel = event.channel;
			this.dataChannels[data.peerId] = channel;

			channel.onmessage = (event) => {
				const message = JSON.parse(event.data);
				this.handleDataChannelMessage(message);
			};
		};

		// Handle remote stream
		peerConnection.ontrack = (event) => {
			console.log(`📥 Received remote stream from ${data.name}`);
			// In a real implementation, this would be played through speakers
			// For CLI, we'll just acknowledge receipt
		};

		// Handle ICE candidates
		peerConnection.onicecandidate = (event) => {
			if (event.candidate) {
				console.log(`🧊 Sending ICE candidate to ${data.peerId}`);
				this.socket.emit('relayIceCandidate', {
					peer_id: data.peerId,
					ice_candidate: event.candidate
				});
			}
		};

		// Create and send offer
		try {
			const offer = await peerConnection.createOffer({
				offerToReceiveAudio: true,
				offerToReceiveVideo: false
			});

			await peerConnection.setLocalDescription(offer);

			console.log(`📤 Sending offer to ${data.name}`);
			this.socket.emit('relaySessionDescription', {
				peer_id: data.peerId,
				session_description: offer
			});
		} catch (error) {
			console.error(`❌ Error creating offer for ${data.peerId}:`, error.message);
		}

		// Store peer info
		this.peers[data.peerId] = {
			name: data.name,
			isTalking: false,
			connection: peerConnection
		};
	}

	async handleSessionDescription(data) {
		if (!global.RTCPeerConnection || !this.peerConnections[data.peer_id]) {
			return;
		}

		const peerConnection = this.peerConnections[data.peer_id];

		try {
			await peerConnection.setRemoteDescription(new RTCSessionDescription(data.session_description));

			if (data.session_description.type === 'offer') {
				console.log(`📥 Received offer from ${data.peer_id}, creating answer`);

				const answer = await peerConnection.createAnswer();
				await peerConnection.setLocalDescription(answer);

				this.socket.emit('relaySessionDescription', {
					peer_id: data.peer_id,
					session_description: answer
				});

				console.log(`📤 Sent answer to ${data.peer_id}`);
			} else if (data.session_description.type === 'answer') {
				console.log(`📥 Received answer from ${data.peer_id}`);
			}
		} catch (error) {
			console.error(`❌ Error handling session description:`, error.message);
		}
	}

	async handleIceCandidate(data) {
		if (!global.RTCPeerConnection || !this.peerConnections[data.peer_id]) {
			return;
		}

		const peerConnection = this.peerConnections[data.peer_id];

		try {
			await peerConnection.addIceCandidate(new RTCIceCandidate(data.ice_candidate));
			console.log(`🧊 Added ICE candidate from ${data.peer_id}`);
		} catch (error) {
			console.error(`❌ Error adding ICE candidate:`, error.message);
		}
	}

	handleUserDisconnected(data) {
		if (this.peers[data.peerId]) {
			const peer = this.peers[data.peerId];
			console.log(`🔴 ${peer.name} left the channel`);
			this.cleanupPeerConnection(data.peerId);
		}
	}

	cleanupPeerConnection(peerId) {
		// Close data channel
		if (this.dataChannels[peerId]) {
			this.dataChannels[peerId].close();
			delete this.dataChannels[peerId];
		}

		// Close peer connection
		if (this.peerConnections[peerId]) {
			this.peerConnections[peerId].close();
			delete this.peerConnections[peerId];
		}

		// Remove peer
		delete this.peers[peerId];
	}

	cleanupAllConnections() {
		Object.keys(this.peerConnections).forEach(peerId => {
			this.cleanupPeerConnection(peerId);
		});
		this.peers = {};
		this.dataChannels = {};
		this.peerConnections = {};
	}

	handleDataChannelMessage(message) {
		const peer = this.peers[message.peerId];
		if (!peer) return;

		switch (message.type) {
			case 'peerName':
				const oldName = peer.name;
				peer.name = message.message;
				console.log(`\n👤 ${oldName} changed name to ${message.message}`);
				break;
			case 'message':
				console.log(`\n💬 ${peer.name}: ${message.message}`);
				break;
		}
		this.prompt();
	}

	disconnect() {
		if (this.socket) {
			this.socket.disconnect();
		}
		this.cleanupAllConnections();
		this.callInitiated = false;
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
		console.log(`🎤 Audio: ${status} (simulated in CLI)`);
		this.prompt();
	}

	listPeers() {
		const peerCount = Object.keys(this.peers).length;
		const webrtcStatus = global.RTCPeerConnection ? '🌐 WebRTC' : '📡 Simulated';

		console.log(`👥 Connected peers: ${peerCount} (${webrtcStatus})`);

		if (peerCount > 0) {
			Object.keys(this.peers).forEach(peerId => {
				const peer = this.peers[peerId];
				const connectionStatus = this.peerConnections[peerId] ?
					this.peerConnections[peerId].connectionState : 'simulated';
				const talkingStatus = peer.isTalking ? '🗣️' : '🤐';
				console.log(`  ${talkingStatus} ${peer.name} (${peerId.substr(0, 8)}...) [${connectionStatus}]`);
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

		// Send via Socket.IO for now (fallback)
		if (this.socket) {
			this.socket.emit('message', {
				channelId: this.channelId,
				name: this.name,
				message: message
			});
		}

		// Also send via data channels if available
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

		// Send to all connected peers via data channels
		Object.keys(this.dataChannels).forEach(peerId => {
			const channel = this.dataChannels[peerId];
			if (channel && channel.readyState === 'open') {
				channel.send(JSON.stringify(dataMessage));
			}
		});
	}

	showStatus() {
		const webrtcAvailable = global.RTCPeerConnection ? '✅ Available' : '❌ Not Available';
		const connectionCount = Object.keys(this.peerConnections).length;

		console.log(`
📊 WebRTC Audio Client Status:
  Channel: ${this.channelId || 'Not connected'}
  Name: ${this.name}
  Peer ID: ${this.peerId}
  Audio: ${this.audioEnabled ? '🔊 ON' : '🔇 OFF'} (simulated)
  Connected: ${this.callInitiated ? '✅ YES' : '❌ NO'}
  Peers: ${Object.keys(this.peers).length}
  WebRTC: ${webrtcAvailable}
  P2P Connections: ${connectionCount}
  Server: ${this.serverUrl || 'Auto-select'}
		`);
		this.prompt();
	}

	showWebRTCStatus() {
		if (!global.RTCPeerConnection) {
			console.log(`
🚫 WebRTC Status: Not Available

To enable WebRTC:
1. Install native WebRTC module:
   npm install wrtc

2. Restart the CLI client

Note: WebRTC in Node.js has limitations:
- No real audio capture/playback
- Simulated media streams
- P2P connections work for data channels
			`);
		} else {
			console.log(`
✅ WebRTC Status: Active

Active Connections:
			`);

			if (Object.keys(this.peerConnections).length === 0) {
				console.log('  No active P2P connections');
			} else {
				Object.keys(this.peerConnections).forEach(peerId => {
					const connection = this.peerConnections[peerId];
					const peer = this.peers[peerId];
					console.log(`  📡 ${peer?.name} (${peerId.substr(0, 8)}...): ${connection.connectionState}`);
				});
			}
		}
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

	prompt() {
		if (this.rl && !this.rl.closed) {
			const status = this.callInitiated ? `[${this.channelId}]` : '[disconnected]';
			const webrtc = global.RTCPeerConnection ? '🌐' : '📡';
			this.rl.setPrompt(`${status}${webrtc} > `);
			this.rl.prompt();
		}
	}

	quit() {
		console.log('👋 Goodbye!');
		if (this.socket) {
			this.socket.disconnect();
		}
		this.cleanupAllConnections();
		this.rl.close();
		process.exit(0);
	}
}

// CLI Entry Point
function main() {
	console.log(`
🎤🌐 Ahey WebRTC Audio CLI Client
=================================
${global.RTCPeerConnection ? '✅ WebRTC Ready' : '⚠️ WebRTC Limited (install: npm install wrtc)'}
Type 'help' for available commands
	`);

	const client = new WebRTCAudioClient();

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

module.exports = WebRTCAudioClient;