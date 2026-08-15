"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listSkills = listSkills;
var node_fs_1 = require("node:fs");
var node_path_1 = require("node:path");
function firstLine(text) {
    var line = text
        .split("\n")
        .map(function (l) { return l.trim(); })
        .find(function (l) { return l.length > 0 && !l.startsWith("#"); });
    return line !== null && line !== void 0 ? line : undefined;
}
function listSkills(dirs) {
    var out = [];
    for (var _i = 0, dirs_1 = dirs; _i < dirs_1.length; _i++) {
        var dir = dirs_1[_i];
        if (!(0, node_fs_1.existsSync)(dir))
            continue;
        var isCommandDir = dir.endsWith("command");
        for (var _a = 0, _b = (0, node_fs_1.readdirSync)(dir); _a < _b.length; _a++) {
            var entry = _b[_a];
            var p = (0, node_path_1.resolve)(dir, entry);
            var st = (0, node_fs_1.statSync)(p);
            if (st.isDirectory()) {
                var skillFile = (0, node_path_1.resolve)(p, "SKILL.md");
                if ((0, node_fs_1.existsSync)(skillFile)) {
                    out.push({
                        name: entry,
                        description: firstLine((0, node_fs_1.readFileSync)(skillFile, "utf8")),
                        path: p,
                        source: "skill",
                    });
                }
            }
            else if (isCommandDir && st.isFile() && entry.endsWith(".md")) {
                out.push({
                    name: entry.replace(/\.md$/, ""),
                    description: firstLine((0, node_fs_1.readFileSync)(p, "utf8")),
                    path: p,
                    source: "command",
                });
            }
        }
    }
    return out;
}
