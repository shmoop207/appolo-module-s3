import {IModuleParams, Module, module} from "@appolo/engine";
import {IOptions} from "./src/IOptions";
import {S3Provider} from "../index";

@module()
export class S3Module extends Module<IOptions> {


    public static for(options: IOptions): IModuleParams {
        return {type: S3Module, options}
    }

    protected readonly Defaults: Partial<IOptions> = {
        id: "s3Provider",
        region: "us-east-1",
        timeout: 120000
    };


    public get exports() {
        return [{id: this.moduleOptions.id, type: S3Provider}];

    }

}
