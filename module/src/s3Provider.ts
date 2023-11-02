import zlib = require("zlib");
import fs = require("fs");
import path = require("path");
import {
    S3,
    ListObjectsV2Request,
    ListObjectsV2Output,
    GetObjectCommand,
    GetObjectRequest,
    PutObjectRequest,
    PutObjectCommand,
    DeleteObjectRequest,
    CopyObjectRequest,
    PutObjectCommandInput,
    ListObjectsV2CommandOutput,
    GetObjectCommandInput,
    HeadObjectOutput,
    HeadObjectRequest,
    _Object
} from "@aws-sdk/client-s3";
import followRedirects = require("follow-redirects");
import httpTemp = require("http");
import httpsTemp = require("https");
import urlClass = require("url");
import {ILogger} from "@appolo/logger";
import {define, inject, singleton} from "@appolo/inject";
import {S3DirUpLoadParams, S3GetSignedUrlParams, S3UpLoadParams} from "./IOptions";
import {Promises, Strings, Streams} from "@appolo/utils";
import {Readable} from "stream";
import {getSignedUrl} from "@aws-sdk/s3-request-presigner";


let http = followRedirects.http as typeof httpTemp;
let https = followRedirects.https as typeof httpsTemp;

@define()
@singleton()
export class S3Provider {
    @inject() protected logger: ILogger;
    @inject() protected s3Client: S3;

    public async uploadDir(opts: S3DirUpLoadParams): Promise<void> {
        try {
            let files: string[] = await Promises.fromCallback(c => fs.readdir(opts.sourceDir, c));

            await Promises.map(files, file => {
                let dto: S3UpLoadParams = {
                    file: path.join(opts.targetDir, file),
                    gzip: opts.gzip,
                    contentType: "",
                    buffer: fs.createReadStream(path.join(opts.sourceDir, file)),
                    bucket: opts.bucket,
                    public: opts.public,
                    cache: opts.cache
                };

                return this.upload(dto);
            }, {concurrency: 5});
        } catch (e) {
            this.logger.error(`failed to upload dir ${opts.sourceDir}`, {error: e});

            throw e;
        }
    }

    public async listFiles(opts: { prefix: string, bucket: string, maxKeys?: number }): Promise<ListObjectsV2Output> {

        let metaData: ListObjectsV2Request = {
            Bucket: opts.bucket,
            Prefix: opts.prefix,
            MaxKeys: opts.maxKeys || 1000
        };

        let result = await this.s3Client.listObjectsV2(metaData);

        return result;
    }

    public async listFilesAll(opts: {
        prefix: string,
        bucket: string,
        maxKeys?: number,
        nextToken?: string,
        contents?: _Object[]
    }): Promise<ListObjectsV2CommandOutput> {

        let metaData: ListObjectsV2Request = {
            Bucket: opts.bucket,
            Prefix: opts.prefix,
            MaxKeys: opts.maxKeys || 1000
        };

        let result = await this.s3Client.listObjectsV2(metaData);

        if (!result.Contents) {
            result.Contents = [];
        }

        if (opts.contents) {
            result.Contents = [...opts.contents, ...result.Contents]
        }

        if (!result.IsTruncated) {
            return result;
        }

        if (result.NextContinuationToken) {
            result = await this.listFilesAll({
                ...opts,
                nextToken: result.NextContinuationToken,
                contents: result.Contents
            })
        }

        return result;
    }

    public async download(opts: { fileName: string, gzip?: boolean, bucket, output: string }): Promise<string> {

        return new Promise(async (resolve: (paths: string) => void, reject) => {


            let options: GetObjectCommandInput = {
                Bucket: opts.bucket,
                Key: opts.fileName
            };

            let path = opts.output;

            let writer = fs.createWriteStream(path).on('finish', () => resolve(path));

            let output = await this.s3Client.getObject(options)

            let stream = (output.Body as Readable)
                .on('error', (e) => reject(e));

            if (opts.gzip) {
                stream = stream.pipe(zlib.createGunzip()
                    .on("error", (e) => reject(new Error("gunzip error"))))
            }


            stream.pipe(writer);
        });

    }

    public async downloadStream(opts: { fileName: string, gzip?: boolean, bucket }): Promise<Readable> {

        let options: GetObjectCommandInput = {
            Bucket: opts.bucket,
            Key: opts.fileName
        };

        let output = await this.s3Client.getObject(options);
        let stream = output.Body as Readable;

        if (opts.gzip) {
            stream = stream.pipe(zlib.createGunzip())
        }

        return stream
    }

    public async getObject(opts: { fileName: string, bucket: string, gzip?: boolean }): Promise<Buffer> {
        let options = {
            Bucket: opts.bucket,
            Key: opts.fileName
        };

        let result = await this.s3Client.getObject(options)

        let stream = result.Body as Readable;

        if (opts.gzip) {
            stream = stream.pipe(zlib.createGunzip());
        }

        let buffer = await Streams.convertToBuffer(stream);

        return buffer;
    }

