
// Assumes core.js is loaded via a <script> tag before this file
// and is available as window.core

// Minimal Vue app for UI, proxies core.state and core methods
const App = Vue.createApp({
	data() {
		// Make core.state reactive so UI updates
		if (!core._reactiveState) {
			core._reactiveState = Vue.reactive(core.state);
		}
		return core._reactiveState;
	},
	methods: {
		toggleExtraControls: core.toggleExtraControls ? core.toggleExtraControls.bind(core) : function() {
			this.showExtraControls = !this.showExtraControls;
		},
		resetPopups: core.resetPopups ? core.resetPopups.bind(core) : function() {
			this.showExtraControls = false;
			this.showAudioDevices = false;
		},
		initiateCall: core.initiateCall ? core.initiateCall.bind(core) : function() {},
		autoInitiateCall: core.autoInitiateCall ? core.autoInitiateCall.bind(core) : function() {},
		setToast: core.setToast.bind(core),
		copyURL: core.copyURL.bind(core),
		toggleAudio: core.toggleAudio.bind(core),
		switchAudioDevice: core.switchAudioDevice.bind(core),
		togglePreCallAudio: core.togglePreCallAudio.bind(core),
		endCall: core.endCall.bind(core),
		updateName() {
			core.updateName(this.name);
		},
	},
	computed: {
		peersArray() {
			return Object.keys(this.peers)
				.filter((p) => this.peers[p].data && this.peers[p].data.userAgent)
				.map((peer) => ({
					stream: this.peers[peer].stream,
					name: this.peers[peer].data.peerName,
					isTalking: this.peers[peer].data.isTalking,
				}));
		},
	},
	mounted() {
		// Optionally auto-initiate call for join.ejs
		if (window.location.pathname.includes('join')) {
			this.autoInitiateCall();
		}
	},
}).mount('#app');
