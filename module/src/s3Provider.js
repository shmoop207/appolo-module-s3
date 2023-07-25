"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.S3Provider = void 0;
const tslib_1 = require("tslib");
const zlib = require("zlib");
const fs = require("fs");
const path = require("path");
const client_s3_1 = require("@aws-sdk/client-s3");
const followRedirects = require("follow-redirects");
const urlClass = require("url");
const inject_1 = require("@appolo/inject");
const utils_1 = require("@appolo/utils");
const s3_request_presigner_1 = require("@aws-sdk/s3-request-presigner");
let http = followRedirects.http;
let https = followRedirects.https;
let S3Provider = class S3Provider {
    async uploadDir(opts) {
        try {
            let files = await utils_1.Promises.fromCallback(c => fs.readdir(opts.sourceDir, c));
            await utils_1.Promises.map(files, file => {
                let dto = {
                    file: path.join(opts.targetDir, file),
                    gzip: opts.gzip,
                    contentType: "",
                    buffer: fs.createReadStream(path.join(opts.sourceDir, file)),
                    bucket: opts.bucket,
                    public: opts.public,
                    cache: opts.cache
                };
                return this.upload(dto);
            }, { concurrency: 5 });
        }
        catch (e) {
            this.logger.error(`failed to upload dir ${opts.sourceDir}`, { error: e });
            throw e;
        }
    }
    async listFiles(opts) {
        let metaData = {
            Bucket: opts.bucket,
            Prefix: opts.prefix,
            MaxKeys: opts.maxKeys || 1000
        };
        let result = await this.s3Client.listObjectsV2(metaData);
        return result;
    }
    async listFilesAll(opts) {
        let metaData = {
            Bucket: opts.bucket,
            Prefix: opts.prefix,
            MaxKeys: opts.maxKeys || 1000
        };
        let result = await this.s3Client.listObjectsV2(metaData);
        if (!result.Contents) {
            result.Contents = [];
        }
        if (opts.contents) {
            result.Contents = [...opts.contents, ...result.Contents];
        }
        if (!result.IsTruncated) {
            return result;
        }
        if (result.NextContinuationToken) {
            result = await this.listFilesAll(Object.assign(Object.assign({}, opts), { nextToken: result.NextContinuationToken, contents: result.Contents }));
        }
        return result;
    }
    async download(opts) {
        return new Promise(async (resolve, reject) => {
            let options = {
                Bucket: opts.bucket,
                Key: opts.fileName
            };
            let path = opts.output;
            let writer = fs.createWriteStream(path).on('finish', () => resolve(path));
            let output = await this.s3Client.getObject(options);
            let stream = output.Body
                .on('error', (e) => reject(e));
            if (opts.gzip) {
                stream = stream.pipe(zlib.createGunzip()
                    .on("error", (e) => reject(new Error("gunzip error"))));
            }
            stream.pipe(writer);
        });
    }
    async downloadStream(opts) {
        let options = {
            Bucket: opts.bucket,
            Key: opts.fileName
        };
        let output = await this.s3Client.getObject(options);
        let stream = output.Body;
        if (opts.gzip) {
            stream = stream.pipe(zlib.createGunzip());
        }
        return stream;
    }
    async getObject(opts) {
        let options = {
            Bucket: opts.bucket,
            Key: opts.fileName
        };
        let result = await this.s3Client.getObject(options);
        let stream = result.Body;
        if (opts.gzip) {
            stream = stream.pipe(zlib.createGunzip());
        }
        let buffer = await utils_1.Streams.convertToBuffer(stream);
        return buffer;
    }
    async upload(opts) {
        try {
            const params = this._createS3UploadParams(opts);
            let buffer = opts.buffer;
            if (opts.gzip) {
                buffer = await utils_1.Promises.fromCallback(c => zlib.gzip(buffer, c));
            }
            params.Body = buffer;
            await this.s3Client.putObject(params);
        }
        catch (e) {
            this.logger.error(`failed to upload file ${opts.file}`, { error: e });
            throw e;
        }
    }
    _createS3DownloadParams(opts) {
        let params = {
            Bucket: opts.bucket,
            Key: opts.file
        };
        return params;
    }
    _createS3UploadParams(opts) {
        let params = {
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
                params.Expires = opts.expires;
            }
            else {
                params.Expires = new Date(opts.expires);
            }
        }
        return params;
    }
    async head(opts) {
        try {
            let params = {
                Key: opts.file,
                Bucket: opts.bucket
            };
            let result = await this.s3Client.headObject(params);
            return result;
        }
        catch (e) {
            if (e.code === "NotFound") {
                return null;
            }
            this.logger.error(`failed to get head file ${opts.file}`, { e: e });
            throw e;
        }
    }
    async exists(opts) {
        let result = await this.head(opts);
        return result !== null;
    }
    async copy(opts) {
        try {
            let params = {
                Bucket: opts.bucket,
                CopySource: opts.source,
                Key: opts.target
            };
            await this.s3Client.copyObject(params);
        }
        catch (e) {
            this.logger.error(`failed to copy ${opts.source} to ${opts.target}`, {
                e: e
            });
            throw e;
        }
    }
    async delete(opts) {
        try {
            let params = {
                Bucket: opts.bucket,
                Key: opts.key
            };
            await this.s3Client.deleteObject(params);
        }
        catch (e) {
            this.logger.error(`failed to delete ${opts.key} bucket ${opts.bucket}`, {
                e: e
            });
            throw e;
        }
    }
    async deleteByPrefix(params) {
        var _a;
        let { bucket, prefix } = params;
        let data = await this.listFilesAll({ prefix: prefix, bucket: bucket });
        if (!((_a = data === null || data === void 0 ? void 0 : data.Contents) === null || _a === void 0 ? void 0 : _a.length)) {
            return;
        }
        await utils_1.Promises.map(data.Contents, item => this.delete({
            bucket: bucket,
            key: item.Key
        }), { concurrency: 5 });
    }
    async copyUrl(url, opts) {
        await utils_1.Promises.fromCallback(c => {
            let client = (url || "").startsWith("https://") ? https : http;
            let options = urlClass.parse(url);
            options.rejectUnauthorized = false;
            client
                .get(options, async (res) => {
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
    async getUploadSignedUrl(opts) {
        const params = this._createS3UploadParams(opts);
        try {
            let command = new client_s3_1.PutObjectCommand(params);
            const url = await (0, s3_request_presigner_1.getSignedUrl)(this.s3Client, command, { expiresIn: 3600 });
            return url;
        }
        catch (e) {
            this.logger.error(`failed to get signed url for upload`, { e: e });
            throw e;
        }
    }
    async getDownloadSignedUrl(opts) {
        const params = this._createS3DownloadParams(opts);
        try {
            let command = new client_s3_1.GetObjectCommand(params);
            const url = await (0, s3_request_presigner_1.getSignedUrl)(this.s3Client, command, { expiresIn: opts.expire || 3600 });
            return url;
        }
        catch (e) {
            this.logger.error(`failed to get signed url for download`, { e: e });
            throw e;
        }
    }
};
tslib_1.__decorate([
    (0, inject_1.inject)()
], S3Provider.prototype, "logger", void 0);
tslib_1.__decorate([
    (0, inject_1.inject)()
], S3Provider.prototype, "s3Client", void 0);
S3Provider = tslib_1.__decorate([
    (0, inject_1.define)(),
    (0, inject_1.singleton)()
], S3Provider);
exports.S3Provider = S3Provider;
//# sourceMappingURL=s3Provider.js.map