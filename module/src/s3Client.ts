"use strict";
import {define, factory, IFactory, inject, singleton} from '@appolo/inject'
import {ILogger} from '@appolo/logger';
import {IOptions} from "./IOptions";
import {S3} from "@aws-sdk/client-s3";

@define()
@singleton()
@factory()
export class S3Client implements IFactory<S3> {

    @inject() protected logger: ILogger;
    @inject() protected moduleOptions: IOptions;


    public async get(): Promise<S3> {

        // httpOptions: {
        //     timeout: this.moduleOptions.timeout || 120000
        // },

        let s3 = new S3({

            credentials: {
                accessKeyId: process.env.AMAZON_ACCESS_KEY_ID || this.moduleOptions.awsAccessKeyId,
                secretAccessKey: process.env.AMAZON_SECRET_ACCESS_KEY || this.moduleOptions.awsSecretAccessKey
            },
            region: this.moduleOptions.region,


        });

        return s3;
    }

}
