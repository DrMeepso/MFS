import { FileDictionaryEntry, FileHeader, StringArrayEntry } from "./types";
import fs from 'fs';
import path from "path";
import { text } from "stream/consumers";

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

    read(): string {

        if (this.externalFile) {
            return this.readEFile();
        } else {
            return this.readLFile();
        }

    }

    private readLFile(): string {

        const view = new DataView(this.parentReader.file.buffer);
        let pointer = Number(this.thisFile.offset);

        let buffer = new Uint8Array(Number(this.thisFile.length));

        for (let i = 0; i < this.thisFile.length; i++) {
            buffer[i] = view.getUint8(pointer);
            pointer++;
        }

        return new TextDecoder().decode(buffer);
    }

    private readEFile(): string {
        
        const dir = path.join(this.parentReader.workingDirectory, this.thisFile.linkedFileName)
        console.log(dir)
        const externalFile = fs.readFileSync(dir);
        console.log(new TextDecoder().decode(externalFile))
        const view = new DataView(externalFile.buffer);

        let pointer = this.thisFile.offset;

        let buffer = new Uint8Array(Number(this.thisFile.length));

        for (let i = 0; i < this.thisFile.length; i++) {
            buffer[i] = view.getUint8(Number(pointer));
            pointer++;
        }

        return new TextDecoder().decode(buffer);

    }

}

export class MFSReader {

    file: Uint8Array;
    private fileStrings: string[] = [];

    public workingDirectory: string = path.resolve(process.cwd());

    static from(file: string) {
        let encoder = new TextEncoder();
        let reader: MFSReader = new MFSReader(new Uint8Array(fs.readFileSync(file).buffer));
        reader.workingDirectory = path.dirname(file);
        return reader;
    }

    constructor(file: Uint8Array) {
        this.file = file;

        let view = new DataView(file.buffer);
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
        let stringArrayLength = view.getBigUint64(pointer, true);
        pointer += 8;

        let customDataStringArrayIndex = view.getUint32(pointer, true);
        pointer += 4;

        this.readStringArray(view, fileDictionaryLength, stringArrayLength);
        console.log(this.fileStrings);

        this.readFileArray(view, fileDictionaryLength);
        console.log(this.workingDirectory)

    }

    private readStringArray(view: DataView, fileDictionaryLength: bigint, stringArrayLength: bigint) {
        // p = header + (45 * fileDictionaryLength)
        let pointer = Number(25n + (45n * fileDictionaryLength))

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

    private readFileArray(view: DataView, fileDictionaryLength: bigint) {
        // we move the pointer to the end of the header and start of the file dictionary
        let pointer = 25

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
            for (let j = 0n; j < customDataLength; j++) {
                thisFile.customData += String.fromCharCode(view.getUint8(Number(tmpPointer)));
                tmpPointer++;
            }

            const readableFile = new ReadableFile(this, thisFile);
            console.log(readableFile.read())

        }

    }

}