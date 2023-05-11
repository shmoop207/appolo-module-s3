"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const chai = require("chai");
const sinonChai = require("sinon-chai");
const engine_1 = require("@appolo/engine");
const s3Module_1 = require("../../../module/s3Module");
const logger_1 = require("@appolo/logger");
const s3Provider_1 = require("../../../module/src/s3Provider");
const utils_1 = require("@appolo/utils");
require('chai').should();
chai.use(sinonChai);
describe("s3 Spec", () => {
    let app, s3Provider;
    beforeEach(async () => {
        app = await (0, engine_1.createApp)({
            environment: 'testing',
            paths: []
        });
        app.module.use(logger_1.LoggerModule, s3Module_1.S3Module.for({
            awsAccessKeyId: process.env.AccessKeyId,
            awsSecretAccessKey: process.env.SecretAccessKey,
            region: process.env.Region
        }));
        await app.launch();
        s3Provider = app.injector.getObject(s3Provider_1.S3Provider);
    });
    it("should upload file", async () => {
        await s3Provider.upload({
            bucket: process.env.Bucket,
            file: "test/test.txt",
            contentType: "text/plain",
            buffer: "test", gzip: true
        });
        let result = await s3Provider.listFilesAll({ bucket: process.env.Bucket, prefix: "test" });
        result.Contents.length.should.be.eq(1);
        result.Contents[0].Key.should.be.eq("test/test.txt");
    });
    it("should get file", async () => {
        let result = await s3Provider.getObject({ bucket: process.env.Bucket, gzip: true, fileName: "test/test.txt" });
        result.toString().should.be.eq("test");
    });
    it("should get stream", async () => {
        let result = await s3Provider.downloadStream({
            bucket: process.env.Bucket,
            gzip: true,
            fileName: "test/test.txt"
        });
        let buffer = await utils_1.Streams.convertToBuffer(result);
        buffer.toString().should.be.eq("test");
    });
    it("should get head", async () => {
        let result = await s3Provider.head({ bucket: process.env.Bucket, file: "test/test.txt" });
        result.ContentLength.should.be.eq(24);
    });
    it("should get signed url", async () => {
        let result = await s3Provider.getDownloadSignedUrl({
            bucket: process.env.Bucket,
            expire: 120,
            file: "test/test.txt"
        });
        result.should.contain("X-Amz-Expires=120");
    });
    it("should get delete file", async () => {
        await s3Provider.delete({ bucket: process.env.Bucket, key: "test/test.txt" });
        let result = await s3Provider.listFilesAll({ bucket: process.env.Bucket, prefix: "test" });
        result.Contents.length.should.be.eq(0);
    });
});
//# sourceMappingURL=utilSpec.js.map