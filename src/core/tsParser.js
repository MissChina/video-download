'use strict';

const SYNC_BYTE = 0x47;
const PAT_PID = 0x0000;

const STREAM_TYPES = {
  0x0f: 'aac',
  0x15: 'id3',
  0x1b: 'h264',
  0x24: 'h265'
};

class TsParser {
  constructor(callbacks = {}) {
    this.callbacks = callbacks;
    this.buffer = Buffer.alloc(0);
    this.tracks = new Map();
    this.pesAssemblers = new Map();
    this.patParsed = false;
    this.pmtPid = null;
  }

  push(data) {
    if (!Buffer.isBuffer(data)) {
      throw new TypeError('TSParser 仅接受 Buffer 数据');
    }

    this.buffer = Buffer.concat([this.buffer, data]);
    this.#consumePackets();
  }

  reset() {
    this.buffer = Buffer.alloc(0);
    this.tracks.clear();
    this.pesAssemblers.clear();
    this.patParsed = false;
    this.pmtPid = null;
  }

  #consumePackets() {
    const size = 188;
    let offset = 0;

    while (this.buffer.length - offset >= size) {
      if (this.buffer[offset] !== SYNC_BYTE) {
        offset += 1;
        continue;
      }

      const packet = this.buffer.slice(offset, offset + size);
      this.#handlePacket(packet);
      offset += size;
    }

    this.buffer = this.buffer.slice(offset);
  }

  #handlePacket(packet) {
    const payloadUnitStart = (packet[1] & 0x40) !== 0;
    const pid = ((packet[1] & 0x1f) << 8) | packet[2];
    const adaptationControl = (packet[3] & 0x30) >> 4;

    let pointer = 4;

    if (adaptationControl === 2 || adaptationControl === 0) {
      return;
    }

    if (adaptationControl === 3) {
      const length = packet[pointer];
      pointer += length + 1;
    }

    if (pointer >= packet.length) {
      return;
    }

    const payload = packet.slice(pointer);

    if (pid === PAT_PID) {
      this.#parsePat(payload, payloadUnitStart);
      return;
    }

    if (pid === this.pmtPid) {
      this.#parsePmt(payload, payloadUnitStart);
      return;
    }

    const track = this.tracks.get(pid);
    if (!track) {
      return;
    }

    this.#handlePes(pid, payload, payloadUnitStart, track);
  }

  #parsePat(payload, payloadUnitStart) {
    let pointer = 0;
    if (payloadUnitStart) {
      const pointerField = payload[0];
      pointer = 1 + pointerField;
    }

    while (pointer + 8 <= payload.length) {
      const tableId = payload[pointer];
      if (tableId !== 0x00) {
        return;
      }

      const sectionLength = ((payload[pointer + 1] & 0x0f) << 8) | payload[pointer + 2];
      const programInfoStart = pointer + 8;
      const programInfoEnd = programInfoStart + sectionLength - 5;

      for (let pos = programInfoStart; pos + 4 <= programInfoEnd; pos += 4) {
        const programNumber = (payload[pos] << 8) | payload[pos + 1];
        const programMapPid = ((payload[pos + 2] & 0x1f) << 8) | payload[pos + 3];
        if (programNumber !== 0) {
          this.pmtPid = programMapPid;
          this.callbacks.onPat?.({ pmtPid: this.pmtPid });
          this.patParsed = true;
          return;
        }
      }

      pointer += 3 + sectionLength;
    }
  }

  #parsePmt(payload, payloadUnitStart) {
    let pointer = 0;
    if (payloadUnitStart) {
      const pointerField = payload[0];
      pointer = 1 + pointerField;
    }

    const tableId = payload[pointer];
    if (tableId !== 0x02) {
      return;
    }

    const sectionLength = ((payload[pointer + 1] & 0x0f) << 8) | payload[pointer + 2];
    const programInfoLength = ((payload[pointer + 10] & 0x0f) << 8) | payload[pointer + 11];
    let pos = pointer + 12 + programInfoLength;
    const end = pointer + 3 + sectionLength - 4;

    while (pos + 5 <= end) {
      const streamType = payload[pos];
      const elementaryPid = ((payload[pos + 1] & 0x1f) << 8) | payload[pos + 2];
      const esInfoLength = ((payload[pos + 3] & 0x0f) << 8) | payload[pos + 4];

      const codec = STREAM_TYPES[streamType];
      if (codec && !this.tracks.has(elementaryPid)) {
        const track = { pid: elementaryPid, streamType, codec };
        this.tracks.set(elementaryPid, track);
        this.callbacks.onTrack?.(track);
      }

      pos += 5 + esInfoLength;
    }
  }

  #handlePes(pid, payload, payloadUnitStart, track) {
    let assembler = this.pesAssemblers.get(pid);
    if (!assembler) {
      assembler = { chunks: [], size: 0, pts: null, dts: null, expected: null };
      this.pesAssemblers.set(pid, assembler);
    }

    if (payloadUnitStart) {
      if (assembler.chunks.length) {
        this.#emitSample(pid, assembler, track);
      }
      assembler.chunks = [];
      assembler.size = 0;
      assembler.pts = null;
      assembler.dts = null;
      assembler.expected = null;
    }

    if (payload.length === 0) {
      return;
    }

    if (assembler.chunks.length === 0) {
      const header = this.#parsePesHeader(payload);
      if (!header) {
        return;
      }
      assembler.pts = header.pts;
      assembler.dts = header.dts;
      assembler.expected = header.length;
      assembler.chunks.push(header.payload);
      assembler.size = header.payload.length;
    } else {
      assembler.chunks.push(payload);
      assembler.size += payload.length;
    }

    if (assembler.expected && assembler.size >= assembler.expected) {
      this.#emitSample(pid, assembler, track);
      this.pesAssemblers.set(pid, { chunks: [], size: 0, pts: null, dts: null, expected: null });
    }
  }

  #parsePesHeader(payload) {
    if (payload.length < 6) {
      return null;
    }

    if (payload[0] !== 0x00 || payload[1] !== 0x00 || payload[2] !== 0x01) {
      return null;
    }

    const streamId = payload[3];
    const pesPacketLength = (payload[4] << 8) | payload[5];
    let headerLength = 6;
    let pts = null;
    let dts = null;

    if (streamId !== 0xbe && streamId !== 0xbf) {
      if (payload.length < 9) {
        return null;
      }
      const flags = payload[7];
      const headerDataLength = payload[8];
      headerLength = 9 + headerDataLength;

      if (flags & 0x80) {
        pts = this.#readTimestamp(payload.slice(9));
      }

      if (flags & 0x40) {
        dts = this.#readTimestamp(payload.slice(14));
      }
    }

    const data = payload.slice(headerLength);
    const expected = pesPacketLength ? pesPacketLength - (headerLength - 6) : null;

    return { payload: data, pts, dts, length: expected || data.length, streamId };
  }

  #emitSample(pid, assembler, track) {
    const data = Buffer.concat(assembler.chunks, assembler.size);
    const sample = {
      pid,
      codec: track.codec,
      streamType: track.streamType,
      pts: assembler.pts,
      dts: assembler.dts || assembler.pts,
      data
    };

    this.callbacks.onSample?.(sample);
  }

  #readTimestamp(buffer) {
    if (buffer.length < 5) {
      return null;
    }
    return (
      ((buffer[0] & 0x0e) << 29) |
      ((buffer[1] & 0xff) << 22) |
      ((buffer[2] & 0xfe) << 14) |
      ((buffer[3] & 0xff) << 7) |
      ((buffer[4] & 0xfe) >> 1)
    );
  }
}

module.exports = TsParser;
