"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EventBus = void 0;
var node_events_1 = require("node:events");
var EventBus = /** @class */ (function () {
    function EventBus() {
        this.emitter = new node_events_1.EventEmitter();
    }
    EventBus.prototype.on = function (listener) {
        var _this = this;
        this.emitter.on("event", listener);
        return function () { return _this.emitter.off("event", listener); };
    };
    EventBus.prototype.emit = function (ev) {
        this.emitter.emit("event", ev);
    };
    return EventBus;
}());
exports.EventBus = EventBus;
