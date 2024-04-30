import { MFSWriter } from "./writer";
import { MFSReader } from "./reader";
import { CompressionType } from "./types";
import { writeFileSync } from 'fs';

const writer = new MFSWriter();
const encoder = new TextEncoder();

writer.setCustomProperty('This is a MFS, or Moduler File System file!')
//writer.addExternalFile('baller.txt', { filename: 'baller.txt', offset: 0, length: 26 }, 'This is a file about a baller!');
writer.addFileFromPath("image.png", "testImg.png", "This is an image file!", CompressionType.None);
writer.addFile('test.txt', encoder.encode("The quick brown fox jumps over the lazy dog, but was he fast enough?"), '', CompressionType.Brotli);
writer.addFile('test2.txt', encoder.encode("The quick brown fox jumps over the lazy dog, but he fast enough!"), '', CompressionType.Gzip);

(async () => {

    const data = await writer.export();

    // save to file
    writeFileSync('test.mfs', Buffer.from(data));

    //MFSReader.from('./test.mfs');
    const reader = new MFSReader(new Uint8Array(data))
    
    let file = reader.files.find(f => f.fileName == 'image.png');
    console.log(file)
    if (!file) return;
    writeFileSync('test.png', Buffer.from((await file?.read()).buffer));

})()
