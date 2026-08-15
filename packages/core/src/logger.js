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
exports.log = exports.Logger = void 0;
var LEVELS = ["debug", "info", "warn", "error"];
function ts() {
    return new Date().toISOString();
}
var Logger = /** @class */ (function () {
    function Logger() {
        this.level = "info";
    }
    Logger.prototype.setLevel = function (level) {
        this.level = level;
    };
    Logger.prototype.enabled = function (level) {
        return LEVELS.indexOf(level) >= LEVELS.indexOf(this.level);
    };
    Logger.prototype.debug = function (msg) {
        var rest = [];
        for (var _i = 1; _i < arguments.length; _i++) {
            rest[_i - 1] = arguments[_i];
        }
        if (this.enabled("debug"))
            console.log.apply(console, __spreadArray([ts(), "DEBUG", msg], rest, false));
    };
    Logger.prototype.info = function (msg) {
        var rest = [];
        for (var _i = 1; _i < arguments.length; _i++) {
            rest[_i - 1] = arguments[_i];
        }
        if (this.enabled("info"))
            console.log.apply(console, __spreadArray([ts(), "INFO", msg], rest, false));
    };
    Logger.prototype.warn = function (msg) {
        var rest = [];
        for (var _i = 1; _i < arguments.length; _i++) {
            rest[_i - 1] = arguments[_i];
        }
        if (this.enabled("warn"))
            console.warn.apply(console, __spreadArray([ts(), "WARN", msg], rest, false));
    };
    Logger.prototype.error = function (msg) {
        var rest = [];
        for (var _i = 1; _i < arguments.length; _i++) {
            rest[_i - 1] = arguments[_i];
        }
        if (this.enabled("error"))
            console.error.apply(console, __spreadArray([ts(), "ERROR", msg], rest, false));
    };
    return Logger;
}());
exports.Logger = Logger;
exports.log = new Logger();
