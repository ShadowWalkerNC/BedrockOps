/**
 * Minimal little-endian NBT codec for Bedrock level.dat experiment patches.
 * Supports round-trip of compounds needed to set experiments/* byte flags.
 */

export type NbtTag =
  | { type: 'end' }
  | { type: 'byte'; name?: string; value: number }
  | { type: 'short'; name?: string; value: number }
  | { type: 'int'; name?: string; value: number }
  | { type: 'long'; name?: string; value: bigint }
  | { type: 'float'; name?: string; value: number }
  | { type: 'double'; name?: string; value: number }
  | { type: 'byteArray'; name?: string; value: Buffer }
  | { type: 'string'; name?: string; value: string }
  | { type: 'list'; name?: string; listType: number; value: NbtTag[] }
  | { type: 'compound'; name?: string; value: Record<string, NbtTag> }
  | { type: 'intArray'; name?: string; value: number[] }
  | { type: 'longArray'; name?: string; value: bigint[] };

const TAG = {
  end: 0,
  byte: 1,
  short: 2,
  int: 3,
  long: 4,
  float: 5,
  double: 6,
  byteArray: 7,
  string: 8,
  list: 9,
  compound: 10,
  intArray: 11,
  longArray: 12
} as const;

class Reader {
  constructor(
    private buf: Buffer,
    private offset = 0
  ) {}

  get pos(): number {
    return this.offset;
  }

  remaining(): number {
    return this.buf.length - this.offset;
  }

  u8(): number {
    const v = this.buf.readUInt8(this.offset);
    this.offset += 1;
    return v;
  }

  i8(): number {
    const v = this.buf.readInt8(this.offset);
    this.offset += 1;
    return v;
  }

  i16(): number {
    const v = this.buf.readInt16LE(this.offset);
    this.offset += 2;
    return v;
  }

  i32(): number {
    const v = this.buf.readInt32LE(this.offset);
    this.offset += 4;
    return v;
  }

  i64(): bigint {
    const v = this.buf.readBigInt64LE(this.offset);
    this.offset += 8;
    return v;
  }

  f32(): number {
    const v = this.buf.readFloatLE(this.offset);
    this.offset += 4;
    return v;
  }

  f64(): number {
    const v = this.buf.readDoubleLE(this.offset);
    this.offset += 8;
    return v;
  }

  string(): string {
    const len = this.buf.readUInt16LE(this.offset);
    this.offset += 2;
    const s = this.buf.subarray(this.offset, this.offset + len).toString('utf8');
    this.offset += len;
    return s;
  }

  bytes(n: number): Buffer {
    const slice = this.buf.subarray(this.offset, this.offset + n);
    this.offset += n;
    return Buffer.from(slice);
  }
}

class Writer {
  private chunks: Buffer[] = [];

  u8(v: number): void {
    const b = Buffer.alloc(1);
    b.writeUInt8(v & 0xff, 0);
    this.chunks.push(b);
  }

  i8(v: number): void {
    const b = Buffer.alloc(1);
    b.writeInt8(v, 0);
    this.chunks.push(b);
  }

  i16(v: number): void {
    const b = Buffer.alloc(2);
    b.writeInt16LE(v, 0);
    this.chunks.push(b);
  }

  i32(v: number): void {
    const b = Buffer.alloc(4);
    b.writeInt32LE(v, 0);
    this.chunks.push(b);
  }

  i64(v: bigint): void {
    const b = Buffer.alloc(8);
    b.writeBigInt64LE(v, 0);
    this.chunks.push(b);
  }

  f32(v: number): void {
    const b = Buffer.alloc(4);
    b.writeFloatLE(v, 0);
    this.chunks.push(b);
  }

  f64(v: number): void {
    const b = Buffer.alloc(8);
    b.writeDoubleLE(v, 0);
    this.chunks.push(b);
  }

  string(s: string): void {
    const raw = Buffer.from(s, 'utf8');
    const len = Buffer.alloc(2);
    len.writeUInt16LE(raw.length, 0);
    this.chunks.push(len, raw);
  }

