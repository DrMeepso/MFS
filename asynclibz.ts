import zlib from 'zlib';

export async function CompressBrotli(data: ArrayBuffer): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
        zlib.brotliCompress(data, (err, result) => {
            if (err) {
                reject(err);
            } else {
                resolve(result);
            }
        })
    
    })
}

export async function CompressGzip(data: ArrayBuffer): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
        zlib.gzip(data, (err, result) => {
            if (err) {
                reject(err);
            } else {
                resolve(result);
            }
        })
    
    })
}

export async function DecompressBrotli(data: ArrayBuffer): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
        zlib.brotliDecompress(data, (err, result) => {
            if (err) {
                reject(err);
            } else {
                resolve(result);
            }
        })
    
    })
}

export async function DecompressGzip(data: ArrayBuffer): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
        zlib.gunzip(data, (err, result) => {
            if (err) {
                reject(err);
            } else {
                resolve(result);
            }
        })
    
    })
}