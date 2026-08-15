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
exports.Relay = void 0;
var node_crypto_1 = require("node:crypto");
var bus_js_1 = require("./bus.js");
var store_js_1 = require("./store.js");
var Relay = /** @class */ (function () {
    function Relay(opts) {
        this.bus = new bus_js_1.EventBus();
        this.instructions = [];
        this.commands = [];
        this.approvals = new Map();
        this.approvalWaiters = new Map();
        this.sources = new Set();
        this.store = new store_js_1.EventStore(opts.dataDir);
        this.push = opts.push;
    }
    Relay.prototype.emit = function (input, notify) {
        var ev = __assign({ id: (0, node_crypto_1.randomUUID)(), ts: Date.now() }, input);
        this.store.append(ev);
        this.bus.emit(ev);
        if (notify && this.push)
            void this.push.send(notify);
        return ev;
    };
    Relay.prototype.history = function (sinceId) {
        return this.store.since(sinceId);
    };
    Relay.prototype.registerSource = function (name) {
        this.sources.add(name);
    };
    Relay.prototype.sourcesList = function () {
        return __spreadArray([], this.sources, true);
    };
    Relay.prototype.sessions = function () {
        return [];
    };
    Relay.prototype.enqueueInstruction = function (text, session) {
        var ins = { id: (0, node_crypto_1.randomUUID)(), ts: Date.now(), text: text, source: "phone", session: session };
        this.instructions.push(ins);
        this.emit({
            kind: "instruction.received",
            source: "relay",
            session: session,
            title: "New instruction from phone",
            message: text,
        });
        return ins;
    };
    Relay.prototype.nextInstruction = function () {
        return this.instructions.shift();
    };
    Relay.prototype.enqueueCommand = function (command, args, session) {
        var cmd = { id: (0, node_crypto_1.randomUUID)(), ts: Date.now(), command: command, args: args, session: session };
        this.commands.push(cmd);
        this.emit({
            kind: "command.request",
            source: "relay",
            session: session,
            title: "Command from phone",
            message: "/".concat(command).concat((args === null || args === void 0 ? void 0 : args.length) ? " " + args.join(" ") : ""),
        });
        return cmd;
    };
    Relay.prototype.nextCommand = function () {
        return this.commands.shift();
    };
    Relay.prototype.askApproval = function (agent, question, options, session) {
        var _this = this;
        var req = { id: (0, node_crypto_1.randomUUID)(), ts: Date.now(), agent: agent, question: question, options: options, session: session };
        this.approvals.set(req.id, req);
        this.emit({
            kind: "approval.request",
            source: "relay",
            session: session,
            agent: agent,
            title: "Approval needed",
            message: question,
            data: { requestId: req.id, options: options },
        }, { title: "Approval needed", message: question, priority: 3, tags: ["warning"] });
        return new Promise(function (resolve) { return _this.approvalWaiters.set(req.id, resolve); });
    };
    Relay.prototype.respondApproval = function (requestId, answer) {
        var waiter = this.approvalWaiters.get(requestId);
        var req = this.approvals.get(requestId);
        if (!waiter || !req)
            return undefined;
        var resp = { requestId: requestId, answer: answer, ts: Date.now() };
        this.approvalWaiters.delete(requestId);
        this.approvals.delete(requestId);
        waiter(resp);
        this.emit({
            kind: "approval.response",
            source: "relay",
            session: req.session,
            agent: req.agent,
            title: "Approval response",
            message: "".concat(req.question, " -> ").concat(answer),
            data: { requestId: requestId, answer: answer },
        });
        return resp;
    };
    Relay.prototype.pendingApprovals = function () {
        return __spreadArray([], this.approvals.values(), true);
    };
    Relay.prototype.agentEvent = function (kind, source, opts) {
        if (opts === void 0) { opts = {}; }
        return this.emit(__assign({ kind: kind, source: source }, opts));
    };
    return Relay;
}());
exports.Relay = Relay;
