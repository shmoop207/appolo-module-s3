"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.S3Client = void 0;
const tslib_1 = require("tslib");
const inject_1 = require("@appolo/inject");
const client_s3_1 = require("@aws-sdk/client-s3");
let S3Client = class S3Client {
    async get() {
        // httpOptions: {
        //     timeout: this.moduleOptions.timeout || 120000
        // },
        let s3 = new client_s3_1.S3({
            endpoint: this.moduleOptions.endpoint,
            credentials: {
                accessKeyId: process.env.AMAZON_ACCESS_KEY_ID || this.moduleOptions.awsAccessKeyId || this.moduleOptions.accessKeyId,
                secretAccessKey: process.env.AMAZON_SECRET_ACCESS_KEY || this.moduleOptions.awsSecretAccessKey || this.moduleOptions.secretAccessKey
            },
            region: this.moduleOptions.region,
        });
        return s3;
    }
};
tslib_1.__decorate([
    (0, inject_1.inject)()
], S3Client.prototype, "logger", void 0);
tslib_1.__decorate([
    (0, inject_1.inject)()
], S3Client.prototype, "moduleOptions", void 0);
S3Client = tslib_1.__decorate([
    (0, inject_1.define)(),
    (0, inject_1.singleton)(),
    (0, inject_1.factory)()
], S3Client);
exports.S3Client = S3Client;
//# sourceMappingURL=s3Client.js.map