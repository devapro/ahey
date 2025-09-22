// core.js: Pure JS logic extracted from app.js (no Vue)

const core = {
    state: {
        channelId: '',
        peerId: '',
        userAgent: '',
        audioDevices: [],
        audioEnabled: true,
        selectedAudioDeviceId: null,
        name: '',
        callInitiated: false,
        localMediaStream: null,
        peers: {},
        dataChannels: {},
        showExtraControls: false,
        showAudioDevices: false,
        toast: { type: '', message: '' },
    },
    autoInitiateCall() {
        this.state.channelId = window.location.pathname.substr(1);
        const deviceName = typeof hash === 'function' ? hash(navigator.userAgent) : navigator.userAgent;
        this.state.name = deviceName || 'Guest';
        this.state.callInitiated = true;
        this.state.showExtraControls = false;
        window.initiateCall();
    },
    initiateCall() {
        if (!this.state.channelId) return alert('Invalid channel id');
        if (!this.state.name) return alert('Please enter your name');
        this.state.callInitiated = true;
        this.state.showExtraControls = false;
        window.initiateCall();
    },
// core.js: Pure JS logic extracted from app.js (no Vue)

    // ...rest of core object unchanged...
    setTalkingPeer(peerId, isTalking) {
        if (this.state.peers[peerId] && this.state.peers[peerId].data) {
            this.state.peers[peerId].data.isTalking = isTalking;
        }
    },
    setToast(message, type = 'error') {
        this.state.toast = { type, message, time: new Date().getTime() };
        setTimeout(() => {
            if (new Date().getTime() - this.state.toast.time >= 3000) {
                this.state.toast.message = '';
            }
        }, 3500);
    },
    copyURL() {
        navigator.clipboard.writeText(`${window.location.origin}/${this.state.channelId}`).then(
            () => this.setToast('Channel URL copied 👍', 'success'),
            () => console.error('Unable to copy channel URL')
        );
    },
    toggleAudio() {
        this.state.audioEnabled = !this.state.audioEnabled;
        this.getPreCallMedia();
    },
    switchAudioDevice(newDeviceId) {
        this.state.selectedAudioDeviceId = newDeviceId;
        this.getPreCallMedia();
    },
    togglePreCallAudio() {
        this.state.audioEnabled = !this.state.audioEnabled;
        this.getPreCallMedia();
    },
    endCall() {
        if (window.signalingSocket) {
            window.signalingSocket.disconnect();
        }
        Object.keys(this.state.peers).forEach((peerId) => {
            if (this.state.peers[peerId].rtc) {
                this.state.peers[peerId].rtc.close();
            }
        });
        Object.keys(this.state.dataChannels).forEach((peerId) => {
            if (this.state.dataChannels[peerId]) {
                this.state.dataChannels[peerId].close();
            }
        });
        this.state.peers = {};
        this.state.dataChannels = {};
        this.state.callInitiated = false;
        this.setToast('Call ended', 'success');
        this.getPreCallMedia();
    },
    updateName(name) {
        this.state.name = name;
        window.localStorage.name = name;
    },
    async enumerateDevices() {
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            this.state.audioDevices = devices.filter((device) => device.kind === 'audioinput');
            const defaultAudioDeviceId = this.state.audioDevices.find((device) => device.deviceId == 'default')?.deviceId;
            this.state.selectedAudioDeviceId = defaultAudioDeviceId ?? this.state.audioDevices[0]?.deviceId;
        } catch (error) {
            console.error('Failed to initialize media devices:', error);
        }
    },
    getBlankTrack(kind) {
        if (kind === 'audio') {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = ctx.createOscillator();
            const dst = ctx.createMediaStreamDestination();
            oscillator.connect(dst);
            oscillator.start();
            oscillator.stop(ctx.currentTime + 0.01);
            return dst.stream.getAudioTracks()[0];
        }
        return null;
    },

    async getPreCallMedia() {
        try {
            if (this.state.localMediaStream) {
                this.state.localMediaStream.getTracks().forEach((track) => track.stop());
            }
            if (!this.state.audioEnabled) {
                // Don't call getUserMedia with empty constraints
                const tracks = [this.getBlankTrack('audio')];
                this.state.localMediaStream = new MediaStream(tracks);
                this.setToast('Microphone is disabled');
                return;
            }
            const constraints = this.state.selectedAudioDeviceId
                ? { audio: { deviceId: this.state.selectedAudioDeviceId } }
                : { audio: true };
            this.state.localMediaStream = await navigator.mediaDevices.getUserMedia(constraints);
            if (this.state.audioDevices.length === 0) {
                await this.enumerateDevices();
            }
        } catch (e) {
            console.error('Failed to get pre-call media:', e);
            this.state.audioEnabled = false;
            const tracks = [this.getBlankTrack('audio')];
            this.state.localMediaStream = new MediaStream(tracks);
            this.setToast('Unable to access microphone');
        }
    }
};
window.core = core;
