export interface ChunkResult {
  text: string;
  charStart: number;
  charEnd: number;
  chunkIndex: number;
}

export class TextSplitter {
  private chunkSize: number;
  private overlap: number;

  constructor(chunkSize = 512, overlap = 64) {
    this.chunkSize = chunkSize;
    this.overlap = overlap;
  }

  split(text: string): ChunkResult[] {
    if (!text || text.length === 0) return [];

    const paragraphs = this.splitByParagraphs(text);
    const chunks: ChunkResult[] = [];
    let chunkIndex = 0;

    for (const para of paragraphs) {
      if (para.text.length <= this.chunkSize) {
        if (para.text.trim().length > 0) {
          chunks.push({
            text: para.text,
            charStart: para.start,
            charEnd: para.end,
            chunkIndex: chunkIndex++,
          });
        }
        continue;
      }

      const sentences = this.splitBySentences(para.text, para.start);
      let currentChunk = '';
      let chunkStart = para.start;

      for (const sent of sentences) {
        const potentialChunk = currentChunk ? currentChunk + sent.text : sent.text;

        if (potentialChunk.length <= this.chunkSize) {
          currentChunk = potentialChunk;
        } else {
          if (currentChunk.trim().length > 0) {
            chunks.push({
              text: currentChunk,
              charStart: chunkStart,
              charEnd: chunkStart + currentChunk.length,
              chunkIndex: chunkIndex++,
            });

            if (this.overlap > 0) {
              const overlapChars = Math.min(this.overlap, currentChunk.length);
              currentChunk = currentChunk.slice(-overlapChars) + sent.text;
              chunkStart = chunkStart + currentChunk.length - sent.text.length - overlapChars;
            } else {
              currentChunk = sent.text;
              chunkStart = sent.start;
            }
          } else {
            const subChunks = this.splitBySize(sent.text, sent.start, chunkIndex);
            chunks.push(...subChunks.chunks);
            chunkIndex = subChunks.nextIndex;
            currentChunk = '';
          }
        }
      }

      if (currentChunk.trim().length > 0) {
        chunks.push({
          text: currentChunk,
          charStart: chunkStart,
          charEnd: chunkStart + currentChunk.length,
          chunkIndex: chunkIndex++,
        });
      }
    }

    return chunks;
  }

  private splitByParagraphs(text: string): ChunkResult[] {
    const result: ChunkResult[] = [];
    const regex = /\n\s*\n/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
      const para = text.slice(lastIndex, match.index).trim();
      if (para.length > 0) {
        result.push({
          text: para,
          charStart: lastIndex,
          charEnd: match.index,
          chunkIndex: 0,
        });
      }
      lastIndex = match.index + match[0].length;
    }

    const remaining = text.slice(lastIndex).trim();
    if (remaining.length > 0) {
      result.push({
        text: remaining,
        charStart: lastIndex,
        charEnd: text.length,
        chunkIndex: 0,
      });
    }

    return result;
  }

  private splitBySentences(text: string, offset: number): ChunkResult[] {
    const result: ChunkResult[] = [];
    const regex = /([。！？.!?])(?=\s|[\u4e00-\u9fa5]|[a-zA-Z]|$)/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
      const sentence = text.slice(lastIndex, match.index + 1);
      if (sentence.trim().length > 0) {
        result.push({
          text: sentence,
          charStart: offset + lastIndex,
          charEnd: offset + match.index + 1,
          chunkIndex: 0,
        });
      }
      lastIndex = match.index + 1;
    }

    const remaining = text.slice(lastIndex);
    if (remaining.trim().length > 0) {
      result.push({
        text: remaining,
        charStart: offset + lastIndex,
        charEnd: offset + text.length,
        chunkIndex: 0,
      });
    }

    return result;
  }

  private splitBySize(text: string, offset: number, startIndex: number): { chunks: ChunkResult[]; nextIndex: number } {
    const chunks: ChunkResult[] = [];
    let chunkIndex = startIndex;
    let pos = 0;

    while (pos < text.length) {
      const end = Math.min(pos + this.chunkSize, text.length);
      chunks.push({
        text: text.slice(pos, end),
        charStart: offset + pos,
        charEnd: offset + end,
        chunkIndex: chunkIndex++,
      });
      pos += this.chunkSize - this.overlap;
      if (pos >= text.length) break;
      if (end === text.length) break;
    }

    return { chunks, nextIndex: chunkIndex };
  }
}
