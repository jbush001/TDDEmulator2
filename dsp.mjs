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

export class BandpassFilter {
  constructor(fc, bw, sampleRate) {
    // 2-pole IIR biquad filter.
    // This formula is from Digital Signal Processing by Steven W. Smith,
    // equation 19-7, page 326.
    const normFreq = 2 * Math.PI * (fc / sampleRate);
    const normBandwidth = bw / sampleRate;
    const r = 1.0 - 3.0 * normBandwidth;
    const k = (1.0 - 2.0 * r * Math.cos(normFreq) + Math.pow(r, 2.0))
      / (2.0 - 2.0 * Math.cos(normFreq));
    this.a0 = 1.0 - k;
    this.a1 = 2.0 * (k - r) * Math.cos(normFreq);
    this.a2 = Math.pow(r, 2.0) - k;
    this.b0 = 2.0 * r * Math.cos(normFreq);
    this.b1 = -Math.pow(r, 2.0);
    this.x0 = 0;
    this.x1 = 0;
    this.x2 = 0;
    this.y0 = 0;
    this.y1 = 0;
  }

  process(sample) {
    this.x2 = this.x1;
    this.x1 = this.x0;
    this.x0 = sample;

    const y = this.a0 * this.x0 + this.a1 * this.x1 + this.a2 * this.x2
      + this.b0 * this.y0 + this.b1 * this.y1;

    this.y1 = this.y0;
    this.y0 = y;

    return y;
  }
}

export class LowpassFilter {
  constructor(fc, sampleRate) {
    // Single pole IIR filter.
    this.b0 = Math.pow(Math.E, -2 * Math.PI * fc / sampleRate);
    this.a0 = 1 - this.b0;
    this.y = 0;
  }

  process(sample) {
    this.y = this.a0 * sample + this.b0 * this.y;
    return this.y;
  }
}

export class FSKModulator {
  constructor(markFrequency, spaceFrequency, sampleRate) {
    this.markFrequency = markFrequency;
    this.spaceFrequency = spaceFrequency;
    this.sampleRate = sampleRate;
    this.theta = 0;
  }

  process(nrz) {
    if (nrz == 0) {
      return 0;
    }

    const frequency = nrz > 0 ? this.markFrequency : this.spaceFrequency;
    this.theta += Math.PI * 2 * frequency / this.sampleRate;
    if (this.theta > Math.PI * 2) {
      this.theta -= Math.PI * 2;
    }

    return Math.cos(this.theta);
  }
}

export class FSKDemodulator {
  constructor(markFrequency, spaceFrequency, bitRate, sampleRate) {
    const bw = Math.abs(markFrequency - spaceFrequency) / 2;
    this.markBpf = new BandpassFilter(markFrequency, bw, sampleRate);
    this.markLpf = new LowpassFilter(bitRate, sampleRate);
    this.spaceBpf = new BandpassFilter(spaceFrequency, bw, sampleRate);
    this.spaceLpf = new LowpassFilter(bitRate, sampleRate);
  }

  process(sample) {
    const mark = this.markLpf.process(Math.abs(this.markBpf.process(sample)));
    const space = this.spaceLpf.process(Math.abs(this.spaceBpf.process(sample)));
    return mark - space;
  }
}

export class SerialEncoder {
  constructor(numDataBits, samplesPerBit) {
    this.samplesPerBit = samplesPerBit;
    this.currentSendWord = 0; // Note, this includes the start and stop bits.
    this.numDataBits = numDataBits;
    this.bitCount = 0;
    this.sampleCount = 0;
    this.sending = false;
  }

  sendValue(val) {
    this.currentSendWord = (val << 1) | (1 << (this.numDataBits + 1)); // Add stop bit. start bit is zero
    this.sending = true;
    this.sampleCount = this.samplesPerBit;
    this.bitCount = 0;
  }

  isSending() {
    return this.sending;
  }

  process() {
    if (this.sending) {
      if (--this.sampleCount <= 0) {
        this.sampleCount = this.samplesPerBit;
        if (++this.bitCount == this.numDataBits + 2) {
          this.sending = false;
          return 0; // no signal
        } else {
          this.currentSendWord >>= 1;
        }
      }

      return (this.currentSendWord & 1) != 0 ? 1 : -1;
    }

    return 0; // no signal
  }
}

const THRESHOLD = 0.01;

export class SerialDecoder {
  constructor(numDataBits, samplesPerBit, callback) {
    this.state = 'wait_for_start';
    this.samplesPerBit = samplesPerBit;
    this.sampleCount = 0;
    this.bitCount = 0;
    this.currentWord = 0;
    this.numDataBits = numDataBits;
    this.callback = callback;
  }

  process(sample) {
    switch (this.state) {
      case 'wait_for_start':
        if (sample < -THRESHOLD) {
          this.state = 'process_data';
          this.sampleCount = this.samplesPerBit * 1.5;
          this.currentWord = 0;
          this.bitCount = 0;
        }

        break;

      case 'process_data':
        if (--this.sampleCount <= 0) {
          const bitValue = (sample > 0) ? 1 : 0;
          this.currentWord = (this.currentWord >> 1) | (bitValue << (this.numDataBits - 1));
          this.sampleCount = this.samplesPerBit;
          if (++this.bitCount == this.numDataBits) {
            this.callback(this.currentWord);
            this.state = 'wait_for_stop';
          }
        }

        break;

      case 'wait_for_stop':
        if (this.sampleCount > 0) {
          // Wait for center of stop bit.
          this.sampleCount--;
        } else {
          // Wait until we see stop polarity
          if (sample > THRESHOLD) {
            this.state = 'wait_for_start'
          }
        }

        break;
    }
  }
}
