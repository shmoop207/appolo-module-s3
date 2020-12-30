"use strict";
import {define, factory, IFactory, inject, singleton} from '@appolo/inject'
import {ILogger} from '@appolo/logger';
import {IOptions} from "./IOptions";
import AWS = require("aws-sdk");

@define()
@singleton()
@factory()
export class S3Client implements IFactory<AWS.S3> {

    @inject() protected logger: ILogger;
    @inject() protected moduleOptions: IOptions;


    public async get(): Promise<AWS.S3> {

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

}
