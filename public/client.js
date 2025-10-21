class MorseSignalApp {
    constructor() {
        this.socket = null;
        this.currentRoom = null;
        this.username = 'OPERATOR_1';
        this.isConnected = false;
        this.decodeMode = 'decoded';

        this.pressStartTime = null;
        this.currentPressTimer = null;
        this.longPressThreshold = 300;

        this.currentMorseSequence = '';
        this.currentMessage = '';
        this.isComposing = false;

        this.messageHistory = [];
        this.transmissionHistory = [];

        this.audioContext = null;
        this.oscillator = null;
        this.isAudioEnabled = false;

        this.initializeApp();
    }

    initializeApp() {
        this.initializeSocket();
        this.initializeEventListeners();
        this.initializeAudio();
        this.showConnectionModal();
    }

    initializeSocket() {
        this.socket = io();

        this.socket.on('connect', () => {
            this.updateConnectionStatus('connected', 'ESTABLISHING LINK...');
        });

        this.socket.on('disconnect', () => {
            this.updateConnectionStatus('disconnected', 'SIGNAL LOST');
            this.addSystemMessage('>> Signal lost. Waiting for reconnection...');
        });

        this.socket.on('room-joined', (data) => {
            this.currentRoom = data.roomId;
            this.updateRoomInfo(data.roomId, data.users.length);
            this.updateConnectionStatus('connected', 'SIGNAL STABLE');
            this.hideConnectionModal();

            this.addSystemMessage(`>> Connected to room ${data.roomId}`);
            if (data.users.length > 1) {
                this.addSystemMessage(`>> Linked with ${data.users.filter(u => u !== this.username).join(', ')}`);
            }

            data.messages.forEach(msg => this.displayMessage(msg));
        });

        this.socket.on('room-full', () => {
            alert('Room is full. Maximum 2 operators per room.');
        });

        this.socket.on('user-joined', (username) => {
            this.addSystemMessage(`>> ${username} joined the channel`);
            this.updateUserCount(2);
        });

        this.socket.on('user-left', (username) => {
            this.addSystemMessage(`>> ${username} left the channel`);
            this.updateUserCount(1);
        });

        this.socket.on('morse-message', (data) => {
            this.displayDecodedMessage(data);
        });

        this.socket.on('morse-message-sent', (data) => {
            this.displayDecodedMessage(data);
        });

        this.socket.on('room-id-generated', (roomId) => {
            document.getElementById('room-input').value = roomId;
        });
    }

    initializeEventListeners() {
        const transmitBtn = document.getElementById('transmit-btn');
        transmitBtn.addEventListener('mousedown', (e) => this.startTransmission(e));
        transmitBtn.addEventListener('mouseup', (e) => this.endTransmission(e));
        transmitBtn.addEventListener('mouseleave', (e) => this.cancelTransmission(e));
        transmitBtn.addEventListener('touchstart', (e) => {
            e.preventDefault();
            this.startTransmission(e);
        });
        transmitBtn.addEventListener('touchend', (e) => {
            e.preventDefault();
            this.endTransmission(e);
        });

        document.addEventListener('keydown', (e) => {
            if (e.code === 'Space' && !e.repeat) {
                e.preventDefault();
                this.startTransmission(e);
            } else if (e.key === '/') {
                e.preventDefault();
                this.addWordSpace();
            } else if (e.key === '\\' || e.key === '|') {
                e.preventDefault();
                this.addLetterSpace();
            } else if (e.key === 'Backspace') {
                e.preventDefault();
                this.backspaceCurrentMessage();
            }
        });

        document.addEventListener('keyup', (e) => {
            if (e.code === 'Space') {
                e.preventDefault();
                this.endTransmission(e);
            }
        });

        document.getElementById('send-btn').addEventListener('click', () => this.sendMessage());

        document.getElementById('clear-btn').addEventListener('click', () => this.clearCurrentMessage());

        document.getElementById('backspace-btn').addEventListener('click', () => this.backspaceCurrentMessage());

        document.getElementById('toggle-mode').addEventListener('click', () => this.toggleDecodeMode());
        document.getElementById('copy-link').addEventListener('click', () => this.copyRoomLink());
        document.getElementById('new-room').addEventListener('click', () => this.requestNewRoom());
        document.getElementById('clear-log').addEventListener('click', () => this.clearTransmissionLog());

        document.getElementById('letter-space-btn').addEventListener('click', () => this.addLetterSpace());
        document.getElementById('word-space-btn').addEventListener('click', () => this.addWordSpace());

        document.getElementById('connect-btn').addEventListener('click', () => this.joinRoom());
        document.getElementById('generate-room').addEventListener('click', () => this.generateRoomId());
        document.getElementById('username-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.joinRoom();
        });
        document.getElementById('room-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.joinRoom();
        });
    }

    initializeAudio() {
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.isAudioEnabled = true;
        } catch (e) {
            console.warn('Web Audio API not supported');
            this.isAudioEnabled = false;
        }
    }

    playTone(duration, frequency = 600) {
        if (!this.isAudioEnabled || !this.audioContext) return;

        try {
            const oscillator = this.audioContext.createOscillator();
            const gainNode = this.audioContext.createGain();

            oscillator.connect(gainNode);
            gainNode.connect(this.audioContext.destination);

            oscillator.frequency.value = frequency;
            oscillator.type = 'sine';

            gainNode.gain.setValueAtTime(0.3, this.audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + duration);

            oscillator.start(this.audioContext.currentTime);
            oscillator.stop(this.audioContext.currentTime + duration);
        } catch (e) {
            console.warn('Audio playback failed:', e);
        }
    }

    startTransmission(e) {
        if (!this.isConnected) {
            this.showConnectionModal();
            return;
        }

        e.preventDefault();
        this.pressStartTime = Date.now();

        this.activateWaveform();
        document.getElementById('transmit-btn').classList.add('pulse-flash');
    }

    endTransmission(e) {
        if (!this.pressStartTime) return;

        e.preventDefault();
        const pressDuration = Date.now() - this.pressStartTime;
        const signalType = pressDuration > this.longPressThreshold ? 'dash' : 'dot';
        const symbol = signalType === 'dash' ? '–' : '·';

        this.pressStartTime = null;

        this.addToSequence(symbol, signalType);

        const toneDuration = signalType === 'dash' ? 300 : 100;
        this.playTone(toneDuration / 1000);

        document.getElementById('transmit-btn').classList.remove('pulse-flash');
    }

    addLetterSpace() {
        if (!this.isConnected) {
            this.showConnectionModal();
            return;
        }

        if (!this.isComposing) {
            this.isComposing = true;
            this.currentMorseSequence = '';
            this.currentMessage = '';
        }

        this.currentMorseSequence += ' ';

        this.updateTransmissionLog();

        this.updateCurrentMessageDisplay();

        this.decodeCurrentSequence();

        this.playTone(0.05, 400);
    }

    addWordSpace() {
        if (!this.isConnected) {
            this.showConnectionModal();
            return;
        }

        if (!this.isComposing) {
            this.isComposing = true;
            this.currentMorseSequence = '';
            this.currentMessage = '';
        }

        this.currentMorseSequence += '   ';

        this.updateTransmissionLog();

        this.updateCurrentMessageDisplay();

        this.decodeCurrentSequence();

        this.playTone(0.1, 300);
    }

    backspaceCurrentMessage() {
        if (!this.isComposing || this.currentMorseSequence.length === 0) {
            return;
        }

        if (this.currentMorseSequence.endsWith('   ')) {
            this.currentMorseSequence = this.currentMorseSequence.slice(0, -3);
        } else if (this.currentMorseSequence.endsWith(' ')) {
            this.currentMorseSequence = this.currentMorseSequence.slice(0, -1);
        } else {
            this.currentMorseSequence = this.currentMorseSequence.slice(0, -1);
        }

        this.updateTransmissionLog();

        this.updateCurrentMessageDisplay();

        this.decodeCurrentSequence();

        this.playTone(0.05, 200);
    }

    addToSequence(symbol, signalType) {
        if (!this.isComposing) {
            this.isComposing = true;
            this.currentMorseSequence = '';
            this.currentMessage = '';
        }

        this.currentMorseSequence += symbol;

        this.updateTransmissionLog();

        this.updateCurrentMessageDisplay();

        this.decodeCurrentSequence();
    }

    updateTransmissionLog() {
        const log = document.getElementById('transmission-log');

        const existingComposition = log.querySelector('.composition-line');
        if (existingComposition) {
            existingComposition.remove();
        }

        const placeholder = log.querySelector('.text-gray-500');
        if (placeholder && !placeholder.textContent.includes('cleared') && !placeholder.textContent.includes('Waiting for')) {
            placeholder.remove();
        }

        const compositionLine = document.createElement('div');
        compositionLine.className = 'composition-line text-green-400 text-sm mb-2';
        const timestamp = new Date().toLocaleTimeString();

        const displaySequence = this.currentMorseSequence
            .replace(/ /g, '␣')
            .replace(/␣␣␣/g, '␣␣␣');

        compositionLine.innerHTML = `
            <span class="text-gray-500">[${timestamp}]</span>
            <span class="text-green-400">YOU:</span>
            <span class="font-mono font-bold">${displaySequence}</span>
            ${this.currentMessage ? `<span class="text-gray-400 ml-2">→ "${this.currentMessage}"</span>` : ''}
        `;

        log.appendChild(compositionLine);
        log.scrollTop = log.scrollHeight;
    }

    updateCurrentMessageDisplay() {
        const displayMorse = this.currentMorseSequence
            .replace(/ /g, '␣')
            .replace(/␣␣␣/g, '␣␣␣');

        document.getElementById('current-morse').textContent = displayMorse || '[empty]';
        document.getElementById('current-text').textContent = this.currentMessage || '[empty]';
    }

    decodeCurrentSequence() {
        const morseWords = this.currentMorseSequence.split('   ');
        let decodedMessage = '';

        for (const morseWord of morseWords) {
            const morseLetters = morseWord.split(' ').filter(s => s);
            let decodedWord = '';

            for (const morseLetter of morseLetters) {
                if (morseLetter) {
                    const letter = this.morseToText(morseLetter);
                    decodedWord += letter;
                }
            }

            if (decodedWord) {
                decodedMessage += (decodedMessage ? ' ' : '') + decodedWord;
            }
        }

        this.currentMessage = decodedMessage;
        this.updateTransmissionLog();
        this.updateCurrentMessageDisplay();
    }

    morseToText(morse) {
        const morseMap = {
            '·–': 'A', '–···': 'B', '–·–·': 'C', '–··': 'D', '·': 'E',
            '··–·': 'F', '––·': 'G', '····': 'H', '··': 'I', '·–––': 'J',
            '–·–': 'K', '·–··': 'L', '––': 'M', '–·': 'N', '–––': 'O',
            '·––·': 'P', '––·–': 'Q', '·–·': 'R', '···': 'S', '–': 'T',
            '··–': 'U', '···–': 'V', '·––': 'W', '–··–': 'X', '–·––': 'Y',
            '––··': 'Z', '·––––': '1', '··–––': '2', '···––': '3',
            '····–': '4', '·····': '5', '–····': '6', '––···': '7',
            '–––··': '8', '––––·': '9', '–––––': '0', '': ' '
        };

        const standardMorse = morse.replace(/·/g, '.').replace(/–/g, '-');

        for (const [morsePattern, letter] of Object.entries(morseMap)) {
            const standardPattern = morsePattern.replace(/·/g, '.').replace(/–/g, '-');
            if (standardPattern === standardMorse) {
                return letter;
            }
        }

        return '?';
    }

    sendMessage() {
        if (!this.currentMessage.trim() || !this.isComposing) {
            this.addSystemMessage('>> No message to send');
            return;
        }

        if (!this.socket || !this.currentRoom) return;

        const messageData = {
            message: this.currentMessage,
            morse: this.currentMorseSequence,
            timestamp: Date.now()
        };

        this.socket.emit('morse-message', messageData);

        this.addSentMessageToLog();

        this.currentMorseSequence = '';
        this.currentMessage = '';
        this.isComposing = false;
        this.updateCurrentMessageDisplay();

        this.addSystemMessage('>> Message sent');
    }

    addSentMessageToLog() {
        const log = document.getElementById('transmission-log');

        const compositionLine = log.querySelector('.composition-line');
        if (compositionLine) {
            compositionLine.remove();
        }

        const timestamp = new Date().toLocaleTimeString();
        const sentLine = document.createElement('div');
        sentLine.className = 'log-entry you text-sm';

        const displayMorse = this.currentMorseSequence
            .replace(/ /g, '␣')
            .replace(/␣␣␣/g, '␣␣␣');

        sentLine.innerHTML = `
            <span class="text-gray-500">[${timestamp}]</span>
            <span class="text-green-400">YOU:</span>
            <span class="font-mono font-bold">${displayMorse}</span>
            <span class="text-gray-400 ml-2">→ sent</span>
        `;

        this.transmissionHistory.push({
            type: 'sent',
            morse: this.currentMorseSequence,
            timestamp: timestamp,
            element: sentLine
        });

        log.appendChild(sentLine);
        log.scrollTop = log.scrollHeight;
    }

    clearCurrentMessage() {
        if (this.isComposing) {
            this.currentMorseSequence = '';
            this.currentMessage = '';
            this.isComposing = false;
            this.updateCurrentMessageDisplay();

            const log = document.getElementById('transmission-log');
            const compositionLine = log.querySelector('.composition-line');
            if (compositionLine) {
                compositionLine.remove();
            }

            this.addSystemMessage('>> Message cleared');
        }
    }

    displayDecodedMessage(data) {
        const decodedArea = document.getElementById('decoded-text');
        const isYou = data.username === this.username;

        const placeholder = decodedArea.querySelector('.text-gray-500');
        if (placeholder && this.messageHistory.length > 0) {
            placeholder.remove();
        }

        const messageDiv = document.createElement('div');
        messageDiv.className = `mb-2 ${isYou ? 'text-green-400' : 'text-blue-400'}`;

        const timestamp = new Date(data.timestamp).toLocaleTimeString();

        if (this.decodeMode === 'decoded') {
            messageDiv.innerHTML = `
                <span class="text-gray-500">[${timestamp}]</span>
                <span class="${isYou ? 'text-green-400' : 'text-blue-400'}">${data.username}:</span>
                ${data.message}
            `;
        } else {
            const displayMorse = data.morse
                .replace(/ /g, '␣')
                .replace(/␣␣␣/g, '␣␣␣');

            messageDiv.innerHTML = `
                <span class="text-gray-500">[${timestamp}]</span>
                <span class="${isYou ? 'text-green-400' : 'text-blue-400'}">${data.username}:</span>
                ${displayMorse}
            `;
        }

        this.messageHistory.push({
            message: data.message,
            morse: data.morse,
            username: data.username,
            timestamp: timestamp,
            element: messageDiv,
            isYou: isYou
        });

        this.renderAllDecodedMessages();

        const cursor = document.createElement('div');
        cursor.className = 'blinking-cursor';
        cursor.textContent = '_';
        decodedArea.appendChild(cursor);

        decodedArea.scrollTop = decodedArea.scrollHeight;
    }

    renderAllDecodedMessages() {
        const decodedArea = document.getElementById('decoded-text');
        decodedArea.innerHTML = '';

        if (this.messageHistory.length === 0) {
            const placeholder = document.createElement('div');
            placeholder.className = 'text-gray-500';
            placeholder.textContent = '>> No messages decoded yet';
            decodedArea.appendChild(placeholder);
        } else {
            this.messageHistory.forEach(msg => {
                const messageDiv = document.createElement('div');
                messageDiv.className = `mb-2 ${msg.isYou ? 'text-green-400' : 'text-blue-400'}`;

                if (this.decodeMode === 'decoded') {
                    messageDiv.innerHTML = `
                        <span class="text-gray-500">[${msg.timestamp}]</span>
                        <span class="${msg.isYou ? 'text-green-400' : 'text-blue-400'}">${msg.username}:</span>
                        ${msg.message}
                    `;
                } else {
                    const displayMorse = msg.morse
                        .replace(/ /g, '␣')
                        .replace(/␣␣␣/g, '␣␣␣');

                    messageDiv.innerHTML = `
                        <span class="text-gray-500">[${msg.timestamp}]</span>
                        <span class="${msg.isYou ? 'text-green-400' : 'text-blue-400'}">${msg.username}:</span>
                        ${displayMorse}
                    `;
                }

                decodedArea.appendChild(messageDiv);
            });
        }
    }

    toggleDecodeMode() {
        const toggleBtn = document.getElementById('toggle-mode');
        this.decodeMode = this.decodeMode === 'raw' ? 'decoded' : 'raw';
        toggleBtn.textContent = this.decodeMode.toUpperCase();

        this.renderAllDecodedMessages();

        const decodedArea = document.getElementById('decoded-text');
        const cursor = document.createElement('div');
        cursor.className = 'blinking-cursor';
        cursor.textContent = '_';
        decodedArea.appendChild(cursor);
        decodedArea.scrollTop = decodedArea.scrollHeight;
    }

    activateWaveform() {
        const waveform = document.getElementById('waveform');
        waveform.classList.remove('waveform-active');
        void waveform.offsetWidth;
        waveform.classList.add('waveform-active');
    }

    updateConnectionStatus(status, message) {
        const statusEl = document.getElementById('connection-status');
        const indicator = statusEl.querySelector('div');
        const text = statusEl.querySelector('span');

        indicator.className = 'w-2 h-2 rounded-full';

        switch (status) {
            case 'connected':
                indicator.classList.add('status-online');
                this.isConnected = true;
                break;
            case 'disconnected':
                indicator.classList.add('status-offline');
                this.isConnected = false;
                break;
            case 'connecting':
                indicator.classList.add('status-connecting');
                this.isConnected = false;
                break;
        }

        text.textContent = message;
    }

    updateRoomInfo(roomId, userCount) {
        document.getElementById('room-id').textContent = roomId;
        this.updateUserCount(userCount);
    }

    updateUserCount(count) {
        document.getElementById('user-count').querySelector('span').textContent = count;
    }

    addSystemMessage(message) {
        const log = document.getElementById('transmission-log');
        const entry = document.createElement('div');
        entry.className = 'text-gray-500 text-sm italic';
        const timestamp = new Date().toLocaleTimeString();
        entry.innerHTML = `<span class="text-gray-500">[${timestamp}]</span> ${message}`;

        this.transmissionHistory.push({
            type: 'system',
            message: message,
            timestamp: timestamp,
            element: entry
        });

        log.appendChild(entry);
        log.scrollTop = log.scrollHeight;
    }

    showConnectionModal() {
        document.getElementById('connection-modal').classList.remove('hidden');
    }

    hideConnectionModal() {
        document.getElementById('connection-modal').classList.add('hidden');
    }

    joinRoom() {
        const usernameInput = document.getElementById('username-input');
        const roomInput = document.getElementById('room-input');

        this.username = usernameInput.value.trim() || 'OPERATOR_1';
        const roomId = roomInput.value.trim().toUpperCase();

        if (!roomId) {
            alert('Please enter a room ID');
            return;
        }

        this.socket.emit('join-room', roomId, this.username);
        this.updateConnectionStatus('connecting', 'ESTABLISHING LINK...');
    }

    generateRoomId() {
        this.socket.emit('request-room-id');
    }

    requestNewRoom() {
        this.generateRoomId();
        this.joinRoom();
    }

    copyRoomLink() {
        if (!this.currentRoom) {
            alert('Not connected to a room');
            return;
        }

        const link = `${window.location.origin}?room=${this.currentRoom}`;
        navigator.clipboard.writeText(link).then(() => {
            this.addSystemMessage('>> Room link copied to clipboard');
            this.addSystemMessage(`>> Share this link with your partner: ${link}`);
        }).catch(() => {
            alert('Failed to copy room link');
        });
    }

    clearTransmissionLog() {
        document.getElementById('transmission-log').innerHTML =
            '<div class="text-gray-500">>> Transmission log cleared</div>';
        this.currentMorseSequence = '';
        this.currentMessage = '';
        this.isComposing = false;
        this.updateCurrentMessageDisplay();
        this.transmissionHistory = [];
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new MorseSignalApp();
});

document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
    } else {
        if (window.morseApp && window.morseApp.audioContext && window.morseApp.audioContext.state === 'suspended') {
            window.morseApp.audioContext.resume();
        }
    }
});