  raw(buf: Buffer): void {
    this.chunks.push(buf);
  }

  toBuffer(): Buffer {
    return Buffer.concat(this.chunks);
  }
}

function typeId(tag: NbtTag): number {
  switch (tag.type) {
    case 'end':
      return TAG.end;
    case 'byte':
      return TAG.byte;
    case 'short':
      return TAG.short;
    case 'int':
      return TAG.int;
    case 'long':
      return TAG.long;
    case 'float':
      return TAG.float;
    case 'double':
      return TAG.double;
    case 'byteArray':
      return TAG.byteArray;
    case 'string':
      return TAG.string;
    case 'list':
      return TAG.list;
    case 'compound':
      return TAG.compound;
    case 'intArray':
      return TAG.intArray;
    case 'longArray':
      return TAG.longArray;
    default:
      return TAG.end;
  }
}

function readPayload(r: Reader, type: number, name?: string): NbtTag {
  switch (type) {
    case TAG.byte:
      return { type: 'byte', name, value: r.i8() };
    case TAG.short:
      return { type: 'short', name, value: r.i16() };
    case TAG.int:
      return { type: 'int', name, value: r.i32() };
    case TAG.long:
      return { type: 'long', name, value: r.i64() };
    case TAG.float:
      return { type: 'float', name, value: r.f32() };
    case TAG.double:
      return { type: 'double', name, value: r.f64() };
    case TAG.byteArray: {
      const len = r.i32();
      return { type: 'byteArray', name, value: r.bytes(len) };
    }
    case TAG.string:
      return { type: 'string', name, value: r.string() };
    case TAG.list: {
      const listType = r.u8();
      const len = r.i32();
      const value: NbtTag[] = [];
      for (let i = 0; i < len; i++) {
        value.push(readPayload(r, listType));
      }
      return { type: 'list', name, listType, value };
    }
    case TAG.compound: {
      const value: Record<string, NbtTag> = {};
      while (true) {
        const childType = r.u8();
        if (childType === TAG.end) break;
        const childName = r.string();
        value[childName] = readPayload(r, childType, childName);
      }
      return { type: 'compound', name, value };
    }
    case TAG.intArray: {
      const len = r.i32();
      const value: number[] = [];
      for (let i = 0; i < len; i++) value.push(r.i32());
      return { type: 'intArray', name, value };
    }
    case TAG.longArray: {
      const len = r.i32();
      const value: bigint[] = [];
      for (let i = 0; i < len; i++) value.push(r.i64());
      return { type: 'longArray', name, value };
    }
    default:
      throw new Error(`Unsupported NBT tag type ${type}`);
  }
}

function writePayload(w: Writer, tag: NbtTag): void {
  switch (tag.type) {
    case 'byte':
      w.i8(tag.value);
      return;
    case 'short':
      w.i16(tag.value);
      return;
    case 'int':
      w.i32(tag.value);
      return;
    case 'long':
      w.i64(tag.value);
      return;
    case 'float':
      w.f32(tag.value);
      return;
    case 'double':
      w.f64(tag.value);
      return;
    case 'byteArray':
      w.i32(tag.value.length);
      w.raw(tag.value);
      return;
    case 'string':
      w.string(tag.value);
      return;
    case 'list':
      w.u8(tag.listType);
      w.i32(tag.value.length);
      for (const item of tag.value) writePayload(w, item);
      return;
    case 'compound':
      for (const [k, child] of Object.entries(tag.value)) {
        w.u8(typeId(child));
        w.string(k);
        writePayload(w, child);
      }
      w.u8(TAG.end);
      return;
    case 'intArray':
      w.i32(tag.value.length);
      for (const n of tag.value) w.i32(n);
      return;
    case 'longArray':
      w.i32(tag.value.length);
      for (const n of tag.value) w.i64(n);
      return;
    case 'end':
      return;
    default:
      throw new Error('Unsupported NBT tag on write');
  }
}