    public async upload(opts: S3UpLoadParams): Promise<void> {
        try {
            const params = this._createS3UploadParams(opts);

            let buffer = opts.buffer;

            if (opts.gzip) {
                buffer = await Promises.fromCallback(c => zlib.gzip(buffer as string, c));
            }

            params.Body = buffer;

            await this.s3Client.putObject(params)

        } catch (e) {
            this.logger.error(`failed to upload file ${opts.file}`, {error: e});

            throw e;
        }
    }

    private _createS3DownloadParams(opts: S3GetSignedUrlParams): GetObjectRequest {
        let params = <GetObjectRequest>{
            Bucket: opts.bucket,
            Key: opts.file
        };

        return params;
    }

    private _createS3UploadParams(opts: S3UpLoadParams): PutObjectCommandInput {
        let params = <PutObjectRequest>{
            Bucket: opts.bucket,
            Key: opts.file,
            ContentType: opts.contentType,
            ContentEncoding: opts.contentEncoding
        };

        if (opts.gzip) {
            params.ContentEncoding = "gzip";
        }

        if (opts.cache) {
            params.CacheControl = `public, max-age=${opts.cache}`;
        }

        if (opts.cacheControl) {
            params.CacheControl = opts.cacheControl;
        }

        if (opts.metaData) {
            params.Metadata = opts.metaData;
        }

        if (opts.public) {
            params.ACL = `public-read`;
        }

        if (opts.expires) {
            if (typeof opts.expires === "number") {
                params.Expires = new Date(Date.now() + (opts.expires * 1000));
            } else {
                params.Expires = new Date(opts.expires);
            }
        }

        return params;
    }

    public async head(opts: { bucket: string; file: string; }): Promise<HeadObjectOutput> {
        try {
            let params = <HeadObjectRequest>{
                Key: opts.file,
                Bucket: opts.bucket
            };

            let result = await this.s3Client.headObject(params)

            return result;
        } catch (e) {
            if (e.code === "NotFound") {
                return null;
            }

            this.logger.error(`failed to get head file ${opts.file}`, {e: e});

            throw e;
        }
    }

    public async exists(opts: { bucket: string; file: string; }): Promise<boolean> {

        let result = await this.head(opts);

        return result !== null;

    }

    public async copy(opts: { bucket: string; source: string; target: string; }): Promise<void> {
        try {
            let params = <CopyObjectRequest>{
                Bucket: opts.bucket,
                CopySource: opts.source,
                Key: opts.target
            };

            await this.s3Client.copyObject(params);
        } catch (e) {
            this.logger.error(`failed to copy ${opts.source} to ${opts.target}`, {
                e: e
            });

            throw e;
        }
    }

    public async delete(opts: { bucket: string; key: string }): Promise<void> {
        try {
            let params = <DeleteObjectRequest>{
                Bucket: opts.bucket,
                Key: opts.key
            };

            await this.s3Client.deleteObject(params);

        } catch (e) {
            this.logger.error(`failed to delete ${opts.key} bucket ${opts.bucket}`, {
                e: e
            });

            throw e;
        }
    }

    public async deleteByPrefix(params: { bucket: string, prefix: string }) {
        let {bucket, prefix} = params
        let data = await this.listFilesAll({prefix: prefix, bucket: bucket});

        if (!data?.Contents?.length) {
            return;
        }

        await Promises.map(data.Contents, item => this.delete({
            bucket: bucket,
            key: item.Key
        }), {concurrency: 5})

    }

    public async copyUrl(url: string, opts: S3UpLoadParams & { buffer?: string }): Promise<void> {
        await Promises.fromCallback(c => {
            let client = (url || "").startsWith("https://") ? (https as any) : http;

            let options = urlClass.parse(url) as any;

            options.rejectUnauthorized = false;

            client
                .get(options, async res => {
                    if (res.statusCode >= 400) {
                        c(new Error("error " + res.statusCode + " retrieving " + url));
                    }

                    opts.buffer = res;

                    await this.upload(opts);
                    c(null);
                })
                .on("error", err => c(err));
        });
    }

    public async getUploadSignedUrl(opts: S3UpLoadParams): Promise<string> {
        const params = this._createS3UploadParams(opts);

        try {

            let command = new PutObjectCommand(params);

            const url = await getSignedUrl(this.s3Client, command, {expiresIn: 3600});

            return url;

        } catch (e) {
            this.logger.error(`failed to get signed url for upload`, {e: e});

            throw e;
        }
    }

    public async getDownloadSignedUrl(opts: S3GetSignedUrlParams): Promise<string> {

        const params = this._createS3DownloadParams(opts);

        try {
            let command = new GetObjectCommand(params);

            const url = await getSignedUrl(this.s3Client, command, {expiresIn: opts.expire || 3600});

            return url;
        } catch (e) {
            this.logger.error(`failed to get signed url for download`, {e: e});

            throw e;
        }
    }
}
