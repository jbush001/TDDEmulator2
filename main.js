//
// Copyright 2026 Jeff Bush
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
//

// Maps a 7 bit unicode code point to a 5 bit baudot code.	A -1 in this
// table indicates no mapping.	If the 7th bit is set (0x80), then this
// is in the FIG table, otherwise it is in the LTR table.
const UNICODE_TO_BAUDOT = [
  -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 130, -1, -1, 136, -1, -1, -1,
  -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 132, 141,
  145, -1, 137, -1, -1, 139, 143, 146, -1, 154, 140, 133, 156, 157, 150,
  151, 147, 129, 138, 144, 149, 135, 134, 152, 142, 158, -1, 148, -1,
  153, -1, 3, 25, 14, 9, 1, 13, 26, 20, 6, 11, 15, 18, 28, 12, 24, 22, 23,
  10, 5, 16, 7, 30, 19, 29, 21, 17, -1, -1, -1, -1, -1, -1, 3, 25, 14, 9,
  1, 13, 26, 20, 6, 11, 15, 18, 28, 12, 24, 22, 23, 10, 5, 16, 7, 30, 19,
  29, 21, 17, -1, -1, -1, -1, -1
];

class BaudotEncoder {
    constructor() {
      this.inFigMode = false;
    }

    process(input) {
      const codePoint = input.charCodeAt(0);
      if (codePoint > 127) {
        return; // Can't encode
      }

      const encoded = UNICODE_TO_BAUDOT[input.charCodeAt(0)];
      const needFig = (encoded & 0x80) != 0;
      const response = [];
      if (needFig && !this.inFigMode) {
        response.push(0x1b);
        this.inFigMode = true;
      } else if (!needFig && this.inFigMode) {
        response.push(0x1f);
        this.inFigMode = false;
      }

      response.push(encoded & 0x7f);
      return response;
    }
}

// Baudot to unicode tables
const LTR_TO_UNICODE = [
  ' ', 'E', '\n', 'A', ' ', 'S', 'I', 'U',
  '\r', 'D', 'R', 'J', 'N', 'F', 'C', 'K',
  'T', 'Z', 'L', 'W', 'H', 'Y', 'P', 'Q',
  'O', 'B', 'G', ' ', 'M', 'X', 'V', ' '
];

const FIG_TO_UNICODE = [
  ' ', '3', '\n', '-', ' ', '-', '8', '7',
  '\r', '$', '4', '\'', ',', '!', ':', '(',
  '5', '\"', ')', '2', '=', '6', '0', '1',
  '9', '?', '+', ' ', '.', '/', ';', ' '
];

class BaudotDecoder {
    constructor() {
        this.inFigMode = false;
    }

    process(input) {
        if (input == 0x1b) {
            this.inFigMode = true;
            return '';
        } else if (input == 0x1f) {
            this.inFigMode = false;
            return '';
        } else if (this.inFigMode) {
            return FIG_TO_UNICODE[input];
        } else {
            return LTR_TO_UNICODE[input];
        }
    }
}

let audioContext = null;
let workletNode = null;
let currentRecvMsgDiv = null;
let audioStarted = false;
const decoder = new BaudotDecoder();
const encoder = new BaudotEncoder();
let lastReceiveTime = 0;

document.addEventListener('DOMContentLoaded', async (event) => {
  audioContext = new AudioContext();
  await audioContext.audioWorklet.addModule('audio-worklet.mjs', {
    credentials: 'omit'
  });

  workletNode = new AudioWorkletNode(audioContext, 'modem');
  workletNode.onprocessorerror = (err) => {
    console.log('worklet node encountered error', err);
  };

  const stream = await navigator.mediaDevices
      .getUserMedia({ audio: {
        autoGainControl: false,
        noiseSuppression: false,
        echoCancellation: false
      }, video: false });
  const source = audioContext.createMediaStreamSource(stream);
  source.connect(workletNode);
  workletNode.connect(audioContext.destination);

  workletNode.port.onmessage = (event) => {
    char = decoder.process(event.data);
    if (char) {
      addReceiveMessageToHistory(char);
    }
  }

  document.getElementById('send-button').addEventListener('click', handleSendMessage);
  document.getElementById('user-input').addEventListener('keypress', (e) => {
    startAudio();

    if (e.key === 'Enter') {
      handleSendMessage();
    }
  });
});

// We need to do this lazily, since the browser won't allow us to until the user interacts
// with the page.
function startAudio() {
  if (!audioStarted) {
    audioContext.resume();
    audioStarted = true;
  }
}

function handleSendMessage() {
  const inputField = document.getElementById('user-input');
  const text = inputField.value.trim();
  if (!text) {
    return;
  }

  inputField.value = '';

  addSentMessageToHistory(text);
  const msg = [];
  for (let i = 0; i < text.length; i++) {
    const encoded = encoder.process(text[i]);
    for (const ch of encoded) {
      msg.push(ch);
    }
  }

  workletNode.port.postMessage(msg);
}

function addReceiveMessageToHistory(text) {
  // Characters come in slowly, so we generally append to the last message,
  // unless enough time has elapsed since the previous one that it looks like
  // a new message, or another message was sent in the interim.
  if (currentRecvMsgDiv == null || (Date.now() - lastReceiveTime) > 3000) {
    const chatHistory = document.getElementById('message-history');
    currentRecvMsgDiv = document.createElement('div');
    currentRecvMsgDiv.classList.add('message', 'received');
    chatHistory.appendChild(currentRecvMsgDiv);
    chatHistory.scrollTop = chatHistory.scrollHeight;
  }

  lastReceiveTime = Date.now();
  currentRecvMsgDiv.textContent += text;
}

function addSentMessageToHistory(text) {
  const chatHistory = document.getElementById('message-history');
  const messageDiv = document.createElement('div');
  messageDiv.classList.add('message', 'sent');

  currentRecvMsgDiv = null;
  messageDiv.textContent = text;
  chatHistory.appendChild(messageDiv);
  chatHistory.scrollTop = chatHistory.scrollHeight;
}
