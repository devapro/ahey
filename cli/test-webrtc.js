#!/usr/bin/env node

const AudioClient = require('./audio-client.js');

async function test() {
	console.log('🧪 Testing WebRTC CLI connection...');

	const client = new AudioClient();

	// Test connection after a brief delay
	setTimeout(async () => {
		try {
			console.log('🔌 Attempting WebRTC connection to test channel...');
			await client.connectWebRTC('test');

			// Wait a bit for the connection to establish
			setTimeout(() => {
				console.log('📊 Current status:');
				client.showStatus();

				// Test sending a message
				setTimeout(() => {
					console.log('📝 Testing message send...');
					client.sendMessage('Hello from CLI WebRTC!');

					// Exit after testing
					setTimeout(() => {
						console.log('✅ WebRTC test completed');
						client.quit();
					}, 2000);
				}, 2000);
			}, 3000);
		} catch (error) {
			console.error('❌ WebRTC test failed:', error.message);
			client.quit();
		}
	}, 1000);
}

test();