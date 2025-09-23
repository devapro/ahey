#!/usr/bin/env node

"use strict";

const WebSocket = require('ws');
const EventEmitter = require('events');
const readline = require('readline');
const { execSync } = require('child_process');
const net = require('net');

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
		this.socket = null;
		this.serverUrls = ["wss://192.168.0.31:824", "wss://localhost:824"];
		this.serverUrl = null;

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
			const host = url.replace('wss://', '').split(':')[0];
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
📞 Audio Client Commands:
  connect <channel>    (c) - Connect to audio channel (default: test)
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
		`);
		this.prompt();
	}

	async connect(channelId) {
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
		this.socket = new WebSocket(`${this.serverUrl.replace('ws://', 'ws://')}/socket.io/?EIO=4&transport=websocket`);

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

		// In real implementation, this would send via data channels
		// For CLI demo, we'll just log it
		console.log(`📤 Sending ${type}:`, message);
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

	quit() {
		console.log('👋 Goodbye!');
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