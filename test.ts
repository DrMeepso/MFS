import { MFSWriter } from "./writer";
import { MFSReader } from "./reader";


const writer = new MFSWriter();
const encoder = new TextEncoder();

writer.setCustomProperty('This is a MFS, or Meepso File System file!')
writer.addExternalFile('baller.txt', { filename: 'baller.txt', offset: 0, length: 26 }, 'This is a file about a baller!');
writer.addFile('test.txt', encoder.encode("The quick brown fox jumps over the lazy dog, but was he fast enough?"), 'This is a file about a fox!');

const data = writer.export();

// save to file
import { writeFileSync } from 'fs';
writeFileSync('test.mfs', Buffer.from(data));

//MFSReader.from('./test.mfs');
const reader = new MFSReader(new Uint8Array(data))