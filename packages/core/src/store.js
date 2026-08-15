"use strict";
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EventStore = void 0;
var node_fs_1 = require("node:fs");
var node_path_1 = require("node:path");
var EventStore = /** @class */ (function () {
    function EventStore(dataDir, max) {
        if (max === void 0) { max = 3000; }
        this.max = max;
        this.events = [];
        this.dirty = false;
        this.persistTimer = null;
        this.file = (0, node_path_1.resolve)(dataDir, "events.json");
        this.load();
    }
    EventStore.prototype.load = function () {
        try {
            this.events = JSON.parse((0, node_fs_1.readFileSync)(this.file, "utf8"));
        }
        catch (_a) {
            this.events = [];
        }
    };
    EventStore.prototype.append = function (ev) {
        this.events.push(ev);
        if (this.events.length > this.max) {
            this.events.splice(0, this.events.length - this.max);
        }
        this.dirty = true;
        this.schedulePersist();
    };
    EventStore.prototype.schedulePersist = function () {
        var _this = this;
        if (this.persistTimer)
            return;
        this.persistTimer = setTimeout(function () {
            _this.persistTimer = null;
            if (!_this.dirty)
                return;
            _this.dirty = false;
            try {
                (0, node_fs_1.mkdirSync)((0, node_path_1.dirname)(_this.file), { recursive: true });
                (0, node_fs_1.writeFileSync)(_this.file, JSON.stringify(_this.events));
            }
            catch (_a) {
                _this.dirty = true;
            }
        }, 400);
    };
    EventStore.prototype.all = function () {
        return __spreadArray([], this.events, true);
    };
    EventStore.prototype.since = function (afterId) {
        if (!afterId)
            return this.all();
        var index = this.events.findIndex(function (e) { return e.id === afterId; });
        return index === -1 ? this.all() : this.events.slice(index + 1);
    };
    return EventStore;
}());
exports.EventStore = EventStore;
