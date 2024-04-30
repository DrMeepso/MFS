// number types because javascript is all 32 bit floats
type int8 = number // min: -128, max: 127
type int16 = number // min: -32768, max: 32767
type int32 = number // min: -2147483648, max: 2147483647
type int64 = number // min: -9223372036854775808, max: 9223372036854775807
type uint8 = number // min: 0, max: 255
type uint16 = number // min: 0, max: 65535
type uint32 = number // min: 0, max: 4294967295
type uint64 = number // min: 0, max: 18446744073709551615
type buint64 = bigint // this is the same as above but with a BigInt so javascript can handle the large numbers
type float32 = number // min: 1.40129846432481707e-45, max: 3.40282346638528860e+38
type float64 = number // min: 4.94065645841246544e-324, max: 1.79769313486231570e+308
type char = string // a ascii character is 8 bits

// size: 25 bytes
type FileHeader = {
    magic: char[4] // "MFS." // 777209421 // 0x4D46532E
    version: uint8 // 1

    fileDictionaryLength: uint64 // number of entries in the file dictionary, i dont think there is going to be more than 4 billion entries
    stringArrayLength: uint64 // the byte offset from the start of the file

    // custom data, to allow for any extra data to be stored about the file
    customDataStringArrayIndex: uint32 // the index of the string in the string array
}

// size: 8 + length bytes
type StringArrayEntry = {
    length: uint32 // number of bytes in the string
    string: char[] // the string
}

// size: 45 bytes
type FileDictionaryEntry = {
    nameStringArrayIndex: uint32 // the index of the string in the string array

    // if the file is in a different file
    // will be 0 if the file is in this file, so the index in the string array will be filenameStringArrayIndex - 1
    filenameStringArrayIndex: uint32 // the byte offset from the start of the file the file is in

    // file contence
    offset: uint64 // the byte offset from the start of the file
    length: uint64 // how many bytes the file is
    compressionType: uint8 // 0: none, 1: brotli, 2: gzip // this can be extended to support more compression types
    // if compressionType is 0 this can be ignored
    uncompressedLength: buint64 // the length of the file when uncompressed

    // custom data, for any extra info to be stored about the current file
    // custom data is always stored in the MFS file, even if the file is in another file.
    // if the file is in this file customDataOffset is equal to offset + length (it will be behind the file)
    customDataOffset: uint64 // the byte offset from the start of the file
    customDataLength: uint32 // number of bytes of custom data
}

type MFSFile = {
    header: FileHeader
    fileDictionary: FileDictionaryEntry[]
    stringArray: StringArrayEntry[]
    fileData: uint8[]
}

export enum CompressionType {
    None = 0,
    Brotli = 1,
    Gzip = 2
}

// used by the MFSReader and MFSWriter
type AttachedFile = {
    name: string
    data: ArrayBuffer
    customData: string
    compressionType: CompressionType
}

type ExternalFile = {
    name: string
    filename: string
    offset: number
    length: number
    customData: string,
    compressionType: CompressionType
}

type ExternalFileConfig = {
    filename: string,
    offset: number,
    length: number
}

export { MFSFile, AttachedFile, ExternalFile, FileHeader, StringArrayEntry, FileDictionaryEntry, ExternalFileConfig}