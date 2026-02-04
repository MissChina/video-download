'use strict';

const { EventEmitter } = require('events');

const MOVIE_TIMESCALE = 90000;
const AUDIO_SAMPLE_RATES = [96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350];

function box(type, ...payloads) {
  const size = 8 + payloads.reduce((sum, payload) => sum + payload.length, 0);
  const buffer = Buffer.alloc(size);
  buffer.writeUInt32BE(size >>> 0, 0);
  buffer.write(type, 4, 4, 'ascii');
  let offset = 8;
  payloads.forEach(payload => {
    payload.copy(buffer, offset);
    offset += payload.length;
  });
  return buffer;
}

function fullBox(type, version, flags, ...payloads) {
  const header = Buffer.alloc(4);
  header[0] = version & 0xff;
  header[1] = (flags >> 16) & 0xff;
  header[2] = (flags >> 8) & 0xff;
  header[3] = flags & 0xff;
  return box(type, header, ...payloads);
}

function writeUint32(value) {
  const buf = Buffer.alloc(4);
  buf.writeUInt32BE(value >>> 0, 0);
  return buf;
}

function writeUint16(value) {
  const buf = Buffer.alloc(2);
  buf.writeUInt16BE(value >>> 0, 0);
  return buf;
}

function writeFixed1616(value) {
  const buf = Buffer.alloc(4);
  buf.writeInt32BE(Math.round(value * 0x10000));
  return buf;
}

function writeFixed88(value) {
  const buf = Buffer.alloc(2);
  buf.writeUInt16BE(Math.round(value * 256));
  return buf;
}

function writeString(value, length) {
  const buf = Buffer.alloc(length);
  buf.write(value.slice(0, length), 0, 'ascii');
  return buf;
}

function removeEmulationBytes(nal) {
  const output = [];
  for (let i = 0; i < nal.length; i++) {
    if (i > 1 && nal[i] === 0x03 && nal[i - 1] === 0x00 && nal[i - 2] === 0x00) {
      continue;
    }
    output.push(nal[i]);
  }
  return Buffer.from(output);
}

class BitReader {
  constructor(buffer) {
    this.buffer = buffer;
    this.index = 0;
  }

  readBits(bits) {
    let value = 0;
    for (let i = 0; i < bits; i++) {
      const byteOffset = this.index >> 3;
      const bitOffset = 7 - (this.index & 7);
      value = (value << 1) | ((this.buffer[byteOffset] >> bitOffset) & 1);
      this.index += 1;
    }
    return value;
  }

  readUE() {
    let zeros = 0;
    while (this.readBits(1) === 0) {
      zeros += 1;
    }
    return (1 << zeros) - 1 + (zeros ? this.readBits(zeros) : 0);
  }

  readSE() {
    const value = this.readUE();
    return (value & 1) ? (value + 1) >> 1 : -(value >> 1);
  }
}

function parseSps(nal) {
  if (!nal || nal.length < 4) {
    return { width: 0, height: 0 };
  }
  const rbsp = removeEmulationBytes(nal.slice(1));
  const reader = new BitReader(rbsp);
  reader.readBits(8);
  reader.readBits(8);
  reader.readBits(8);
  reader.readUE();
  const chromaFormatIdc = reader.readUE();
  if (chromaFormatIdc === 3) {
    reader.readBits(1);
  }
  reader.readUE();
  reader.readUE();
  reader.readBits(1);
  const picOrderCntType = reader.readUE();
  if (picOrderCntType === 0) {
    reader.readUE();
  } else if (picOrderCntType === 1) {
    reader.readBits(1);
    reader.readSE();
    reader.readSE();
    const cycles = reader.readUE();
    for (let i = 0; i < cycles; i++) {
      reader.readSE();
    }
  }
  reader.readUE();
  reader.readBits(1);
  const widthUnits = reader.readUE();
  const heightUnits = reader.readUE();
  const frameMbsOnly = reader.readBits(1);
  if (!frameMbsOnly) {
    reader.readBits(1);
  }
  reader.readBits(1);
  let cropLeft = 0;
  let cropRight = 0;
  let cropTop = 0;
  let cropBottom = 0;
  const cropping = reader.readBits(1);
  if (cropping) {
    cropLeft = reader.readUE();
    cropRight = reader.readUE();
    cropTop = reader.readUE();
    cropBottom = reader.readUE();
  }
  const width = ((widthUnits + 1) * 16) - (cropLeft + cropRight) * 2;
  const height = ((2 - frameMbsOnly) * (heightUnits + 1) * 16) - (cropTop + cropBottom) * 2;
  return { width, height };
}

