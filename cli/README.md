# Ahey CLI Audio Client

A command-line interface for the Ahey audio calling application. This allows you to connect to audio channels and communicate with other users directly from your terminal.

## Installation

```bash
cd cli
npm install
chmod +x audio-client.js
```

## Usage

### Basic Usage

```bash
# Start the CLI client
node audio-client.js

# Or run with npm
npm start

# Or make it globally available
npm link
ahey
```

### Commands

Once started, you can use these commands:

| Command | Shortcut | Description |
|---------|----------|-------------|
| `help` | `h` | Show available commands |
| `connect <channel>` | `c` | Connect to an audio channel (basic mode) |
| `webrtc <channel>` | `w` | Connect with WebRTC support (for web compatibility) |
| `disconnect` | `d` | Disconnect from current channel |
| `name <name>` | `n` | Set your display name |
| `audio` | `a` | Toggle audio on/off |
| `peers` | `p` | List connected peers |
| `say <message>` | `s` | Send text message to channel |
| `status` | | Show connection status |
| `quit` | `q` | Exit application |

### Examples

```bash
# Connect to a channel called "meeting" (basic mode)
connect meeting

# Connect with WebRTC support (for web user compatibility)
webrtc meeting

# Set your name
name John Doe

# List who's connected
peers

# Send a message
say Hello everyone!

# Check status
status

# Disconnect
disconnect

# Exit
quit
```

### Command Line Arguments

You can also pass commands directly:

```bash
# Connect immediately to a channel
node audio-client.js connect test

# Show help
node audio-client.js help
```

## Features

- ✅ **Channel Management**: Connect/disconnect from audio channels
- ✅ **WebRTC Support**: Full WebRTC peer-to-peer connections compatible with web users
- ✅ **Peer Discovery**: See who else is connected
- ✅ **Name Management**: Set and change your display name
- ✅ **Audio Control**: Toggle audio on/off (simulated)
- ✅ **Text Messaging**: Send messages to the channel via data channels
- ✅ **Status Monitoring**: View connection and peer status
- ✅ **Interactive Shell**: Command completion and history
- ✅ **Graceful Exit**: Proper cleanup on Ctrl+C or quit
- ✅ **Cross-Platform Compatibility**: CLI users can communicate with web users

## Architecture

This CLI client mirrors the functionality of the web app's Vue.js client:

- **AudioClient Class**: Main client logic (equivalent to Vue app data/methods)
- **WebSocket Connection**: Connects to the Ahey server
- **Event Handling**: Processes peer events and messages
- **Command Interface**: Interactive terminal commands
- **State Management**: Tracks peers, audio settings, and connection status

## SSL Certificate Issues

When connecting to `wss://` (secure WebSocket) servers with self-signed certificates, you may encounter certificate errors. Here are the solutions:

### Option 1: Environment Variable (Development Only)
```bash
NODE_TLS_REJECT_UNAUTHORIZED=0 node audio-client.js
```
⚠️ **Warning**: This disables SSL certificate validation entirely and should only be used in development.

### Option 2: Use HTTP Instead of HTTPS
```bash
# In the CLI, switch to non-SSL server
servers
server 2  # Select localhost HTTP version
```

### Option 3: Built-in Certificate Bypass
The CLI automatically allows self-signed certificates for `wss://` connections in development mode.

### Option 4: Add Certificate to System Trust Store
For production use, properly configure SSL certificates and add them to your system's trust store.

## WebRTC Mode

The CLI now supports full WebRTC functionality, enabling real communication with web users:

### WebRTC Features
- **Real Peer-to-Peer Connections**: Uses node-datachannel for native WebRTC support
- **Data Channel Messaging**: Send and receive messages between CLI and web users
- **Session Negotiation**: Full offer/answer exchange with ICE candidate handling
- **Cross-Platform**: CLI users appear as regular peers to web users and vice versa

### Usage
```bash
# Connect with WebRTC support
webrtc channelname

# Send messages that web users can receive
say Hello from CLI!

# Set your name (visible to web users)
name CLI-User-John
```

### Testing Web-to-CLI Communication
1. Start CLI with WebRTC: `webrtc demo`
2. Open browser to: `http://localhost:824/demo`
3. Both CLI and web users will see each other as connected peers
4. Messages sent from either side will be received by the other

## Limitations

### Basic Mode (`connect` command)
This provides a **simulation** of the full audio client:

- **No Real Audio**: Audio toggle is simulated (no actual audio streaming)
- **No WebRTC**: Uses WebSocket messaging instead of peer-to-peer connections
- **Text Only**: Communication is text-based, not voice
- **Demo Purpose**: Designed to demonstrate the app's logic structure

### WebRTC Mode (`webrtc` command)
This provides **real WebRTC connectivity**:

- **Real Peer Connections**: Establishes actual WebRTC peer-to-peer connections
- **Data Channel Messaging**: True peer-to-peer message exchange with web users
- **Cross-Platform Communication**: CLI and web users can communicate seamlessly
- **No Audio Streaming**: Audio is simulated (CLI doesn't have microphone access)
- **Production Ready**: Can be extended to support real audio streaming

## Development

The CLI client demonstrates how the web app's core functionality can be extracted into a pure JavaScript implementation without browser dependencies.

### Key Mappings

| Web App (Vue.js) | CLI Client |
|------------------|------------|
| `App.peers` | `client.peers` |
| `App.channelId` | `client.channelId` |
| `App.audioEnabled` | `client.audioEnabled` |
| `App.toggleAudio()` | `client.toggleAudio()` |
| `App.sendDataMessage()` | `client.sendDataMessage()` |
| `App.handlePeerStream()` | `client.handleDataChannelMessage()` |

This shows how the business logic can be separated from the UI framework.