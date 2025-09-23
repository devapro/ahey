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
| `connect <channel>` | `c` | Connect to an audio channel |
| `disconnect` | `d` | Disconnect from current channel |
| `name <name>` | `n` | Set your display name |
| `audio` | `a` | Toggle audio on/off |
| `peers` | `p` | List connected peers |
| `say <message>` | `s` | Send text message to channel |
| `status` | | Show connection status |
| `quit` | `q` | Exit application |

### Examples

```bash
# Connect to a channel called "meeting"
connect meeting

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
- ✅ **Peer Discovery**: See who else is connected
- ✅ **Name Management**: Set and change your display name
- ✅ **Audio Control**: Toggle audio on/off (simulated)
- ✅ **Text Messaging**: Send messages to the channel
- ✅ **Status Monitoring**: View connection and peer status
- ✅ **Interactive Shell**: Command completion and history
- ✅ **Graceful Exit**: Proper cleanup on Ctrl+C or quit

## Architecture

This CLI client mirrors the functionality of the web app's Vue.js client:

- **AudioClient Class**: Main client logic (equivalent to Vue app data/methods)
- **WebSocket Connection**: Connects to the Ahey server
- **Event Handling**: Processes peer events and messages
- **Command Interface**: Interactive terminal commands
- **State Management**: Tracks peers, audio settings, and connection status

## Limitations

This CLI version is a **simulation** of the full audio client:

- **No Real Audio**: Audio toggle is simulated (no actual audio streaming)
- **No WebRTC**: Uses WebSocket messaging instead of peer-to-peer connections
- **Text Only**: Communication is text-based, not voice
- **Demo Purpose**: Designed to demonstrate the app's logic structure

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