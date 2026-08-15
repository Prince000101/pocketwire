"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_DATA_DIR = void 0;
exports.configPath = configPath;
exports.loadConfig = loadConfig;
exports.ensureDataDir = ensureDataDir;
var node_fs_1 = require("node:fs");
var node_path_1 = require("node:path");
var HOME = (_a = process.env.HOME) !== null && _a !== void 0 ? _a : ".";
exports.DEFAULT_DATA_DIR = (0, node_path_1.resolve)(HOME, ".pocketwire");
function defaultSkillsDirs() {
    return [
        (0, node_path_1.resolve)(HOME, ".agents", "skills"),
        (0, node_path_1.resolve)(HOME, ".config", "opencode", "skills"),
        (0, node_path_1.resolve)(HOME, ".config", "opencode", "command"),
    ];
}
var DEFAULTS = {
    host: "127.0.0.1",
    port: 8787,
    tokens: [],
    skillsDirs: defaultSkillsDirs(),
    dataDir: exports.DEFAULT_DATA_DIR,
};
function configPath() {
    var _a;
    return (_a = process.env.POCKETWIRE_CONFIG) !== null && _a !== void 0 ? _a : (0, node_path_1.resolve)(HOME, ".config", "pocketwire", "pocketwire.json");
}
function loadConfig(path) {
    var _a;
    var file = path !== null && path !== void 0 ? path : configPath();
    var base = __assign(__assign({}, DEFAULTS), { skillsDirs: defaultSkillsDirs(), dataDir: exports.DEFAULT_DATA_DIR });
    if (!(0, node_fs_1.existsSync)(file))
        return base;
    var raw = JSON.parse((0, node_fs_1.readFileSync)(file, "utf8"));
    return __assign(__assign(__assign({}, base), raw), { skillsDirs: (_a = raw.skillsDirs) !== null && _a !== void 0 ? _a : base.skillsDirs });
}
function ensureDataDir(dataDir) {
    (0, node_fs_1.mkdirSync)(dataDir, { recursive: true });
}
