
import core from './core.js';

// Expose core state and methods globally for peer.js and other scripts
window.core = core;

// Example: initialize state from URL (mimic previous Vue data init)
const searchParams = new URLSearchParams(window.location.search);
core.state.channelId = window.location.pathname.substr(1);
core.state.name = searchParams.get('name') ?? window.localStorage.name;

// Example: auto-initiate call on mount
core.autoInitiateCall = function() {
	core.state.channelId = window.location.pathname.substr(1);
	const deviceName = hash(navigator.userAgent);
	core.state.name = deviceName || 'Guest';
	core.state.callInitiated = true;
	core.state.showExtraControls = false;
	window.initiateCall();
};

// Optionally, call autoInitiateCall on load
core.autoInitiateCall();
