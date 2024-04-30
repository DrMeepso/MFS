import fs from 'fs';
import path from "path";
import { DecompressBrotli, DecompressGzip } from './asynclibz';
import { CompressionType } from './types';

type FileArrayEntry = {
    fileName: string;
    linkedFileName: string;
    offset: bigint;
    length: bigint;
    compressionType: number;
    uncompressedLength: bigint;
    customData: string;
}

class ReadableFile {

    private parentReader: MFSReader;
    private thisFile: FileArrayEntry;

    fileName: string
    customData: string

    externalFile: boolean = false;

    constructor(reader: MFSReader, thisFile: FileArrayEntry) {

        this.parentReader = reader;
        this.thisFile = thisFile;

        this.fileName = this.thisFile.fileName;
        this.customData = this.thisFile.customData;

        if (this.thisFile.linkedFileName != undefined) {
            this.externalFile = true;
        }

    }

    async read(): Promise<Uint8Array> {

        if (this.externalFile) {
            return await this.readEFile();
        } else {
            return await this.readLFile();
        }

    }

    private async decompress(data: Uint8Array): Promise<Uint8Array> {

        let uncompressedData = data.buffer
        switch (this.thisFile.compressionType) {
            case CompressionType.Brotli:
                uncompressedData = await DecompressBrotli(data);
                break;
            case CompressionType.Gzip:
                uncompressedData = await DecompressGzip(data);
                break;
        }

        return new Uint8Array(uncompressedData);

    }

    private async readLFile(): Promise<Uint8Array> {

        const view = new DataView(this.parentReader.file.buffer);
        let pointer = Number(this.thisFile.offset);

        let buffer = new Uint8Array(Number(this.thisFile.length));

        for (let i = 0; i < this.thisFile.length; i++) {
            buffer[i] = view.getUint8(pointer);
            pointer++;
        }

        return await this.decompress(buffer);
    }

    private async readEFile(): Promise<Uint8Array> {

        const dir = path.join(this.parentReader.workingDirectory, this.thisFile.linkedFileName)
        const externalFile = fs.readFileSync(dir);
        const buf = Uint8Array.from(externalFile);
        const view = new DataView(buf.buffer);

        let pointer = this.thisFile.offset;

        let buffer = new Uint8Array(Number(this.thisFile.length));

        for (let i = 0; i < this.thisFile.length; i++) {
            buffer[i] = view.getUint8(Number(pointer));
            pointer++;
        }

        return await this.decompress(buffer);

    }

}

export class MFSReader {

    file: Uint8Array;
    private fileStrings: string[] = [];

    public workingDirectory: string = path.resolve(process.cwd());

    public files: ReadableFile[] = [];

    private customDataCompressionType: CompressionType = CompressionType.None;

    static from(file: string) {
        let encoder = new TextEncoder();
        let reader: MFSReader = new MFSReader(new Uint8Array(fs.readFileSync(file).buffer));
        reader.workingDirectory = path.dirname(file);
        return reader;
    }

    private async decompress(data: Uint8Array): Promise<Uint8Array> {

        let uncompressedData = data.buffer
        switch (this.customDataCompressionType) {
            case CompressionType.Brotli:
                uncompressedData = await DecompressBrotli(data);
                break;
            case CompressionType.Gzip:
                uncompressedData = await DecompressGzip(data);
                break;
        }

        return new Uint8Array(uncompressedData);

    }

    constructor(file: Uint8Array) {
        this.file = file;
    }

    public async readFile() {
        let view = new DataView(this.file.buffer);
        let pointer = 0;

        // read the header
        let magic = view.getUint32(pointer, true);
        pointer += 4;
        // the file magic is wrong!
        if (magic != 777209421) {
            throw new Error('Invalid MFS file');
        }

        let version = view.getUint8(pointer);
        pointer += 1;

        let fileDictionaryLength = view.getBigUint64(pointer, true);
        pointer += 8;
        let stringArrayCount = view.getBigUint64(pointer, true);
        pointer += 8;
        let stringArrayLength = view.getBigUint64(pointer, true);
        pointer += 8;

        let customDataStringArrayIndex = view.getUint32(pointer, true);
        pointer += 4;

        this.customDataCompressionType = view.getUint8(pointer);
        pointer += 1;

        // read the string array
        let stringsStart = Number(34n + (45n * fileDictionaryLength));
        let stringEnd = stringsStart + Number(stringArrayLength);

        let compressedStrings = new Uint8Array(this.file.slice(stringsStart, stringEnd));
        let data = await this.decompress(compressedStrings);

        let stringsView = new DataView(data.buffer);

        this.readStringArray(stringsView, fileDictionaryLength, stringArrayCount);
        await this.readFileArray(view, fileDictionaryLength);
    }

    private readStringArray(view: DataView, fileDictionaryLength: bigint, stringArrayLength: bigint) {
        let pointer = 0;

        for (let i = 0; i < stringArrayLength; i++) {
            let length = view.getUint32(pointer, true);
            pointer += 4;

            let string = '';
            for (let j = 0; j < length; j++) {
                string += String.fromCharCode(view.getUint8(pointer));
                pointer++;
            }

            this.fileStrings.push(string);
        }

    }

    private async readFileArray(view: DataView, fileDictionaryLength: bigint) {
        // we move the pointer to the end of the header and start of the file dictionary
        let pointer = 34

        for (let i = 0; i < fileDictionaryLength; i++) {
            let nameStringArrayIndex = view.getUint32(pointer, true);
            pointer += 4;
            let filenameStringArrayIndex = view.getUint32(pointer, true);
            pointer += 4;
            let offset = view.getBigUint64(pointer, true);
            pointer += 8;
            let length = view.getBigUint64(pointer, true);
            pointer += 8;
            let compressionType = view.getUint8(pointer);
            pointer += 1;
            let uncompressedLength = view.getBigUint64(pointer, true);
            pointer += 8;
            let customDataOffset = view.getBigUint64(pointer, true);
            pointer += 8;
            let customDataLength = view.getUint32(pointer, true);
            pointer += 4;

            const thisFile = {
                fileName: this.fileStrings[nameStringArrayIndex],
                linkedFileName: this.fileStrings[filenameStringArrayIndex - 1],
                offset: offset,
                length: length,
                compressionType: compressionType,
                uncompressedLength: uncompressedLength,
                customData: '' // we will read this later
            } as FileArrayEntry


            // its later, and time to read that custom data!
            let tmpPointer = customDataOffset
            let customDataBuffer = new Uint8Array(Number(customDataLength));
            for (let j = 0n; j < customDataLength; j++) {
                customDataBuffer[Number(j)] = view.getUint8(Number(tmpPointer));
                tmpPointer++;
            }

            thisFile.customData = new TextDecoder().decode(await this.decompress(customDataBuffer));

            const readableFile = new ReadableFile(this, thisFile);
            this.files.push(readableFile);

        }

    }

}