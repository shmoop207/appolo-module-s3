import {Readable} from "stream";


export interface IOptions {
    id?: string;
    region?: string;
    endpoint?: string;
    accessKeyId: string
    secretAccessKey: string
    awsAccessKeyId?: string
    awsSecretAccessKey?: string
    timeout?: number

}

export interface S3GetSignedUrlParams {
    bucket: string;
    file: string;
    expire?: number
}

export interface S3UpLoadParams {
    file: string;
    gzip?: boolean;
    contentType: string;
    buffer?: Buffer | string | Readable | Blob;
    bucket: string;
    public?: boolean;
    cache?: number;
    cacheControl?: string,
    metaData?: { [index: string]: string },
    contentEncoding?: string;
    expires?: string | Date | number;
}

export interface S3DirUpLoadParams {
    sourceDir: string,
    targetDir: string,
    gzip?: boolean,
    bucket: string,
    public?: boolean,
    cache?: number
}
