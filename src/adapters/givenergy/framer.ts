/**
 * GivEnergy frame detection and extraction.
 *
 * Frame format:
 *   [0-1]  Transaction ID: 0x5959
 *   [2-3]  Protocol ID:    0x0001
 *   [4-5]  Length:          big-endian uint16 (payload bytes from offset 6 onwards)
 *   [6]    Unit ID:         0x01
 *   [7]    Function ID:     0x01 (heartbeat) or 0x02 (transparent)
 *   [8..]  Payload data
 */

const HEADER_MARKER = Buffer.from([0x59, 0x59, 0x00, 0x01]);
const MIN_FRAME_SIZE = 18;
const MAX_LENGTH = 300;

export interface Frame {
  functionCode: number;
  unitId: number;
  payload: Buffer;
}

export class Framer {
  private buffer = Buffer.alloc(0);

  /** Append incoming TCP data. */
  push(data: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, data]);
  }

  /** Extract all complete frames from the buffer. */
  extract(): Frame[] {
    const frames: Frame[] = [];
    while (true) {
      const frame = this.extractOne();
      if (!frame) break;
      frames.push(frame);
    }
    return frames;
  }

  private extractOne(): Frame | null {
    // Find header marker
    const idx = this.buffer.indexOf(HEADER_MARKER);
    if (idx < 0) {
      // Keep last 3 bytes in case partial marker spans chunks
      if (this.buffer.length > 3) {
        this.buffer = this.buffer.subarray(this.buffer.length - 3);
      }
      return null;
    }

    // Discard leading garbage
    if (idx > 0) {
      this.buffer = this.buffer.subarray(idx);
    }

    if (this.buffer.length < MIN_FRAME_SIZE) return null;

    const length = this.buffer.readUInt16BE(4);
    if (length > MAX_LENGTH) {
      // Corrupt frame — skip this marker and try next
      this.buffer = this.buffer.subarray(4);
      return null;
    }

    const frameLen = 6 + length;
    if (this.buffer.length < frameLen) return null;

    const unitId = this.buffer.readUInt8(6);
    if (unitId !== 0x00 && unitId !== 0x01) {
      this.buffer = this.buffer.subarray(4);
      return null;
    }

    const functionCode = this.buffer.readUInt8(7);
    if (functionCode !== 0x01 && functionCode !== 0x02) {
      this.buffer = this.buffer.subarray(4);
      return null;
    }

    const payload = Buffer.from(this.buffer.subarray(8, frameLen));
    this.buffer = this.buffer.subarray(frameLen);

    return { functionCode, unitId, payload };
  }
}
