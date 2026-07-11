//
// Copyright 2026 Jeff Bush
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//   http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
//

import * as dsp from './dsp.mjs';

const GUARD_PERIOD = 10;

class Modem extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.port.onmessage = this.handleMessage.bind(this);
    this.theta = 0;
    this.demodulator = null;
    this.modulator = null;
    this.serialDecoder = null;
    this.serialEncoder = null;
    this.fullDuplex = false;
    this.sendBuffer = [];
    this.sending = false;
    this.guardTimer = 0;
  }

  process(inputs, outputs, parameters) {
    // The guard timer disables reception for a period after sending finishes,
    // as there is some latency in the audio pipeline that can cause stray
    // characters to appear otherwise.
    if (this.guardTimer > 0) {
      this.guardTimer--;
    }

    this.processOutput(outputs[0][0]);

    // This is single duplex. We don't decode messages our own sent messages,
    // so disable decoding while we are transmitting.
    if (inputs && inputs[0].length > 0 &&
      ((!this.sending && this.guardTimer == 0) || this.fullDuplex)) {
      this.processInput(inputs[0][0]);
    }

    return true;
  }

  processOutput(buffer) {
    if (!this.serialEncoder.isSending() && this.sendBuffer.length > 0) {
      this.serialEncoder.sendValue(this.sendBuffer.shift());
    }

    const newSending = this.serialEncoder.isSending() || this.sendBuffer.length != 0;
    if (!newSending && this.sending) {
      // We've just finished sending, start the timer
      this.guardTimer = GUARD_PERIOD;
    }

    this.sending = newSending;

    if (newSending) {
      for (let i = 0; i < buffer.length; i++) {
        const nrz = this.serialEncoder.process();
        buffer[i] = this.modulator.process(nrz);
      }
    }
  }

  processInput(buffer) {
    for (let i = 0; i < buffer.length; i++) {
      let nrz = this.demodulator.process(buffer[i]);
      this.serialDecoder.process(nrz);
    }
  }

  handleMessage(event) {
    const message = event.data;
    switch (message.type) {
      case 'send':
        this.sendBuffer = this.sendBuffer.concat(message.content);
        break;

      case 'config': {
        this.demodulator = new dsp.FSKDemodulator(message.config.rxMarkFrequency,
          message.config.rxSpaceFrequency, message.config.bitRate, sampleRate);
        this.modulator = new dsp.FSKModulator(message.config.txMarkFrequency,
          message.config.txSpaceFrequency, sampleRate);
        
        let samplesPerBit = Math.floor(sampleRate / message.config.bitRate)
        this.serialDecoder = new dsp.SerialDecoder(message.config.dataBits,
          samplesPerBit, (value) => {
          this.port.postMessage(value);
        });
        this.serialEncoder = new dsp.SerialEncoder(message.config.dataBits,
          samplesPerBit);
        this.fullDuplex = message.config.fullDuplex;
        break;
      }
    }
  }
}

registerProcessor('modem', Modem);
