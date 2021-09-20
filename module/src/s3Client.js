"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.S3Client = void 0;
const tslib_1 = require("tslib");
const inject_1 = require("@appolo/inject");
const AWS = require("aws-sdk");
let S3Client = class S3Client {
    async get() {
        let s3 = new AWS.S3({
            httpOptions: {
                timeout: this.moduleOptions.timeout || 120000
            },
            region: this.moduleOptions.region,
            accessKeyId: process.env.AMAZON_ACCESS_KEY_ID || this.moduleOptions.awsAccessKeyId,
            secretAccessKey: process.env.AMAZON_SECRET_ACCESS_KEY || this.moduleOptions.awsSecretAccessKey
        });
        return s3;
    }
};
(0, tslib_1.__decorate)([
    (0, inject_1.inject)()
], S3Client.prototype, "logger", void 0);
(0, tslib_1.__decorate)([
    (0, inject_1.inject)()
], S3Client.prototype, "moduleOptions", void 0);
S3Client = (0, tslib_1.__decorate)([
    (0, inject_1.define)(),
    (0, inject_1.singleton)(),
    (0, inject_1.factory)()
], S3Client);
exports.S3Client = S3Client;
//# sourceMappingURL=s3Client.js.map