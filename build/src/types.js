"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EventType = exports.ExpectingReply = exports.MESSAGE_MAX_BYTES = void 0;
/**
 * A single message cannot exceed 65535 bytes in total.
 */
exports.MESSAGE_MAX_BYTES = 65535;
var ExpectingReply;
(function (ExpectingReply) {
    ExpectingReply[ExpectingReply["NONE"] = 0] = "NONE";
    ExpectingReply[ExpectingReply["SINGLE"] = 1] = "SINGLE";
    ExpectingReply[ExpectingReply["MULTIPLE"] = 2] = "MULTIPLE";
})(ExpectingReply = exports.ExpectingReply || (exports.ExpectingReply = {}));
;
var EventType;
(function (EventType) {
    /**
     * Data event only emitted on main event emitter on new
     * incoming messages (which are not reply messages).
     */
    EventType["ROUTE"] = "route";
    /**
     * Data event only emitted on message specific event emitters as
     * replies on sent message.
     */
    EventType["REPLY"] = "reply";
    /**
     * Socket error event emitted on all event emitters including main.
     */
    EventType["ERROR"] = "error";
    /**
     * Socket close event emitted on all event emitters including main.
     */
    EventType["CLOSE"] = "close";
    /**
     * Message reply timeout event emitted on message specific event emitters
     * who are awaiting replies on sent message.
     */
    EventType["TIMEOUT"] = "timeout";
    /**
     * Any event emitted on message specific event emitters for the events:
     * REPLY,
     * ERROR,
     * CLOSE,
     * TIMEOUT
     * This is useful for having a catch-all event handler when waiting on replies.
     */
    EventType["ANY"] = "any";
})(EventType = exports.EventType || (exports.EventType = {}));
