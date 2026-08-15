"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.tokenMatches = tokenMatches;
exports.ensureToken = ensureToken;
var node_crypto_1 = require("node:crypto");
var node_fs_1 = require("node:fs");
var node_path_1 = require("node:path");
function tokenMatches(provided, cfg) {
    if (!provided || cfg.tokens.length === 0)
        return false;
    return cfg.tokens.includes(provided);
}
function ensureToken(cfg) {
    if (cfg.tokens.length > 0)
        return cfg.tokens[0];
    var file = (0, node_path_1.resolve)(cfg.dataDir, ".token");
    if ((0, node_fs_1.existsSync)(file)) {
        var existing = (0, node_fs_1.readFileSync)(file, "utf8").trim();
        if (existing)
            return existing;
    }
    var token = (0, node_crypto_1.randomBytes)(24).toString("hex");
    (0, node_fs_1.mkdirSync)(cfg.dataDir, { recursive: true });
    (0, node_fs_1.writeFileSync)(file, token, { mode: 384 });
    return token;
}
