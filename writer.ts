import { AttachedFile, ExternalFile, ExternalFileConfig, FileDictionaryEntry, FileHeader } from "./types";

type WorkingFile = {
    WriteFile: AttachedFile | ExternalFile;
    FileEntry: FileDictionaryEntry;
}

export class MFSWriter {

    fileCustomProperty: string = 'A Meepso File System File!';

    containingFiles: AttachedFile[] = [];
    externalFiles: ExternalFile[] = [];

    constructor() {}

    setCustomProperty(value: string) {
        this.fileCustomProperty = value;
    }

    addFile(name: string, data: ArrayBuffer, customData: string) {
        this.containingFiles.push({ name, data, customData } as AttachedFile);
    }

    addExternalFile(name: string, fileinfo: ExternalFileConfig, customData: string) {
        this.externalFiles.push({ name, ...fileinfo, customData } as ExternalFile)
    }

    private stringArray(strings: string[]) : ArrayBuffer {
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
        const buffer = new ArrayBuffer(25);
        const view = new DataView(buffer);

        view.setUint32(0, 777209421, true); // MFS.
        view.setUint8(4, header.version);
        view.setBigUint64(5, BigInt(header.fileDictionaryLength), true);
        view.setBigUint64(13, BigInt(header.stringArrayLength), true);
        view.setUint32(21, header.customDataStringArrayIndex, true);

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

    export(): ArrayBuffer {

        const fileStrings: string[] = [];
        const files: WorkingFile[] = [];

        const header = {
            magic: 'MFS.',
            version: 1,
            fileDictionaryLength: -1,
            stringArrayLength: -1,
            customDataStringArrayIndex: this.addStringToList(this.fileCustomProperty, fileStrings)
        } as FileHeader

        // containing files
        for (const file of this.containingFiles) {

            const nameStringIndex = this.addStringToList(file.name, fileStrings);

            const FileEntry = {
                nameStringArrayIndex: nameStringIndex,
                filenameStringArrayIndex: 0, // 0 means the file is in this file
                offset: 0, // will be set later
                length: file.data.byteLength,
                compressionType: 0, // 0: none, 1: brotli, 2: gzip
                uncompressedLength: 7308332045228794194n, // since these arent used we can put some text in for fun!
                customDataOffset: 0, // will be set later
                customDataLength: file.customData.length
            } as FileDictionaryEntry

            files.push({ WriteFile: file, FileEntry } as WorkingFile);

        }

        // external files
        for (const file of this.externalFiles) {

            const nameStringIndex = this.addStringToList(file.name, fileStrings);
            const filenameStringIndex = this.addStringToList(file.filename, fileStrings);

            const FileEntry = {
                nameStringArrayIndex: nameStringIndex,
                filenameStringArrayIndex: filenameStringIndex + 1, // +1 means the file is in another file
                offset: file.offset, // will be set later
                length: file.length, // will be set later
                compressionType: 0, // 0: none, 1: brotli, 2: gzip
                uncompressedLength: 7308332045227682116n, // since these arent used we can put some text in for fun!
                customDataOffset: 0, // will be set later
                customDataLength: file.customData.length
            } as FileDictionaryEntry

            files.push({ WriteFile: file, FileEntry } as WorkingFile);

        }

        header.fileDictionaryLength = files.length;
        header.stringArrayLength = fileStrings.length

        let headerBuffer = new Uint8Array(this.headerToBuffer(header));
        let stringBuffer = this.stringArray(fileStrings);

        const lengthOfHeader = headerBuffer.byteLength + stringBuffer.byteLength + (files.length * 45);

        const lengthOfFiles = files.reduce((acc, file) => acc + (file.FileEntry.filenameStringArrayIndex > 0 ? 0 : file.FileEntry.length) + file.FileEntry.customDataLength, 0);

        let fullBuffer = new Uint8Array(lengthOfHeader + lengthOfFiles);
        fullBuffer.set(new Uint8Array(headerBuffer), 0);
        fullBuffer.set(new Uint8Array(stringBuffer), headerBuffer.byteLength + (files.length * 45));

        let pointer = headerBuffer.byteLength + stringBuffer.byteLength + (files.length * 45);
        for (let i = 0; i < files.length; i++) {
            let thisFile: AttachedFile = files[i].WriteFile as unknown as AttachedFile;
            // check if the file is to be stored in this file or is a external file
            if (thisFile.data != undefined) {
                let thisFileEntry: FileDictionaryEntry = files[i].FileEntry;
                let fileBuffer = new Uint8Array(thisFile.data);

                fullBuffer.set(fileBuffer, pointer);
                thisFileEntry.offset = pointer
                pointer += fileBuffer.byteLength;

                fullBuffer.set(new Uint8Array(new TextEncoder().encode(thisFile.customData)), pointer);
                thisFileEntry.customDataOffset = pointer
                pointer += thisFile.customData.length;

            } else {
                // a external file only writes its custom data
                let thisFileEntry: FileDictionaryEntry = files[i].FileEntry;

                fullBuffer.set(new Uint8Array(new TextEncoder().encode(thisFile.customData)), pointer);
                thisFileEntry.customDataOffset = pointer
                pointer += thisFile.customData.length;
            }

            let fileBuffer = this.fileToBuffer(files[i].FileEntry);
            fullBuffer.set(new Uint8Array(fileBuffer),headerBuffer.byteLength + (i * 45));
        }

        return fullBuffer.buffer
    }

}