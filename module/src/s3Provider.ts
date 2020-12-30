import zlib = require("zlib");
import fs = require("fs");
import path = require("path");
import AWS = require("aws-sdk");
import followRedirects = require("follow-redirects");
import httpTemp = require("http");
import httpsTemp = require("https");
import urlClass = require("url");
//import _ = require("lodash");
import {ILogger} from "@appolo/logger";
import {define, inject, singleton} from "@appolo/inject";
import {S3DirUpLoadParams, S3GetSignedUrlParams, S3UpLoadParams} from "./IOptions";
import {Promises, Strings} from "@appolo/utils";

let http = followRedirects.http as typeof httpTemp;
let https = followRedirects.https as typeof httpsTemp;

@define()
@singleton()
export class S3Provider {
    @inject() protected logger: ILogger;
    @inject() protected s3Client: AWS.S3;

    public async uploadDir(opts: S3DirUpLoadParams): Promise<void> {
        try {
            let files: string[] = await Promises.fromCallback(c =>
                fs.readdir(opts.sourceDir, c)
            );

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

    public async listFiles(opts: { prefix: string, bucket: string, maxKeys?: number }): Promise<AWS.S3.Types.ListObjectsV2Output> {

        let metaData: AWS.S3.Types.ListObjectsV2Request = {
            Bucket: opts.bucket,
            Prefix: opts.prefix,
            MaxKeys: opts.maxKeys || 100
        };

        let result = await Promises.fromCallback(c => this.s3Client.listObjectsV2(metaData, c));

        return result;
    }

    public async download(opts: { fileName: string, gzip?: boolean, bucket, output: string }): Promise<string> {

        return new Promise((resolve: (paths: string) => void, reject) => {


            let options = {
                Bucket: opts.bucket,
                Key: opts.fileName
            };

            let path = opts.output;

            let writer = fs.createWriteStream(path).on('finish', () => resolve(path));

            let stream = this.s3Client.getObject(options).createReadStream()
                .on('error', (e) => reject(e));

            if (opts.gzip) {
                stream = stream.pipe(zlib.createGunzip()
                    .on("error", (e) => reject(new Error("gunzip error"))))
            }


            stream.pipe(writer);
        });

    }

    public async getObject(opts: { fileName: string, bucket: string, gzip?: boolean }): Promise<Buffer | string> {
        let options = {
            Bucket: opts.bucket,
            Key: opts.fileName
        };

        let result = await this.s3Client.getObject(options).promise();

        let body = result.Body;

        if (opts.gzip) {
            body = await Promises.fromCallback(c => zlib.gunzip(body as Buffer, {}, c))
        }

        return body as Buffer;

    }

    public async upload(opts: S3UpLoadParams): Promise<void> {
        try {

            const params = this.createS3UploadParams(opts);

            params.Body = opts.buffer;

            if (opts.gzip) {
                params.Body = await Promises.fromCallback(c => zlib.gzip(opts.buffer as string, c));
            }

            await Promises.fromCallback(c => this.s3Client.upload(params, c));

            this.logger.info(`file uploaded ${opts.file}`);
        } catch (e) {
            this.logger.error(`failed to upload file ${opts.file}`, {error: e});

            throw e;
        }
    }

    private createS3DownloadParams(opts: S3GetSignedUrlParams): AWS.S3.Types.GetObjectRequest {
        let params = <AWS.S3.Types.GetObjectRequest>{
            Bucket: opts.bucket,
            Key: opts.file
        };

        return params;
    }

    private createS3UploadParams(opts: S3UpLoadParams): AWS.S3.Types.PutObjectRequest {
        let params = <AWS.S3.Types.PutObjectRequest>{
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

        if (opts.public) {
            params.ACL = `public-read`;
        }

        if (opts.expires) {
            if (typeof opts.expires === "number") {
                params.Expires = opts.expires as any;
            } else {
                params.Expires = new Date(opts.expires);
            }
        }

        return params;
    }

    public async head(opts: { bucket: string; file: string; }): Promise<AWS.S3.Types.HeadObjectOutput> {
        try {
            let params = <AWS.S3.Types.HeadObjectRequest>{
                Key: opts.file,
                Bucket: opts.bucket
            };

            let result = await Promises.fromCallback(c =>
                this.s3Client.headObject(params, c)
            );

            return result;
        } catch (e) {
            if (e.code === "NotFound") {
                return null;
            }

            this.logger.error(`failed to get head file ${opts.file}`, {e: e});

            throw e;
        }
    }

    public async copy(opts: { bucket: string; source: string; target: string; }): Promise<void> {
        try {
            let params = <AWS.S3.Types.CopyObjectRequest>{
                Bucket: opts.bucket,
                CopySource: opts.source,
                Key: opts.target
            };

            await Promises.fromCallback(c => this.s3Client.copyObject(params, c));
        } catch (e) {
            this.logger.error(`failed to copy ${opts.source} to ${opts.target}`, {
                e: e
            });

            throw e;
        }
    }

    public async delete(opts: { bucket: string; key: string }): Promise<void> {
        try {
            let params = <AWS.S3.Types.DeleteObjectRequest>{
                Bucket: opts.bucket,
                Key: opts.key
            };

            await Promises.fromCallback(c => this.s3Client.deleteObject(params, c));
        } catch (e) {
            this.logger.error(`failed to delete ${opts.key} bucket ${opts.bucket}`, {
                e: e
            });

            throw e;
        }
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
        const params = this.createS3UploadParams(opts);

        try {
            const url = await Promises.fromCallback<string>(c => this.s3Client.getSignedUrl("putObject", params, c));

            return url;

        } catch (e) {
            this.logger.error(`failed to get signed url for upload`, {e: e});

            throw e;
        }
    }

    public async getDownloadSignedUrl(opts: S3GetSignedUrlParams): Promise<string> {

        const params = this.createS3DownloadParams(opts);

        try {
            const url = await Promises.fromCallback<string>(c => this.s3Client.getSignedUrl("getObject", params, c));

            return url;
        } catch (e) {
            this.logger.error(`failed to get signed url for download`, {e: e});

            throw e;
        }
    }
}
