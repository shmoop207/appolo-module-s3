"use strict";
var S3Module_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.S3Module = void 0;
const tslib_1 = require("tslib");
const engine_1 = require("@appolo/engine");
const index_1 = require("../index");
let S3Module = S3Module_1 = class S3Module extends engine_1.Module {
    constructor() {
        super(...arguments);
        this.Defaults = {
            id: "s3Provider",
            region: "us-east-1",
            timeout: 120000
        };
    }
    static for(options) {
        return { type: S3Module_1, options };
    }
    get exports() {
        return [{ id: this.moduleOptions.id, type: index_1.S3Provider }];
    }
};
S3Module = S3Module_1 = tslib_1.__decorate([
    engine_1.module()
], S3Module);
exports.S3Module = S3Module;
//# sourceMappingURL=s3Module.js.map