function parseAdts(frame) {
  if (!frame || frame.length < 7) {
    return null;
  }
  const protectionAbsent = frame[1] & 0x01;
  const profile = ((frame[2] & 0xc0) >> 6) + 1;
  const samplingIndex = (frame[2] & 0x3c) >> 2;
  const sampleRate = AUDIO_SAMPLE_RATES[samplingIndex] || 48000;
  const channelConfig = ((frame[2] & 0x01) << 2) | ((frame[3] & 0xc0) >> 6);
  const frameLength = ((frame[3] & 0x03) << 11) | (frame[4] << 3) | ((frame[5] & 0xe0) >> 5);
  const headerLength = protectionAbsent ? 7 : 9;
  if (frameLength > frame.length) {
    return null;
  }
  const payload = frame.slice(headerLength, frameLength);
  const asc = Buffer.alloc(2);
  asc[0] = (profile << 3) | (samplingIndex >> 1);
  asc[1] = ((samplingIndex & 1) << 7) | (channelConfig << 3);
  return {
    payload,
    sampleRate,
    channelConfig,
    asc,
    samplesPerFrame: 1024
  };
}

function nalUnitsFromAnnexB(data) {
  const units = [];
  let offset = 0;
  while (offset < data.length) {
    let start = offset;
    while (start < data.length && data[start] === 0x00) {
      start += 1;
    }
    if (start >= data.length || data[start] !== 0x01) {
      offset += 1;
      continue;
    }
    let nalStart = start + 1;
    let nalEnd = nalStart;
    while (nalEnd < data.length) {
      if (nalEnd + 2 < data.length && data[nalEnd] === 0x00 && data[nalEnd + 1] === 0x00 && data[nalEnd + 2] === 0x01) {
        break;
      }
      if (nalEnd + 3 < data.length && data[nalEnd] === 0x00 && data[nalEnd + 1] === 0x00 && data[nalEnd + 2] === 0x00 && data[nalEnd + 3] === 0x01) {
        break;
      }
      nalEnd += 1;
    }
    units.push(data.slice(nalStart, nalEnd));
    offset = nalEnd;
  }
  return units;
}

function encodeNalLength(nal) {
  const buf = Buffer.alloc(4 + nal.length);
  buf.writeUInt32BE(nal.length >>> 0, 0);
  nal.copy(buf, 4);
  return buf;
}

class Mp4Muxer extends EventEmitter {
  constructor(options = {}) {
    super();
    this.timescale = options.timescale || MOVIE_TIMESCALE;
    this.tracks = new Map();
  }

  addTrack(pid, info) {
    if (this.tracks.has(pid)) {
      return this.tracks.get(pid);
    }
    const track = {
      id: this.tracks.size + 1,
      pid,
      codec: info.codec,
      timescale: info.codec === 'aac' ? (info.sampleRate || 48000) : (info.timescale || 90000),
      samples: [],
      duration: 0,
      sps: info.sps || null,
      pps: info.pps || null,
      width: info.width || 1280,
      height: info.height || 720,
      channelCount: info.channelCount || 2,
      sampleRate: info.sampleRate || 48000,
      audioConfig: info.audioConfig || null,
      language: info.language || 'und'
    };
    this.tracks.set(pid, track);
    return track;
  }

