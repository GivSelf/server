/**
 * TCP Modbus client for GivEnergy inverter.
 *
 * Manages the TCP connection, heartbeat auto-response, and request/response matching.
 */

import net from "node:net";
import { EventEmitter } from "node:events";
import { Framer, type Frame } from "./framer.js";
import { PayloadDecoder } from "./codec.js";
import { buildHeartbeatResponse, TransparentFC } from "./pdu.js";

const CONNECT_TIMEOUT = 10_000;
const RESPONSE_TIMEOUT = 5_000;
const HEARTBEAT_TIMEOUT = 180_000; // 3 minutes — inverter sends heartbeat on this interval

interface PendingRequest {
  resolve: (regs: number[]) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

interface QueuedRequest {
  frame: Buffer;
  resolve: (regs: number[]) => void;
  reject: (err: Error) => void;
}

export class ModbusClient extends EventEmitter {
  private socket: net.Socket | null = null;
  private framer = new Framer();
  private pending: PendingRequest | null = null;
  private heartbeatTimer: ReturnType<typeof setTimeout> | null = null;
  private serial = "";
  private queue: QueuedRequest[] = [];

  constructor(
    private readonly host: string,
    private readonly port: number,
  ) {
    super();
  }

  get isConnected(): boolean {
    return this.socket !== null && !this.socket.destroyed;
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      let connected = false;
      const socket = net.createConnection({ host: this.host, port: this.port });
      const timeout = setTimeout(() => {
        socket.destroy();
        reject(new Error(`Connection timeout to ${this.host}:${this.port}`));
      }, CONNECT_TIMEOUT);

      socket.on("connect", () => {
        connected = true;
        clearTimeout(timeout);
        this.socket = socket;
        this.resetHeartbeatTimer();
        resolve();
      });

      socket.on("data", (data) => {
        this.framer.push(data);
        for (const frame of this.framer.extract()) {
          this.handleFrame(frame);
        }
      });

      socket.on("error", (err) => {
        clearTimeout(timeout);
        if (!connected) {
          // Reject the connect() promise if we haven't connected yet
          reject(err);
        } else {
          this.emit("error", err);
        }
      });

      socket.on("close", () => {
        this.cleanup();
        if (connected) {
          this.emit("close");
        }
      });
    });
  }

  disconnect(): void {
    this.cleanup();
    this.socket?.destroy();
    this.socket = null;
  }

  /** Send a raw frame and wait for the transparent response register data. Queues if busy. */
  sendRequest(frame: Buffer): Promise<number[]> {
    return new Promise((resolve, reject) => {
      if (!this.socket || this.socket.destroyed) {
        return reject(new Error("Not connected"));
      }

      if (this.pending) {
        // Queue the request — it will be dispatched when the current one completes
        this.queue.push({ frame, resolve, reject });
        return;
      }

      this.dispatchRequest(frame, resolve, reject);
    });
  }

  private dispatchRequest(
    frame: Buffer,
    resolve: (regs: number[]) => void,
    reject: (err: Error) => void,
  ): void {
    const timer = setTimeout(() => {
      this.pending = null;
      reject(new Error("Response timeout"));
      this.processQueue();
    }, RESPONSE_TIMEOUT);

    this.pending = { resolve, reject, timer };
    this.socket!.write(frame);
  }

  private processQueue(): void {
    if (this.pending || this.queue.length === 0) return;
    const next = this.queue.shift()!;
    if (!this.socket || this.socket.destroyed) {
      next.reject(new Error("Not connected"));
      return;
    }
    this.dispatchRequest(next.frame, next.resolve, next.reject);
  }

  setSerial(serial: string): void {
    this.serial = serial;
  }

  private handleFrame(frame: Frame): void {
    if (frame.functionCode === 0x01) {
      // Heartbeat — respond immediately
      this.respondToHeartbeat(frame.payload);
      this.resetHeartbeatTimer();
      return;
    }

    if (frame.functionCode === 0x02) {
      this.handleTransparentResponse(frame.payload);
    }
  }

  private handleTransparentResponse(payload: Buffer): void {
    if (!this.pending) return;

    const { resolve, reject, timer } = this.pending;
    this.pending = null;
    clearTimeout(timer);

    try {
      const decoder = new PayloadDecoder(payload);
      const serial = decoder.readString(10); // data adapter serial
      if (!this.serial && serial) this.serial = serial;

      decoder.skip(8); // padding
      const slaveAddr = decoder.readUint8();
      const fc = decoder.readUint8();

      // Check for error response
      if (fc > 0x80) {
        const errorCode = decoder.readUint8();
        reject(new Error(`Modbus error: FC=0x${(fc & 0x7f).toString(16)} code=${errorCode}`));
        this.processQueue();
        return;
      }

      // Write response (FC 0x06) — just echoes register + value, no serial/count
      if (fc === 0x06) {
        // Write succeeded — resolve with empty array
        resolve([]);
        this.processQueue();
        return;
      }

      // Read response (FC 0x03, 0x04) — skip inverter serial (10 bytes) in response
      const inverterSerial = decoder.readString(10);
      const baseRegister = decoder.readUint16();
      const registerCount = decoder.readUint16();

      const regs: number[] = [];
      for (let i = 0; i < registerCount; i++) {
        regs.push(decoder.readUint16());
      }

      resolve(regs);
      this.processQueue();
    } catch (err) {
      reject(err as Error);
      this.processQueue();
    }
  }

  private respondToHeartbeat(payload: Buffer): void {
    if (!this.socket || this.socket.destroyed) return;
    const response = buildHeartbeatResponse(payload);
    this.socket.write(response);
  }

  private resetHeartbeatTimer(): void {
    if (this.heartbeatTimer) clearTimeout(this.heartbeatTimer);
    this.heartbeatTimer = setTimeout(() => {
      this.emit("heartbeat-timeout");
    }, HEARTBEAT_TIMEOUT);
  }

  private cleanup(): void {
    if (this.heartbeatTimer) {
      clearTimeout(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.pending) {
      clearTimeout(this.pending.timer);
      this.pending.reject(new Error("Connection closed"));
      this.pending = null;
    }
  }
}
