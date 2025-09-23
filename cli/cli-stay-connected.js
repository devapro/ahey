#!/usr/bin/env node

const AudioClient = require('./audio-client.js');

async function startPersistentClient() {
	console.log('🧪 Starting persistent CLI WebRTC client...');

	const client = new AudioClient();

	// Connect after brief delay
	setTimeout(async () => {
		try {
			console.log('🔌 Connecting to WebRTC channel "demo"...');
			await client.connectWebRTC('demo');

			console.log('✅ CLI client is now connected and waiting for web users to join');
			console.log('📱 Open http://localhost:824/demo in your browser to test communication');
			console.log('⌨️  Type Ctrl+C to exit');

			// Keep the process alive and handle peer connections
			process.on('SIGINT', () => {
				console.log('\n👋 Shutting down CLI client...');
				client.quit();
			});

		} catch (error) {
			console.error('❌ Failed to connect:', error.message);
			process.exit(1);
		}
	}, 1000);
}

startPersistentClient();