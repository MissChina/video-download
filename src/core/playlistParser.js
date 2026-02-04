'use strict';

const { URL } = require('url');
const crypto = require('crypto');

class PlaylistParser {
  constructor(options = {}) {
    this.options = {
      strict: false,
      baseUrl: null,
      ...options
    };
  }

  parse(content, refererUrl = this.options.baseUrl) {
    if (typeof content !== 'string') {
      throw new TypeError('M3U8 内容必须是字符串');
    }

    const lines = content.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    if (lines.length === 0 || lines[0] !== '#EXTM3U') {
      throw new Error('无效的 M3U8，缺少 #EXTM3U 头');
    }

    const playlist = {
      segments: [],
      sequence: 0,
      targetDuration: 0,
      version: 3,
      isIFrame: false,
      independentSegments: false,
      discontinuitySequence: 0
    };

    let currentKey = null;
    let currentMap = null;
    let currentDiscontinuity = false;
    let programDateTime = null;

    lines.forEach((line, index) => {
      if (!line.startsWith('#')) {
        // segment URI
        const segmentUrl = this.resolveUrl(line, refererUrl, playlist.mapBaseUrl || this.options.baseUrl);
        playlist.segments.push({
          url: segmentUrl,
          key: currentKey,
          map: currentMap,
          discontinuity: currentDiscontinuity,
          programDateTime,
          lineNumber: index + 1
        });
        currentDiscontinuity = false;
        programDateTime = null;
        return;
      }

      if (line.startsWith('#EXT-X-VERSION')) {
        playlist.version = parseInt(line.split(':')[1], 10) || playlist.version;
      } else if (line.startsWith('#EXT-X-TARGETDURATION')) {
        playlist.targetDuration = parseFloat(line.split(':')[1]) || playlist.targetDuration;
      } else if (line.startsWith('#EXT-X-MEDIA-SEQUENCE')) {
        playlist.sequence = parseInt(line.split(':')[1], 10) || playlist.sequence;
      } else if (line.startsWith('#EXT-X-KEY')) {
        currentKey = this.parseKey(line, refererUrl);
      } else if (line.startsWith('#EXT-X-MAP')) {
        currentMap = this.parseMap(line, refererUrl);
        playlist.mapBaseUrl = currentMap ? currentMap.url : playlist.mapBaseUrl;
      } else if (line.startsWith('#EXT-X-DISCONTINUITY')) {
        currentDiscontinuity = true;
      } else if (line.startsWith('#EXT-X-DISCONTINUITY-SEQUENCE')) {
        playlist.discontinuitySequence = parseInt(line.split(':')[1], 10) || playlist.discontinuitySequence;
      } else if (line.startsWith('#EXT-X-INDEPENDENT-SEGMENTS')) {
        playlist.independentSegments = true;
      } else if (line.startsWith('#EXT-X-PROGRAM-DATE-TIME')) {
        programDateTime = new Date(line.split(':')[1]);
      }
    });

    return playlist;
  }

  parseKey(line, refererUrl) {
    const attrs = this.parseAttributeList(line.split(':')[1]);
    if (!attrs.METHOD || attrs.METHOD === 'NONE') {
      return null;
    }

    const key = {
      method: attrs.METHOD,
      uri: attrs.URI ? this.resolveUrl(attrs.URI.replace(/"/g, ''), refererUrl) : null,
      iv: attrs.IV ? Buffer.from(attrs.IV.replace(/^0x/, ''), 'hex') : null
    };

    if (!key.uri) {
      throw new Error('EXT-X-KEY 缺少 URI');
    }

    if (!key.iv) {
      // HLS 默认 IV 为序列号
      key.generateIV = sequence => {
        const iv = Buffer.alloc(16, 0);
        iv.writeUInt32BE(sequence, 12);
        return iv;
      };
    }

    return key;
  }

  parseMap(line, refererUrl) {
    const attrs = this.parseAttributeList(line.split(':')[1]);
    if (!attrs.URI) {
      throw new Error('EXT-X-MAP 缺少 URI');
    }

    return {
      url: this.resolveUrl(attrs.URI.replace(/"/g, ''), refererUrl),
      byterange: attrs.BYTERANGE || null
    };
  }

  parseAttributeList(payload) {
    const attrs = {};
    payload.split(',').forEach(pair => {
      const [key, value] = pair.split('=');
      if (!key) return;
      attrs[key.trim()] = value?.trim();
    });
    return attrs;
  }

  resolveUrl(target, refererUrl, fallbackBase) {
    if (target.startsWith('http')) {
      return target;
    }

    const base = refererUrl || fallbackBase;
    if (!base) {
      return target;
    }

    try {
      const resolved = new URL(target, base);
      return resolved.toString();
    } catch (error) {
      if (this.options.strict) {
        throw error;
      }
      return target;
    }
  }
}

module.exports = PlaylistParser;
