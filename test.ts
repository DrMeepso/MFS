import { MFSWriter } from "./writer";
import { MFSReader } from "./reader";
import { CompressionType } from "./types";
import { read, writeFileSync } from 'fs';

const writer = new MFSWriter();

writer.setCustomDataCompressionType(CompressionType.None);
//writer.addExternalFile('baller.txt', { filename: 'baller.txt', offset: 0, length: 26 }, 'This is a file about a baller!');
writer.addFileFromPath("image.png", "testImg.png", "A cool test image!", CompressionType.Brotli);
//writer.addFile('test.txt', encoder.encode("The quick brown fox jumps over the lazy dog, but was he fast enough?"), '', CompressionType.Brotli);
//writer.addFile('test2.txt', encoder.encode("The quick brown fox jumps over the lazy dog, but he fast enough!"), '', CompressionType.Gzip);

(async () => {

    const data = await writer.export();

    // save to file
    writeFileSync('test.mfs', Buffer.from(data));

    //MFSReader.from('./test.mfs');
    const reader = new MFSReader(new Uint8Array(data))
    await reader.readFile();

    let file = reader.files.find(f => f.fileName == 'image.png');
    console.log(file?.customData)
    if (!file) return;
    writeFileSync('test.png', Buffer.from((await file?.read()).buffer));

})()
