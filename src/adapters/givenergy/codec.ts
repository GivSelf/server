/** Modbus CRC-16 (polynomial 0xA001, init 0xFFFF). */
export function crc16modbus(data: Buffer): number {
  let crc = 0xffff;
  for (const byte of data) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) {
      if (crc & 1) {
        crc = (crc >> 1) ^ 0xa001;
      } else {
        crc >>= 1;
      }
    }
  }
  return crc;
}

export class PayloadDecoder {
  private offset = 0;

  constructor(private readonly buf: Buffer) {}

  get remaining(): number {
    return this.buf.length - this.offset;
  }

  get isComplete(): boolean {
    return this.offset === this.buf.length;
  }

  readUint8(): number {
    const val = this.buf.readUInt8(this.offset);
    this.offset += 1;
    return val;
  }

  readUint16(): number {
    const val = this.buf.readUInt16BE(this.offset);
    this.offset += 2;
    return val;
  }

  readInt16(): number {
    const val = this.buf.readInt16BE(this.offset);
    this.offset += 2;
    return val;
  }

  readUint32(): number {
    const val = this.buf.readUInt32BE(this.offset);
    this.offset += 4;
    return val;
  }

  readUint64(): bigint {
    const val = this.buf.readBigUInt64BE(this.offset);
    this.offset += 8;
    return val;
  }

  readString(length: number): string {
    const val = this.buf.toString("latin1", this.offset, this.offset + length);
    this.offset += length;
    return val.replace(/\*/g, ""); // strip padding
  }

  readBuffer(length: number): Buffer {
    const val = this.buf.subarray(this.offset, this.offset + length);
    this.offset += length;
    return val;
  }

  skip(bytes: number): void {
    this.offset += bytes;
  }
}

export class PayloadEncoder {
  private parts: Buffer[] = [];
  private _length = 0;

  get length(): number {
    return this._length;
  }

  addUint8(value: number): this {
    const buf = Buffer.alloc(1);
    buf.writeUInt8(value);
    this.parts.push(buf);
    this._length += 1;
    return this;
  }

  addUint16(value: number): this {
    const buf = Buffer.alloc(2);
    buf.writeUInt16BE(value);
    this.parts.push(buf);
    this._length += 2;
    return this;
  }

  addUint32(value: number): this {
    const buf = Buffer.alloc(4);
    buf.writeUInt32BE(value);
    this.parts.push(buf);
    this._length += 4;
    return this;
  }

  addUint64(value: bigint): this {
    const buf = Buffer.alloc(8);
    buf.writeBigUInt64BE(value);
    this.parts.push(buf);
    this._length += 8;
    return this;
  }

  addString(value: string, length: number): this {
    const padded = value.slice(-length).padStart(length, "*");
    const buf = Buffer.alloc(length, 0);
    buf.write(padded, 0, length, "latin1");
    this.parts.push(buf);
    this._length += length;
    return this;
  }

  toBuffer(): Buffer {
    return Buffer.concat(this.parts);
  }

  get crc(): number {
    return crc16modbus(this.toBuffer());
  }
}