  pushSample(pid, sample) {
    const track = this.tracks.get(pid);
    if (!track) {
      return;
    }
    if (track.codec === 'h264') {
      this.#handleH264(track, sample);
    } else if (track.codec === 'aac') {
      this.#handleAac(track, sample);
    }
  }

  flush() {
    if (this.tracks.size === 0) {
      throw new Error('没有可封装的轨道');
    }
    const tracks = Array.from(this.tracks.values());
    tracks.forEach(track => {
      track.samples.sort((a, b) => a.dts - b.dts);
      this.#calculateDurations(track);
    });
    const movieDuration = tracks.reduce((max, track) => {
      const scaled = Math.round(track.duration * (this.timescale / track.timescale));
      return Math.max(max, scaled);
    }, 0);
    const ftyp = this.#buildFtyp();
    const moovProbe = this.#buildMoov(tracks, movieDuration, Array(tracks.length).fill(0));
    const { mdat, chunkOffsets } = this.#buildMdat(tracks, ftyp.length + moovProbe.length);
    const moov = this.#buildMoov(tracks, movieDuration, chunkOffsets);
    this.emit('data', Buffer.concat([ftyp, moov, mdat]));
  }

  #handleH264(track, sample) {
    const units = nalUnitsFromAnnexB(sample.data);
    if (!units.length) {
      return;
    }
    const payloads = [];
    let isKeyframe = false;
    units.forEach(nal => {
      const type = nal[0] & 0x1f;
      if (type === 7) {
        track.sps = Buffer.from(nal);
        const parsed = parseSps(nal);
        track.width = parsed.width || track.width;
        track.height = parsed.height || track.height;
      } else if (type === 8) {
        track.pps = Buffer.from(nal);
      } else if (type === 5) {
        isKeyframe = true;
      }
      payloads.push(encodeNalLength(nal));
    });
    const data = Buffer.concat(payloads);
    const pts = sample.pts ?? sample.dts;
    const dts = sample.dts ?? sample.pts;
    const entry = {
      data,
      size: data.length,
      pts,
      dts,
      duration: 0,
      cts: (pts ?? dts) - (dts ?? pts),
      keyframe: isKeyframe
    };
    track.samples.push(entry);
  }

  #handleAac(track, sample) {
    const parsed = parseAdts(sample.data);
    if (!parsed) {
      return;
    }
    track.sampleRate = parsed.sampleRate;
    track.timescale = parsed.sampleRate;
    track.channelCount = parsed.channelConfig || 2;
    track.audioConfig = parsed.asc;
    const pts = sample.pts ?? sample.dts;
    const entry = {
      data: parsed.payload,
      size: parsed.payload.length,
      pts,
      dts: pts,
      duration: parsed.samplesPerFrame,
      cts: 0,
      keyframe: true
    };
    track.samples.push(entry);
  }

  #calculateDurations(track) {
    if (track.codec === 'aac') {
      track.duration = track.samples.reduce((sum, sample) => sum + sample.duration, 0);
      return;
    }
    for (let i = 0; i < track.samples.length; i++) {
      const current = track.samples[i];
      const next = track.samples[i + 1];
      if (next) {
        const delta = Math.max(1, next.dts - current.dts);
        current.duration = delta;
      } else {
        current.duration = track.samples.length > 1 ? track.samples[i - 1].duration : Math.round(track.timescale / 30);
      }
    }
    track.duration = track.samples.reduce((sum, sample) => sum + sample.duration, 0);
  }

  #buildFtyp() {
    const major = writeString('isom', 4);
    const minor = writeUint32(512);
    const compat = Buffer.concat([writeString('isom', 4), writeString('iso2', 4), writeString('avc1', 4), writeString('mp41', 4)]);
    return box('ftyp', major, minor, compat);
  }

  #buildMoov(tracks, duration, offsets) {
    const mvhd = this.#buildMvhd(duration);
    const traks = tracks.map((track, index) => this.#buildTrak(track, offsets[index]));
    return box('moov', mvhd, ...traks);
  }

  #buildMvhd(duration) {
    const creation = writeUint32(0);
    const modification = writeUint32(0);
    const timescale = writeUint32(this.timescale);
    const dur = writeUint32(duration);
    const rate = writeFixed1616(1);
    const volume = Buffer.concat([writeFixed88(1), Buffer.alloc(2)]);
    const reserved = Buffer.alloc(10);
    const matrix = Buffer.concat([
      writeFixed1616(1), Buffer.alloc(4), Buffer.alloc(4),
      Buffer.alloc(4), writeFixed1616(1), Buffer.alloc(4),
      Buffer.alloc(4), Buffer.alloc(4), writeFixed1616(1)
    ]);
    const preDefined = Buffer.alloc(24);
    const nextTrackId = writeUint32(this.tracks.size + 1);
    return fullBox('mvhd', 0, 0, Buffer.concat([creation, modification, timescale, dur, rate, volume, reserved, matrix, preDefined, nextTrackId]));
  }

  #buildTrak(track, offset) {
    const tkhd = this.#buildTkhd(track);
    const mdia = this.#buildMdia(track, offset);
    return box('trak', tkhd, mdia);
  }

  #buildTkhd(track) {
    const creation = writeUint32(0);
    const modification = writeUint32(0);
    const trackId = writeUint32(track.id);
    const reserved = writeUint32(0);
    const duration = writeUint32(Math.round(track.duration * (this.timescale / track.timescale)));
    const reserved2 = Buffer.alloc(8);
    const layer = Buffer.alloc(2);
    const alternate = Buffer.alloc(2);
    const volume = track.codec === 'aac' ? writeFixed88(1) : Buffer.alloc(2);
    const matrix = Buffer.concat([
      writeFixed1616(1), Buffer.alloc(4), Buffer.alloc(4),
      Buffer.alloc(4), writeFixed1616(1), Buffer.alloc(4),
      Buffer.alloc(4), Buffer.alloc(4), writeFixed1616(1)
    ]);
    const width = Buffer.alloc(4);
    const height = Buffer.alloc(4);
    width.writeUInt32BE(track.codec === 'h264' ? track.width << 16 : 0);
    height.writeUInt32BE(track.codec === 'h264' ? track.height << 16 : 0);
    return fullBox('tkhd', 0, track.codec === 'aac' ? 0x000005 : 0x000007, Buffer.concat([creation, modification, trackId, reserved, duration, reserved2, layer, alternate, volume, Buffer.alloc(2), matrix, width, height]));
  }

  #buildMdia(track, offset) {
    const mdhd = this.#buildMdhd(track);
    const hdlr = this.#buildHdlr(track);
    const minf = this.#buildMinf(track, offset);
    return box('mdia', mdhd, hdlr, minf);
  }

  #buildMdhd(track) {
    const creation = writeUint32(0);
    const modification = writeUint32(0);
    const timescale = writeUint32(track.timescale);
    const duration = writeUint32(track.duration);
    const language = Buffer.alloc(2);
    language.writeUInt16BE(0x55c4);
    const preDefined = Buffer.alloc(2);
    return fullBox('mdhd', 0, 0, Buffer.concat([creation, modification, timescale, duration, language, preDefined]));
  }

  #buildHdlr(track) {
    const handler = writeString(track.codec === 'aac' ? 'soun' : 'vide', 4);
    const reserved = Buffer.alloc(12);
    const name = Buffer.from(track.codec === 'aac' ? 'AudioHandler\0' : 'VideoHandler\0', 'ascii');
    return fullBox('hdlr', 0, 0, Buffer.concat([Buffer.alloc(4), handler, reserved, name]));
  }

  #buildMinf(track, offset) {
    const mediaHeader = track.codec === 'aac' ? this.#buildSmhd() : this.#buildVmhd();
    const dinf = this.#buildDinf();
    const stbl = this.#buildStbl(track, offset);
    return box('minf', mediaHeader, dinf, stbl);
  }

  #buildVmhd() {
    return fullBox('vmhd', 0, 0x000001, Buffer.concat([Buffer.alloc(2), Buffer.alloc(6)]));
  }

  #buildSmhd() {
    return fullBox('smhd', 0, 0, Buffer.alloc(4));
  }

  #buildDinf() {
    const url = fullBox('url ', 0, 0x000001, Buffer.alloc(0));
    const dref = fullBox('dref', 0, 0, Buffer.concat([writeUint32(1), url]));
    return box('dinf', dref);
  }

  #buildStbl(track, offset) {
    const stsd = this.#buildStsd(track);
    const stts = this.#buildStts(track);
    const ctts = this.#buildCtts(track);
    const stsc = this.#buildStsc(track);
    const stsz = this.#buildStsz(track);
    const stco = this.#buildStco(offset);
    const stss = track.codec === 'h264' ? this.#buildStss(track) : null;
    const parts = [stsd, stts];
    if (stss) parts.push(stss);
    if (ctts) parts.push(ctts);
    parts.push(stsc, stsz, stco);
    return box('stbl', ...parts);
  }

  #buildStsd(track) {
    if (track.codec === 'h264') {
      if (!track.sps || !track.pps) {
        throw new Error('缺少 SPS/PPS');
      }
      const avcc = this.#buildAvcc(track);
      const buffer = Buffer.concat([
        Buffer.alloc(6), writeUint16(1), Buffer.alloc(16), writeUint16(track.width), writeUint16(track.height),
        writeFixed1616(1), writeFixed1616(1), Buffer.alloc(4), writeUint16(1), Buffer.alloc(32), writeUint16(0x18), Buffer.alloc(2),
        box('avcC', avcc), box('pasp', Buffer.concat([writeUint32(1), writeUint32(1)]))
      ]);
      return fullBox('stsd', 0, 0, Buffer.concat([writeUint32(1), box('avc1', buffer)]));
    }
    const esds = this.#buildEsds(track);
    const buffer = Buffer.concat([
      Buffer.alloc(6), writeUint16(1), Buffer.alloc(6), writeUint16(track.channelCount), writeUint16(16), Buffer.alloc(2), writeUint32(track.sampleRate << 16),
      box('esds', esds)
    ]);
    return fullBox('stsd', 0, 0, Buffer.concat([writeUint32(1), box('mp4a', buffer)]));
  }

  #buildAvcc(track) {
    const sps = track.sps;
    const pps = track.pps;
    const buffer = Buffer.alloc(11 + sps.length + pps.length);
    let offset = 0;
    buffer[offset++] = 1;
    buffer[offset++] = sps[1];
    buffer[offset++] = sps[2];
    buffer[offset++] = sps[3];
    buffer[offset++] = 0xff;
    buffer[offset++] = 0xe1;
    buffer.writeUInt16BE(sps.length, offset);
    offset += 2;
    sps.copy(buffer, offset);
    offset += sps.length;
    buffer[offset++] = 1;
    buffer.writeUInt16BE(pps.length, offset);
    offset += 2;
    pps.copy(buffer, offset);
    return buffer;
  }

  #buildEsds(track) {
    const descriptor = Buffer.concat([
      Buffer.from([0x03, 0x19, 0x00, 0x00, 0x00]),
      Buffer.from([0x04, 0x11, 0x40, 0x15, 0x00, 0x18, 0x00, 0x00, 0x00, 0x00, 0xc0, 0x00]),
      Buffer.from([0x05, track.audioConfig.length]),
      track.audioConfig,
      Buffer.from([0x06, 0x01, 0x02])
    ]);
    return fullBox('esds', 0, 0, descriptor);
  }

  #buildStts(track) {
    const entries = [];
    let current = null;
    let run = 0;
    track.samples.forEach(sample => {
      const delta = this.#scale(sample.duration, track);
      if (current === null) {
        current = delta;
        run = 1;
      } else if (delta === current) {
        run += 1;
      } else {
        entries.push({ count: run, delta: current });
        current = delta;
        run = 1;
      }
    });
    if (run && current !== null) {
      entries.push({ count: run, delta: current });
    }
    const content = Buffer.alloc(4 + entries.length * 8);
    content.writeUInt32BE(entries.length, 0);
    entries.forEach((entry, index) => {
      content.writeUInt32BE(entry.count, 4 + index * 8);
      content.writeUInt32BE(entry.delta, 8 + index * 8);
    });
    return fullBox('stts', 0, 0, content);
  }

  #buildCtts(track) {
    if (track.codec !== 'h264') {
      return null;
    }
    const entries = [];
    let current = null;
    let run = 0;
    track.samples.forEach(sample => {
      const offset = this.#scale(sample.cts, track);
      if (offset === 0) {
        return;
      }
      if (current === null) {
        current = offset;
        run = 1;
      } else if (offset === current) {
        run += 1;
      } else {
        entries.push({ count: run, offset: current });
        current = offset;
        run = 1;
      }
    });
    if (run && current !== null) {
      entries.push({ count: run, offset: current });
    }
    if (!entries.length) {
      return null;
    }
    const content = Buffer.alloc(4 + entries.length * 8);
    content.writeUInt32BE(entries.length, 0);
    entries.forEach((entry, index) => {
      content.writeUInt32BE(entry.count, 4 + index * 8);
      content.writeUInt32BE(entry.offset, 8 + index * 8);
    });
    return fullBox('ctts', 0, 0, content);
  }

  #buildStsc(track) {
    const content = Buffer.alloc(4 + 12);
    content.writeUInt32BE(1, 0);
    content.writeUInt32BE(1, 4);
    content.writeUInt32BE(track.samples.length, 8);
    content.writeUInt32BE(1, 12);
    return fullBox('stsc', 0, 0, content);
  }

  #buildStsz(track) {
    const payload = Buffer.alloc(8 + track.samples.length * 4);
    payload.writeUInt32BE(0, 0);
    payload.writeUInt32BE(track.samples.length, 4);
    track.samples.forEach((sample, index) => {
      payload.writeUInt32BE(sample.size, 8 + index * 4);
    });
    return fullBox('stsz', 0, 0, payload);
  }

  #buildStco(offset) {
    const content = Buffer.alloc(4 + 4);
    content.writeUInt32BE(1, 0);
    content.writeUInt32BE(offset >>> 0, 4);
    return fullBox('stco', 0, 0, content);
  }

  #buildStss(track) {
    const keyframes = track.samples
      .map((sample, index) => ({ index: index + 1, keyframe: sample.keyframe }))
      .filter(item => item.keyframe)
      .map(item => item.index);
    if (!keyframes.length) {
      return null;
    }
    const content = Buffer.alloc(4 + keyframes.length * 4);
    content.writeUInt32BE(keyframes.length, 0);
    keyframes.forEach((value, index) => {
      content.writeUInt32BE(value, 4 + index * 4);
    });
    return fullBox('stss', 0, 0, content);
  }

  #buildMdat(tracks, headerSize) {
    let cumulative = 8;
    const payloads = [];
    const offsets = [];
    tracks.forEach((track, index) => {
      const startOffset = headerSize + cumulative;
      offsets[index] = startOffset;
      track.samples.forEach(sample => {
        payloads.push(sample.data);
        cumulative += sample.data.length;
      });
    });
    const header = Buffer.alloc(8);
    header.writeUInt32BE(cumulative, 0);
    header.write('mdat', 4, 4, 'ascii');
    return { mdat: Buffer.concat([header, ...payloads]), chunkOffsets: offsets };
  }

  #scale(value, track) {
    if (!value) {
      return 0;
    }
    return Math.max(0, Math.round(value * (track.timescale / 90000)));
  }
}

module.exports = Mp4Muxer;
