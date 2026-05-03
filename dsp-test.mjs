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

function printBandpassFrequencyResponse() {
  let theta = 0;
  const sampleRate = 44100;
  const NUM_SAMPLES = 10000;

  let outputTable = [];

  for (let fc of [1400, 1800]) {
    const filter = new dsp.BandpassFilter(fc, 200, sampleRate);
    const responseCurve = [];
    for (let freq = 1; freq < 2500; freq += 10) {
      let output = 0;
      for (let i = 0; i < NUM_SAMPLES; i++) {
        theta += Math.PI * 2 * freq / sampleRate;
        if (theta > 2 * Math.PI) {
          theta -= 2 * Math.PI;
        }
        output += Math.abs(filter.process(Math.sin(theta))) / NUM_SAMPLES;
      }

      responseCurve.push([output]);
    }

    outputTable.push(responseCurve);
  }

  for (let i = 0; i < outputTable[0].length; i++) {
    let line = '' + (1 + i * 10) + ',';
    for (let j = 0; j < outputTable.length; j++) {
      if (j != 0) {
        line += ',';
      }

      line += outputTable[j][i];
    }

    console.log(line);
  }
}

function printLowpassFrequencyResponse() {
  let theta = 0;
  const sampleRate = 44100;
  const NUM_SAMPLES = 10000;
  const filter = new dsp.LowpassFilter(100, 44100);
  for (let freq = 1; freq < 1000; freq += 5) {
    let output = 0;
    for (let i = 0; i < NUM_SAMPLES; i++) {
      theta += Math.PI * 2 * freq / sampleRate;
      if (theta > 2 * Math.PI) {
        theta -= 2 * Math.PI;
      }

      output += Math.abs(filter.process(Math.sin(theta))) / NUM_SAMPLES;
    }

    console.log(freq + ',' + output);
  }
}

function printLowpassTimeResponse() {
  let theta = 0;
  const sampleRate = 44100;
  const NUM_SAMPLES = 400;
  const filter = new dsp.LowpassFilter(100, 44100);
  let index = 0;
  for (let symbolCount = 0; symbolCount < 10; symbolCount++) {
    let value = symbolCount % 2;
    for (let i = 0; i < NUM_SAMPLES; i++) {
      console.log(index++ + ',' + value + ',' + filter.process(value));
    }
  }
}

function printEyeDiagram() {
  const MARK_FREQ = 1400;
  const SPACE_FREQ = 1800;
  const sampleRate = 44100;
  const bitRate = 45;
  const bw = Math.abs(MARK_FREQ - SPACE_FREQ) / 2;
  const markBpf = new dsp.BandpassFilter(MARK_FREQ, bw, sampleRate);
  const markLpf = new dsp.LowpassFilter(bitRate, sampleRate);
  const spaceBpf = new dsp.BandpassFilter(SPACE_FREQ, bw, sampleRate);
  const spaceLpf = new dsp.LowpassFilter(bitRate, sampleRate);
  const NUM_SAMPLES = sampleRate / bitRate;

  let theta = 0;
  for (let symbolCount = 0; symbolCount < 4; symbolCount++) {
    let symFreq = symbolCount % 2 == 0 ? MARK_FREQ : SPACE_FREQ;
    for (let i = 0; i < NUM_SAMPLES; i++) {
      theta += Math.PI * 2 * symFreq / sampleRate;
      if (theta > 2 * Math.PI) {
        theta -= 2 * Math.PI;
      }

      const sample = Math.sin(theta);
      let markVal = markLpf.process(Math.abs(markBpf.process(sample)));
      let spaceVal = spaceLpf.process(Math.abs(spaceBpf.process(sample)));
      console.log(i + ',' + ((symbolCount % 2) ? -1 : 1) + ',' + markVal + ',' + spaceVal);
    }
  }
}

function printEncoding() {
  const encoder = new dsp.SerialEncoder(5, 100);
  let nextSend = 0;
  for (let i = 0; i < 5000; i++) {
    if (!encoder.isSending()) {
      encoder.sendValue(nextSend++);
    }
    console.log(i + ',' + encoder.process());
  }
}

function encodeDecode() {
  let receivedVal = null;
  const encoder = new dsp.SerialEncoder(5, 10);
  const decoder = new dsp.SerialDecoder(5, 10, (val) => { console.log('got', val); });
  encoder.sendValue(23);
  for (let i = 0; i < 5000; i++) {
    decoder.process(encoder.process());
  }

  encoder.sendValue(31);
  for (let i = 0; i < 5000; i++) {
    decoder.process(encoder.process());
  }
}


// 1. Uncomment the test
// 2. Run on the command line 'node dsp-test.mjs > output.csv'
// 3. Open with your favorite spreadsheet program.
//
//printBandpassFrequencyResponse();
//printLowpassFrequencyResponse();
//printLowpassTimeResponse();
//printEyeDiagram();
//printEncoding();
//encodeDecode();