/** Parse root unnamed compound from LE NBT bytes (no level.dat header). */
export function parseUnnamedCompound(buf: Buffer): NbtTag & { type: 'compound' } {
  const r = new Reader(buf);
  const type = r.u8();
  if (type !== TAG.compound) {
    throw new Error(`Expected root compound, got type ${type}`);
  }
  // Bedrock level.dat NBT root is typically an unnamed compound (empty name).
  const name = r.string();
  const tag = readPayload(r, TAG.compound, name || undefined);
  if (tag.type !== 'compound') {
    throw new Error('Root tag is not a compound');
  }
  return tag;
}

export function writeUnnamedCompound(compound: NbtTag & { type: 'compound' }): Buffer {
  const w = new Writer();
  w.u8(TAG.compound);
  w.string(compound.name || '');
  writePayload(w, compound);
  return w.toBuffer();
}

export interface LevelDatDocument {
  storageVersion: number;
  root: NbtTag & { type: 'compound' };
}

/** Parse Bedrock level.dat (8-byte header + LE NBT). */
export function parseLevelDat(buf: Buffer): LevelDatDocument {
  if (buf.length < 8) {
    throw new Error('level.dat too short for Bedrock header');
  }
  const storageVersion = buf.readInt32LE(0);
  const length = buf.readInt32LE(4);
  const nbt = buf.subarray(8, 8 + length);
  if (nbt.length < length) {
    throw new Error(`level.dat NBT truncated (header length=${length}, available=${nbt.length})`);
  }
  return {
    storageVersion,
    root: parseUnnamedCompound(Buffer.from(nbt))
  };
}

export function serializeLevelDat(doc: LevelDatDocument): Buffer {
  const nbt = writeUnnamedCompound(doc.root);
  const out = Buffer.alloc(8 + nbt.length);
  out.writeInt32LE(doc.storageVersion, 0);
  out.writeInt32LE(nbt.length, 4);
  nbt.copy(out, 8);
  return out;
}

/** Ensure experiments compound exists and set listed experiment IDs to byte 1. */
export function setExperiments(root: NbtTag & { type: 'compound' }, experimentIds: string[]): string[] {
  let experiments = root.value.experiments;
  if (!experiments || experiments.type !== 'compound') {
    experiments = { type: 'compound', name: 'experiments', value: {} };
    root.value.experiments = experiments;
  }
  experiments.value.experiments_ever_used = {
    type: 'byte',
    name: 'experiments_ever_used',
    value: 1
  };
  experiments.value.saved_with_toggled_experiments = {
    type: 'byte',
    name: 'saved_with_toggled_experiments',
    value: 1
  };
  const applied: string[] = [];
  for (const id of experimentIds) {
    const key = id.trim();
    if (!key) continue;
    experiments.value[key] = { type: 'byte', name: key, value: 1 };
    applied.push(key);
  }
  return applied;
}

/**
 * Patch an existing level.dat buffer with experiment flags.
 * Throws on parse failure (caller must fail honestly).
 */
export function patchLevelDatExperiments(raw: Buffer, experimentIds: string[]): {
  buffer: Buffer;
  applied: string[];
  storageVersion: number;
} {
  const doc = parseLevelDat(raw);
  const applied = setExperiments(doc.root, experimentIds);
  return {
    buffer: serializeLevelDat(doc),
    applied,
    storageVersion: doc.storageVersion
  };
}

/**
 * Build a minimal Bedrock level.dat for brand-new worlds that lack the file.
 * Enough for experiment toggles; BDS will flesh out remaining fields on first boot.
 */
export function createMinimalLevelDat(experimentIds: string[], storageVersion = 10): Buffer {
  const root: NbtTag & { type: 'compound' } = {
    type: 'compound',
    name: '',
    value: {
      LevelName: { type: 'string', name: 'LevelName', value: 'Bedrock level' },
      StorageVersion: { type: 'int', name: 'StorageVersion', value: storageVersion }
    }
  };
  setExperiments(root, experimentIds);
  return serializeLevelDat({ storageVersion, root });
}
