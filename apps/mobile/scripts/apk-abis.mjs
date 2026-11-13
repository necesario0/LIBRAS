import { Buffer } from "node:buffer";
import { closeSync, fstatSync, openSync, readSync } from "node:fs";

/**
 * The CPU architectures an APK carries native code for, read from the `lib/<abi>/`
 * folders in the zip's central directory. Null when the APK cannot be read that way.
 */
export function apkAbis(path) {
  const fd = openSync(path, "r");
  try {
    const size = fstatSync(fd).size;
    const tailLength = Math.min(size, 65_557); // the end record (22 bytes) plus the longest comment
    const tail = Buffer.alloc(tailLength);
    readSync(fd, tail, 0, tailLength, size - tailLength);
    const end = tail.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
    if (end < 0) return null;
    const directorySize = tail.readUInt32LE(end + 12);
    const directoryOffset = tail.readUInt32LE(end + 16);
    if (directoryOffset === 0xffffffff) return null; // zip64, not handled
    const directory = Buffer.alloc(directorySize);
    readSync(fd, directory, 0, directorySize, directoryOffset);
    const abis = new Set();
    for (let at = 0; at + 46 <= directory.length && directory.readUInt32LE(at) === 0x02014b50; ) {
      const nameLength = directory.readUInt16LE(at + 28);
      const name = directory.toString("utf8", at + 46, at + 46 + nameLength);
      const match = /^lib\/([^/]+)\//.exec(name);
      if (match) abis.add(match[1]);
      at += 46 + nameLength + directory.readUInt16LE(at + 30) + directory.readUInt16LE(at + 32);
    }
    return [...abis];
  } finally {
    closeSync(fd);
  }
}
