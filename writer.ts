import { AttachedFile, ExternalFile, ExternalFileConfig, FileDictionaryEntry, FileHeader, CompressionType } from "./types";
import { CompressBrotli, CompressGzip } from "./asynclibz";
import fs from 'fs';

type WorkingFile = {
    WriteFile: AttachedFile | ExternalFile;
    FileEntry: FileDictionaryEntry;
}


export class MFSWriter {

    fileCustomProperty: string = 'Modular File System';

    containingFiles: AttachedFile[] = [];
    externalFiles: ExternalFile[] = [];

    customdataCompressionType: CompressionType = CompressionType.None;

    constructor() { }

    setCustomProperty(value: string) {
        this.fileCustomProperty = value;
    }

    addFile(name: string, data: ArrayBuffer, customData: string, compressionType?: CompressionType) {
        let compression: CompressionType = CompressionType.None;
        if (compressionType != undefined) {
            compression = compressionType;
        }
        this.containingFiles.push({ name, data, customData, compressionType: compression } as AttachedFile);
    }

    addFileFromPath(name: string, path: string, customData: string, compressionType?: CompressionType) {
        let compression: CompressionType = CompressionType.None;
        if (compressionType != undefined) {
            compression = compressionType;
        }
        let data = fs.readFileSync(path).buffer;
        this.containingFiles.push({ name, data, customData, compressionType: compression } as AttachedFile);
    }

    addExternalFile(name: string, fileinfo: ExternalFileConfig, customData: string, compressionType?: CompressionType) {
        let compression: CompressionType = CompressionType.None;
        if (compressionType != undefined) {
            compression = compressionType;
        }
        this.externalFiles.push({ name, ...fileinfo, customData, compressionType: compression } as ExternalFile)
    }

    setCustomDataCompressionType(compressionType: CompressionType) {
        this.customdataCompressionType = compressionType;
    }

    private stringArray(strings: string[]): ArrayBuffer {
        const buffer = new ArrayBuffer(strings.join("").length + (strings.length * 4));
        const view = new DataView(buffer);
        let pointer = 0;
        strings.forEach((str, i) => {
            const strBuffer = new TextEncoder().encode(str);
            view.setUint32(pointer, strBuffer.byteLength, true);
            pointer += 4;
            for (let i = 0; i < strBuffer.byteLength; i++) {
                view.setUint8(pointer, strBuffer[i]);
                pointer++;
            }
        })
        return buffer;
    }

    private headerToBuffer(header: FileHeader): ArrayBuffer {
        const buffer = new ArrayBuffer(34);
        const view = new DataView(buffer);

        view.setUint32(0, 777209421, true); // MFS.
        view.setUint8(4, header.version);
        view.setBigUint64(5, BigInt(header.fileDictionaryLength), true);
        view.setBigUint64(13, BigInt(header.stringArrayCount), true);
        view.setBigUint64(21, BigInt(header.stringArrayLength), true);
        view.setUint32(29, header.customDataStringArrayIndex, true);
        view.setUint8(33, header.compressionType);

        return buffer;
    }

    private fileToBuffer(file: FileDictionaryEntry): ArrayBuffer {

        const buffer = new ArrayBuffer(45);
        const view = new DataView(buffer);

        view.setUint32(0, file.nameStringArrayIndex, true);
        view.setUint32(4, file.filenameStringArrayIndex, true);
        view.setBigUint64(8, BigInt(file.offset), true);
        view.setBigUint64(16, BigInt(file.length), true);
        view.setUint8(24, file.compressionType);
        view.setBigUint64(25, BigInt(file.uncompressedLength), true);
        view.setBigUint64(33, BigInt(file.customDataOffset), true);
        view.setUint32(41, file.customDataLength, true);

        return buffer;

    }

    addStringToList(stringToAdd: string, stringList: string[]): number {
        // check if the string is already in the list
        let index = stringList.indexOf(stringToAdd);
        if (index == -1) {
            index = stringList.push(stringToAdd) - 1;
        }
        return index;
    }

    private async compressData(data: ArrayBuffer): Promise<ArrayBuffer> {
        switch (this.customdataCompressionType) {
            case CompressionType.Brotli:
                return await CompressBrotli(data);
            case CompressionType.Gzip:
                return await CompressGzip(data);
            default:
                return data;
        }
    }

