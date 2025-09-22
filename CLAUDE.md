# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Ahey is a free, peer-to-peer group video call application built on WebRTC. It enables direct browser-to-browser video, audio, and text communication without requiring signups, downloads, or central media servers. The app uses a mesh topology where each participant connects directly to every other participant.

## Commands

### Development
- `npm start` - Start the server (runs pre-start script then init.js)
- `node init.js` - Start the server directly
- `npm run format:ejs` - Format EJS template files with Prettier

### Docker
- `npm run docker` - Build and run Docker container on port 824

### Configuration
- Default port: 824 (configurable via PORT env var)
- HTTPS support via SSL env var and domain certificates (domain.pem, domain-key.pem)
- CORS origins configurable via CORS_ORIGIN env var

## Architecture

### Server Structure
- **Entry Point**: `init.js` - Main server initialization with HTTP/HTTPS setup
- **Configuration**: `server/config.js` - Environment-based configuration
- **Routing**: `server/routes.js` - Express routes for pages and channels
- **WebRTC Signaling**: `server/signalling-server.js` - Socket.IO-based peer discovery and connection management
- **Utilities**: `server/utils.js` - Channel name validation and helpers

### Client Structure
- **Frontend**: EJS templates in `views/` directory with Vue.js components
- **Static Assets**: `public/` contains client-side JavaScript, icons, and service worker
- **Key Client Files**:
  - `public/app.js` - Main application logic
  - `public/peer.js` - WebRTC peer connection handling
  - `public/ice-config.js` - STUN/TURN server configuration

### WebRTC Signaling Flow
The signaling server manages peer discovery without handling media streams:
1. Clients join channels via Socket.IO
2. Server maintains `channels`, `sockets`, and `peers` objects
3. New peers trigger `addPeer` events to existing participants
4. ICE candidates and session descriptions are relayed between peers
5. Media flows directly peer-to-peer after connection establishment

### Channel System
- Channels are identified by URL path (e.g., `/my-channel`)
- Channel names must pass validation in `server/utils.js`
- Dynamic routing handles channel pages via `/:channel` route
- Special routes: `/join` (connection page), `/privacy`, `/terms`

### Template System
- Uses EJS for server-side rendering
- Shared partials: `head.ejs`, `footer.ejs`
- Page-specific templates for different views and error states