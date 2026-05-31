class LogCompressor {
  static COMPRESSION_THRESHOLD = 2048;
  static _stats = {
    totalCompressed: 0,
    totalDecompressed: 0,
    totalOriginalBytes: 0,
    totalCompressedBytes: 0,
    totalSavingsBytes: 0,
    algorithms: { lz77: 0, dict: 0, none: 0 },
    errors: 0,
  };

  static compress(data) {
    const jsonStr = typeof data === 'string' ? data : JSON.stringify(data);

    if (jsonStr.length < LogCompressor.COMPRESSION_THRESHOLD) {
      LogCompressor._stats.totalCompressed++;
      LogCompressor._stats.algorithms.none++;
      LogCompressor._stats.totalOriginalBytes += jsonStr.length;
      LogCompressor._stats.totalCompressedBytes += jsonStr.length;
      return {
        compressed: false,
        algorithm: 'none',
        originalSize: jsonStr.length,
        compressedSize: jsonStr.length,
        ratio: 1,
        payload: jsonStr,
      };
    }

    let bestResult = null;
    let bestRatio = Infinity;

    const lzResult = LogCompressor._lz77Compress(jsonStr);
    const lzRatio = lzResult.payload.length / jsonStr.length;
    if (lzRatio < bestRatio) {
      bestRatio = lzRatio;
      bestResult = {
        compressed: true,
        algorithm: 'lz77',
        originalSize: jsonStr.length,
        compressedSize: lzResult.payload.length,
        ratio: lzRatio,
        payload: lzResult.payload,
        dict: lzResult.dict,
      };
    }

    const dictResult = LogCompressor._dictCompress(jsonStr);
    const dictRatio = dictResult.payload.length / jsonStr.length;
    if (dictRatio < bestRatio) {
      bestRatio = dictRatio;
      bestResult = {
        compressed: true,
        algorithm: 'dict',
        originalSize: jsonStr.length,
        compressedSize: dictResult.payload.length,
        ratio: dictRatio,
        payload: dictResult.payload,
        dict: dictResult.dict,
      };
    }

    if (bestRatio >= 0.95) {
      LogCompressor._stats.totalCompressed++;
      LogCompressor._stats.algorithms.none++;
      LogCompressor._stats.totalOriginalBytes += jsonStr.length;
      LogCompressor._stats.totalCompressedBytes += jsonStr.length;
      return {
        compressed: false,
        algorithm: 'none',
        originalSize: jsonStr.length,
        compressedSize: jsonStr.length,
        ratio: 1,
        payload: jsonStr,
      };
    }

    LogCompressor._stats.totalCompressed++;
    LogCompressor._stats.algorithms[bestResult.algorithm]++;
    LogCompressor._stats.totalOriginalBytes += bestResult.originalSize;
    LogCompressor._stats.totalCompressedBytes += bestResult.compressedSize;
    LogCompressor._stats.totalSavingsBytes += (bestResult.originalSize - bestResult.compressedSize);
    return bestResult;
  }

  static decompress(compressedObj) {
    LogCompressor._stats.totalDecompressed++;
    try {
      if (!compressedObj.compressed) {
        return compressedObj.payload;
      }

      if (compressedObj.algorithm === 'lz77') {
        return LogCompressor._lz77Decompress(compressedObj.payload, compressedObj.dict);
      } else if (compressedObj.algorithm === 'dict') {
        return LogCompressor._dictDecompress(compressedObj.payload, compressedObj.dict);
      }

      return compressedObj.payload;
    } catch (e) {
      LogCompressor._stats.errors++;
      throw e;
    }
  }

  static getStats() {
    const original = LogCompressor._stats.totalOriginalBytes || 1;
    return {
      ...LogCompressor._stats,
      averageRatio: LogCompressor._stats.totalCompressedBytes / original,
      savingsPercent: (1 - LogCompressor._stats.totalCompressedBytes / original) * 100,
    };
  }

  static _lz77Compress(str, windowSize = 255, lookaheadSize = 15) {
    const tokens = [];
    const dict = new Map();
    let dictIdx = 0;
    let i = 0;

    while (i < str.length) {
      let bestLen = 0;
      let bestOffset = 0;

      const windowStart = Math.max(0, i - windowSize);
      const lookaheadEnd = Math.min(i + lookaheadSize, str.length);
      const lookahead = str.substring(i, lookaheadEnd);

      for (let j = windowStart; j < i; j++) {
        let len = 0;
        while (i + len < str.length && str[j + len] === str[i + len] && len < lookaheadSize) {
          len++;
        }
        if (len > bestLen) {
          bestLen = len;
          bestOffset = i - j;
          if (len >= lookaheadSize) break;
        }
      }

      if (bestLen >= 3) {
        tokens.push(`[${bestOffset},${bestLen}]`);
        i += bestLen;
      } else {
        const char = str[i];
        if (!dict.has(char)) {
          dict.set(char, dictIdx);
          dictIdx++;
        }
        tokens.push(char);
        i++;
      }
    }

    const payload = tokens.join('');
    return {
      payload,
      dict: Array.from(dict.keys()).join(''),
    };
  }

  static _lz77Decompress(payload, dictStr) {
    const dict = dictStr.split('');
    let result = '';
    let i = 0;

    while (i < payload.length) {
      if (payload[i] === '[') {
        const end = payload.indexOf(']', i);
        if (end === -1) {
          result += payload[i];
          i++;
          continue;
        }
        const [offset, len] = payload.substring(i + 1, end).split(',').map(Number);
        const start = result.length - offset;
        for (let k = 0; k < len; k++) {
          result += result[start + k];
        }
        i = end + 1;
      } else {
        result += payload[i];
        i++;
      }
    }

    return result;
  }

  static _dictCompress(str) {
    const commonKeys = [
      'id', 'traceId', 'spanId', 'parentSpanId', 'timestamp', 'receivedAt',
      'source', 'terminalId', 'terminalType', 'category', 'action', 'level',
      'levelValue', 'detail', 'tags', 'schemaVersion', 'log_batch',
      'browser', 'terminal', 'user_action', 'hardware', 'sensor',
      'error', 'info', 'warn', 'debug', 'fatal', 'network', 'console',
      'system', 'alert', 'firmware', 'lifecycle', 'iot', 'embedded', 'mobile'
    ];

    const freqMap = new Map();
    commonKeys.forEach(k => freqMap.set(k, 0));

    commonKeys.forEach(word => {
      const regex = new RegExp(`"${word}"`, 'g');
      const matches = str.match(regex);
      if (matches) freqMap.set(word, freqMap.get(word) + matches.length);
    });

    const sortedWords = Array.from(freqMap.entries())
      .filter(([, count]) => count > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 30)
      .map(([word]) => word);

    const dict = sortedWords;
    let compressed = str;
    dict.forEach((word, idx) => {
      const code = String.fromCharCode(0x80 + idx);
      const regex = new RegExp(`"${word}"`, 'g');
      compressed = compressed.replace(regex, code);
    });

    return {
      payload: compressed,
      dict: dict.join('|'),
    };
  }

  static _dictDecompress(payload, dictStr) {
    const dict = dictStr.split('|');
    let decompressed = payload;
    for (let i = dict.length - 1; i >= 0; i--) {
      const code = String.fromCharCode(0x80 + i);
      const regex = new RegExp(code, 'g');
      decompressed = decompressed.replace(regex, `"${dict[i]}"`);
    }
    return decompressed;
  }

  static estimateCompressionRatio(jsonStr) {
    const dict = new Map();
    let i = 0;
    while (i < jsonStr.length) {
      if (jsonStr[i] === '"') {
        let j = i + 1;
        while (j < jsonStr.length && jsonStr[j] !== '"') j++;
        if (j < jsonStr.length) {
          const token = jsonStr.substring(i + 1, j);
          dict.set(token, (dict.get(token) || 0) + 1);
          i = j + 1;
        }
      }
      i++;
    }
    const uniqueTokens = dict.size;
    const totalTokens = Array.from(dict.values()).reduce((a, b) => a + b, 0);
    return 1 - (uniqueTokens / (totalTokens || 1));
  }
}

module.exports = LogCompressor;
