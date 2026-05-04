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


// https://en.wikipedia.org/wiki/Baudot_code
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

// Create the inverse table from above
const UNICODE_TO_BAUDOT = Object.freeze(
  LTR_TO_UNICODE.reduce((accumulator, ltr, index) => {
    if (ltr) {
      accumulator[ltr] = index;
      accumulator[ltr.toLowerCase()] = index;
    }
    return accumulator;
  },
  FIG_TO_UNICODE.reduce((accumulator, fig, index) => {
    if (fig) accumulator[fig] = index | 0x80;
    return accumulator;
  }, {})));

class BaudotEncoder {
    constructor() {
      this.inFigMode = false;
    }

    process(input) {
      const encoded = UNICODE_TO_BAUDOT[input];
      if (encoded === undefined) {
        console.log('cannot encode', input);
        return []; // Not in table
      }

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

class ASCIIEncoder {
  process(input) {
    return [input.charCodeAt(0)];
  }
}

class ASCIIDecoder {
  process(input) {
    return String.fromCharCode(input);
  }
}

let audioContext = null;
let workletNode = null;
let currentRecvMsgDiv = null;
let audioStarted = false;
let decoder = null;
let encoder = null;
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

  const protocolSelector = document.getElementById('protocol');
  for (const type of Object.keys(CONFIGS)) {
    const option = document.createElement('option');
    option.value = type;
    option.innerText = type;
    protocolSelector.appendChild(option);
  }

  protocolSelector.addEventListener('change', (event) =>  {
    configureModem(event.target.value);
  });

  protocolSelector.selectedIndex = 0;
  configureModem(protocolSelector.options[0].value);

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

const CONFIGS = {
  'TIA/EIA-825': {
      rxMarkFrequency: 1400,
      rxSpaceFrequency: 1800,
      txMarkFrequency: 1400,
      txSpaceFrequency: 1800,
      bitRate: 45,
      dataBits: 5,
      fullDuplex: false,
  },
  'v.18 originate': {
      rxMarkFrequency: 1650,
      rxSpaceFrequency: 1850,
      txMarkFrequency: 980,
      txSpaceFrequency: 1180,
      bitRate: 150, // XXX this should be 300, but doesn't work acoustically
      dataBits: 8,
      fullDuplex: true,
  },
  'v.18 answer': {
      rxMarkFrequency: 980,
      rxSpaceFrequency: 1180,
      txMarkFrequency: 1650,
      txSpaceFrequency: 1850,
      bitRate: 150,
      dataBits: 8,
      fullDuplex: true,
  }
};

function configureModem(mode) {
  workletNode.port.postMessage({
    type: 'config',
    config: CONFIGS[mode]
  });

  if (mode == 'TIA/EIA-825') {
    decoder = new BaudotDecoder();
    encoder = new BaudotEncoder();
  } else {
    decoder = new ASCIIDecoder();
    encoder = new ASCIIEncoder();
  }
}

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

  workletNode.port.postMessage({type: 'send', content: msg});
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
