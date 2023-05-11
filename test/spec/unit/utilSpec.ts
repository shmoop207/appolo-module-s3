import chai = require('chai');
import sinonChai = require("sinon-chai");
import {App, createApp} from '@appolo/engine';
import {S3Module} from "../../../module/s3Module";
import {LoggerModule} from "@appolo/logger";
import {S3Provider} from "../../../module/src/s3Provider";
import {Streams} from "@appolo/utils";


require('chai').should();
chai.use(sinonChai);

describe("s3 Spec", () => {

    let app: App, s3Provider: S3Provider

    beforeEach(async () => {
        app = await createApp({
            environment: 'testing',
            paths: []
        });

        app.module.use(LoggerModule, S3Module.for({
            awsAccessKeyId: process.env.AccessKeyId,
            awsSecretAccessKey: process.env.SecretAccessKey,
            region: process.env.Region
        }));

        await app.launch();

        s3Provider = app.injector.getObject<S3Provider>(S3Provider);

    });


    it("should upload file", async () => {
        await s3Provider.upload({
            bucket: process.env.Bucket,
            file: "test/test.txt",
            contentType: "text/plain",
            buffer: "test", gzip: true
        })

        let result = await s3Provider.listFilesAll({bucket: process.env.Bucket, prefix: "test"})

        result.Contents.length.should.be.eq(1);
        result.Contents[0].Key.should.be.eq("test/test.txt");
    })

    it("should get file", async () => {

        let result = await s3Provider.getObject({bucket: process.env.Bucket, gzip: true, fileName: "test/test.txt"})

        result.toString().should.be.eq("test");
    });

    it("should get stream", async () => {
        let result = await s3Provider.downloadStream({
            bucket: process.env.Bucket,
            gzip: true,
            fileName: "test/test.txt"
        })
        let buffer = await Streams.convertToBuffer(result);
        buffer.toString().should.be.eq("test");
    });

    it("should get head", async () => {
        let result = await s3Provider.head({bucket: process.env.Bucket, file: "test/test.txt"})
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
        await s3Provider.delete({bucket: process.env.Bucket, key: "test/test.txt"})

        let result = await s3Provider.listFilesAll({bucket: process.env.Bucket, prefix: "test"})

        result.Contents.length.should.be.eq(0);

    });
});
