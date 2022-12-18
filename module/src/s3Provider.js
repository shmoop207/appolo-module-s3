"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.S3Provider = void 0;
const tslib_1 = require("tslib");
const zlib = require("zlib");
const fs = require("fs");
const path = require("path");
const followRedirects = require("follow-redirects");
const urlClass = require("url");
const inject_1 = require("@appolo/inject");
const utils_1 = require("@appolo/utils");
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
        let result = await utils_1.Promises.fromCallback(c => this.s3Client.listObjectsV2(metaData, c));
        return result;
    }
    async listFilesAll(opts) {
        let metaData = {
            Bucket: opts.bucket,
            Prefix: opts.prefix,
            MaxKeys: opts.maxKeys || 1000
        };
        let result = await utils_1.Promises.fromCallback(c => this.s3Client.listObjectsV2(metaData, c));
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
        return new Promise((resolve, reject) => {
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
                    .on("error", (e) => reject(new Error("gunzip error"))));
            }
            stream.pipe(writer);
        });
    }
    async getObject(opts) {
        let options = {
            Bucket: opts.bucket,
            Key: opts.fileName
        };
        let result = await this.s3Client.getObject(options).promise();
        let body = result.Body;
        if (opts.gzip) {
            body = await utils_1.Promises.fromCallback(c => zlib.gunzip(body, {}, c));
        }
        return body;
    }
    async upload(opts) {
        try {
            const params = this.createS3UploadParams(opts);
            params.Body = opts.buffer;
            if (opts.gzip) {
                params.Body = await utils_1.Promises.fromCallback(c => zlib.gzip(opts.buffer, c));
            }
            await utils_1.Promises.fromCallback(c => this.s3Client.upload(params, c));
            this.logger.info(`file uploaded ${opts.file}`);
        }
        catch (e) {
            this.logger.error(`failed to upload file ${opts.file}`, { error: e });
            throw e;
        }
    }
    createS3DownloadParams(opts) {
        let params = {
            Bucket: opts.bucket,
            Key: opts.file
        };
        return params;
    }
    createS3UploadParams(opts) {
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
            let result = await utils_1.Promises.fromCallback(c => this.s3Client.headObject(params, c));
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
    async copy(opts) {
        try {
            let params = {
                Bucket: opts.bucket,
                CopySource: opts.source,
                Key: opts.target
            };
            await utils_1.Promises.fromCallback(c => this.s3Client.copyObject(params, c));
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
            await utils_1.Promises.fromCallback(c => this.s3Client.deleteObject(params, c));
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
        const params = this.createS3UploadParams(opts);
        try {
            const url = await utils_1.Promises.fromCallback(c => this.s3Client.getSignedUrl("putObject", params, c));
            return url;
        }
        catch (e) {
            this.logger.error(`failed to get signed url for upload`, { e: e });
            throw e;
        }
    }
    async getDownloadSignedUrl(opts) {
        const params = this.createS3DownloadParams(opts);
        if (opts.expire) {
            params.Expires = opts.expire;
        }
        try {
            const url = await utils_1.Promises.fromCallback(c => this.s3Client.getSignedUrl("getObject", params, c));
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