    async export(): Promise<ArrayBuffer> {

        const fileStrings: string[] = [];
        const files: WorkingFile[] = [];

        const header = {
            magic: 'MFS.',
            version: 1,
            fileDictionaryLength: -1,
            stringArrayCount: -1,
            stringArrayLength: -1,
            customDataStringArrayIndex: this.addStringToList(this.fileCustomProperty, fileStrings),
            compressionType: this.customdataCompressionType.valueOf()
        } as FileHeader

        // containing files
        for (const file of this.containingFiles) {

            // if the custom dats isnt a arraybuffer we need to convert it
            let customDataBuffer = new ArrayBuffer(0);
            if (typeof file.customData != 'string') {
                customDataBuffer = file.customData as ArrayBuffer;
            } else {
                customDataBuffer = new TextEncoder().encode(file.customData);
            }

            file.customData = await this.compressData(customDataBuffer)

            const nameStringIndex = this.addStringToList(file.name, fileStrings);

            const FileEntry = {
                nameStringArrayIndex: nameStringIndex,
                filenameStringArrayIndex: 0, // 0 means the file is in this file
                offset: 0, // will be set later
                length: file.data.byteLength,
                compressionType: file.compressionType.valueOf(), // 0: none, 1: brotli, 2: gzip
                uncompressedLength: 7308332045228794194n, // since these arent used we can put some text in for fun!
                customDataOffset: 0, // will be set later
                customDataLength: file.customData.byteLength
            } as FileDictionaryEntry

            switch (file.compressionType.valueOf()) {
                case CompressionType.Brotli:
                    FileEntry.uncompressedLength = BigInt(file.data.byteLength);
                    let compressedData = await CompressBrotli(file.data);
                    FileEntry.length = compressedData.byteLength;
                    file.data = compressedData;
                    break;
                case CompressionType.Gzip:
                    FileEntry.uncompressedLength = BigInt(file.data.byteLength);
                    let compressedDataGzip = await CompressGzip(file.data);
                    FileEntry.length = compressedDataGzip.byteLength;
                    file.data = compressedDataGzip;
                    break;
                default:
                    break;
            }

            files.push({ WriteFile: file, FileEntry } as WorkingFile);

        }

        // external files
        for (const file of this.externalFiles) {

            // if the custom dats isnt a arraybuffer we need to convert it
            let customDataBuffer = new ArrayBuffer(0);
            if (typeof file.customData != 'string') {
                customDataBuffer = file.customData as ArrayBuffer;
            } else {
                customDataBuffer = new TextEncoder().encode(file.customData);
            }

            file.customData = await this.compressData(customDataBuffer)

            const nameStringIndex = this.addStringToList(file.name, fileStrings);
            const filenameStringIndex = this.addStringToList(file.filename, fileStrings);

            const FileEntry = {
                nameStringArrayIndex: nameStringIndex,
                filenameStringArrayIndex: filenameStringIndex + 1, // +1 means the file is in another file
                offset: file.offset, // will be set later
                length: file.length, // will be set later
                compressionType: file.compressionType.valueOf(), // 0: none, 1: brotli, 2: gzip
                // we dont know the uncompressed length of a external file because we didnt compress it...
                uncompressedLength: 7308332045227682116n, // since these arent used we can put some text in for fun!
                customDataOffset: 0, // will be set later
                customDataLength: file.customData.byteLength
            } as FileDictionaryEntry

            files.push({ WriteFile: file, FileEntry } as WorkingFile);

        }

        header.fileDictionaryLength = files.length;
        header.stringArrayCount = fileStrings.length

        let uncStringBuffer = this.stringArray(fileStrings);
        let stringBuffer = await this.compressData(uncStringBuffer);

        header.stringArrayLength = stringBuffer.byteLength;

        let headerBuffer = new Uint8Array(this.headerToBuffer(header));

        const lengthOfHeader = headerBuffer.byteLength + stringBuffer.byteLength + (files.length * 45);
        const lengthOfFiles = files.reduce((acc, file) => acc + (file.FileEntry.filenameStringArrayIndex > 0 ? 0 : file.FileEntry.length) + file.FileEntry.customDataLength, 0);

        let fullBuffer = new Uint8Array(lengthOfHeader + lengthOfFiles);

        fullBuffer.set(new Uint8Array(headerBuffer), 0);
        fullBuffer.set(new Uint8Array(stringBuffer), headerBuffer.byteLength + (files.length * 45));

        let pointer = lengthOfHeader;
        for (let i = 0; i < files.length; i++) {
            let thisFile: AttachedFile = files[i].WriteFile as unknown as AttachedFile;
            // check if the file is to be stored in this file or is a external file
            if (thisFile.data != undefined) {
                let thisFileEntry: FileDictionaryEntry = files[i].FileEntry;
                let fileBuffer = new Uint8Array(thisFile.data);

                fullBuffer.set(fileBuffer, pointer);
                thisFileEntry.offset = pointer
                pointer += fileBuffer.byteLength;

                if (typeof thisFile.customData == 'string') continue
                let customDataBuffer = new Uint8Array(thisFile.customData);
                //customDataBuffer = new Uint8Array(await this.compressData(customDataBuffer))

                fullBuffer.set(customDataBuffer, pointer);
                thisFileEntry.customDataOffset = pointer
                pointer += customDataBuffer.byteLength;

            } else {
                // a external file only writes its custom data
                let thisFileEntry: FileDictionaryEntry = files[i].FileEntry;

                if (typeof thisFile.customData == 'string') continue
                fullBuffer.set(new Uint8Array(new Uint8Array(thisFile.customData)), pointer);
                thisFileEntry.customDataOffset = pointer
                pointer += thisFile.customData.byteLength;
            }

            let fileBuffer = this.fileToBuffer(files[i].FileEntry);
            fullBuffer.set(new Uint8Array(fileBuffer), headerBuffer.byteLength + (i * 45));
        }

        return fullBuffer.buffer
    }

}