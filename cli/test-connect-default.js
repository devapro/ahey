#!/usr/bin/env node

const AudioClient = require('./audio-client.js');

async function testDefaultConnect() {
	console.log('🧪 Testing default connect command (should use WebRTC)...');

	const client = new AudioClient();

	// Test connection after a brief delay
	setTimeout(async () => {
		try {
			console.log('🔌 Testing connect command...');
			client.handleCommand('connect test');

			// Wait for connection
			setTimeout(() => {
				console.log('📊 Status check...');
				client.handleCommand('status');

				setTimeout(() => {
					console.log('✅ Test completed - exiting');
					client.quit();
				}, 3000);
			}, 5000);

		} catch (error) {
			console.error('❌ Test failed:', error.message);
			client.quit();
		}
	}, 1000);
}

testDefaultConnect();