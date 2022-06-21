"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.once = exports.Messaging = void 0;
const eventemitter3_1 = __importDefault(require("eventemitter3"));
const Crypto_1 = require("./Crypto");
const crypto_1 = __importDefault(require("crypto")); // Only used for synchronous randomBytes.
const types_1 = require("./types");
class Messaging {
    constructor(socket) {
        /**
         * Remove a stored pending message so that it cannot receive any more replies.
         */
        this.cancelPendingMessage = (msgId) => {
            delete this.pendingReply[msgId.toString("hex")];
        };
        /**
         * Notify all pending messages and the main emitter about the error.
         *
         */
        this.socketError = (error) => {
            const eventEmitters = this.getAllEventEmitters();
            const errorEvent = {
                error
            };
            this.emitEvent(eventEmitters, types_1.EventType.ERROR, errorEvent);
            const anyEvent = {
                type: types_1.EventType.ERROR,
                event: errorEvent
            };
            this.emitEvent(eventEmitters, types_1.EventType.ANY, anyEvent);
        };
        /**
         * Notify all pending messages about the close.
         */
        this.socketClose = (hadError) => {
            if (this.isClosed) {
                return;
            }
            this.isClosed = true;
            const eventEmitters = this.getAllEventEmitters();
            this.pendingReply = {}; // Remove all from memory
            const closeEvent = {
                hadError: Boolean(hadError)
            };
            this.emitEvent(eventEmitters, types_1.EventType.CLOSE, closeEvent);
            const anyEvent = {
                type: types_1.EventType.CLOSE,
                event: closeEvent
            };
            this.emitEvent(eventEmitters, types_1.EventType.ANY, anyEvent);
        };
        /**
         * Buffer incoming raw data from the socket.
         * Ping decryptIncoming so it can have a go on the new data.
         */
        this.socketData = (data) => {
            this.incomingQueue.encrypted.push(data);
            this.isBusyIn++;
            this.processInqueue();
        };
        this.processInqueue = async () => {
            if (this.isBusyIn <= 0) {
                return;
            }
            this.isBusyIn--;
            await this.decryptIncoming();
            if (!this.assembleIncoming()) {
                // Bad stream, close.
                this.close();
                return;
            }
            this.dispatchIncoming();
            this.processInqueue(); // In case someone increased the isBusyIn counter
        };
        /**
         * Decrypt buffers in the inqueue and move them to the dispatch queue.
         */
        this.decryptIncoming = async () => {
            if (this.encryptionKeys) {
                let chunk = Buffer.alloc(0);
                while (this.incomingQueue.encrypted.length > 0) {
                    const b = this.incomingQueue.encrypted.shift();
                    if (b) {
                        chunk = Buffer.concat([chunk, b]);
                    }
                    if (chunk.length === 0) {
                        continue;
                    }
                    // TODO: this we should do in a separate thread
                    try {
                        const ret = (0, Crypto_1.unbox)(chunk, this.encryptionKeys.incomingNonce, this.encryptionKeys.incomingKey);
                        if (!ret) {
                            // Not enough data in chunk
                            if (this.incomingQueue.encrypted.length === 0) {
                                break;
                            }
                            continue;
                        }
                        const [decrypted, nextNonce, bytesConsumed] = ret;
                        this.encryptionKeys.incomingNonce = nextNonce;
                        this.incomingQueue.decrypted.push(decrypted);
                        chunk = chunk.slice(bytesConsumed);
                    }
                    catch (e) {
                        console.error("Error unboxing message. Closing socket.");
                        this.close();
                        return;
                    }
                }
                if (chunk.length > 0) {
                    // Data rest, put ut back to queue
                    this.incomingQueue.encrypted.unshift(chunk);
                }
            }
            else {
                // Just move the buffers to the next queue as they are
                const buffers = this.incomingQueue.encrypted.slice();
                this.incomingQueue.encrypted.length = 0;
                this.incomingQueue.decrypted.push(...buffers);
            }
        };
        /**
         * Assemble messages from decrypted data and put to next queue.
         *
         */
        this.assembleIncoming = () => {
            while (this.incomingQueue.decrypted.length > 0) {
                if (this.incomingQueue.decrypted[0].length < 5) {
                    // Not enough data ready, see if we can collapse
                    if (this.incomingQueue.decrypted.length > 1) {
                        const buf = this.incomingQueue.decrypted.shift();
                        if (buf) {
                            this.incomingQueue.decrypted[0] = Buffer.concat([buf, this.incomingQueue.decrypted[0]]);
                        }
                        continue;
                    }
                    return true;
                }
                // Check version byte
                const version = this.incomingQueue.decrypted[0].readUInt8(0);
                if (version !== 0) {
                    this.incomingQueue.decrypted.length = 0;
                    console.error("Bad stream detected reading version byte.");
                    return false;
                }
                const length = this.incomingQueue.decrypted[0].readUInt32LE(1);
                const buffer = this.extractBuffer(this.incomingQueue.decrypted, length);
                if (!buffer) {
                    // Not enough data ready
                    return true;
                }
                const ret = this.decodeHeader(buffer);
                if (!ret) {
                    this.incomingQueue.decrypted.length = 0;
                    console.error("Bad stream detected in header.");
                    return false;
                }
                const [header, data] = ret;
                const inMessage = {
                    target: header.target,
                    msgId: header.msgId,
                    data,
                    expectingReply: header.config & (types_1.ExpectingReply.SINGLE + types_1.ExpectingReply.MULTIPLE), // other config bits are reserved for future use
                };
                this.incomingQueue.messages.push(inMessage);
            }
            return true;
        };
        /**
         * Dispatch messages on event emitters.
         *
         */
        this.dispatchIncoming = () => {
            while (this.incomingQueue.messages.length > 0) {
                if (this.dispatchLimit === 0) {
                    // This is corked
                    return;
                }
                else if (this.dispatchLimit > 0) {
                    this.dispatchLimit--;
                }
                else {
                    // Negative number means no limiting in place
                    // Let through
                }
                const inMessage = this.incomingQueue.messages.shift();
                if (inMessage) {
                    // Note: target is not necessarily a msg ID,
                    // but we check if it is.
                    const targetMsgId = inMessage.target.toString("hex");
                    const pendingReply = this.pendingReply[targetMsgId];
                    if (pendingReply) {
                        pendingReply.replyCounter++;
                        pendingReply.isCleared = false;
                        if (pendingReply.stream) {
                            // Expecting many replies, update timeout activity timestamp.
                            pendingReply.timestamp = this.getNow();
                        }
                        else {
                            // Remove pending message if only single message is expected
                            this.cancelPendingMessage(pendingReply.msgId);
                        }
                        // Dispatch reply on message specific event emitter
                        const replyEvent = {
                            toMsgId: inMessage.target,
                            fromMsgId: inMessage.msgId,
                            data: inMessage.data,
                            expectingReply: inMessage.expectingReply
                        };
                        this.emitEvent([pendingReply.eventEmitter], types_1.EventType.REPLY, replyEvent);
                        const anyEvent = {
                            type: types_1.EventType.REPLY,
                            event: replyEvent
                        };
                        this.emitEvent([pendingReply.eventEmitter], types_1.EventType.ANY, anyEvent);
                    }
                    else {
                        // This is not a reply message (or the message was cancelled).
                        // Dispatch on main event emitter.
                        // Do alphanumric check on target string. A-Z, a-z, 0-9, ._-
                        if (inMessage.target.some(char => {
                            if (char >= 49 && char <= 57) {
                                return false;
                            }
                            if (char >= 65 && char <= 90) {
                                return false;
                            }
                            if (char >= 97 && char <= 122) {
                                return false;
                            }
                            if ([45, 46, 95].includes(char)) {
                                return false;
                            }
                            return true; // non alpha-numeric found
                        })) {
                            // Non alphanumeric found
                            // Ignore this message
                            return;
                        }
                        const routeEvent = {
                            target: inMessage.target.toString(),
                            fromMsgId: inMessage.msgId,
                            data: inMessage.data,
                            expectingReply: inMessage.expectingReply
                        };
                        this.emitEvent([this.eventEmitter], types_1.EventType.ROUTE, routeEvent);
                    }
                }
            }
        };
        this.processOutqueue = async () => {
            if (this.isBusyOut <= 0) {
                return;
            }
            this.isBusyOut--;
            await this.encryptOutgoing();
            this.dispatchOutgoing();
            this.processOutqueue(); // In case isBusyOut counter got increased
        };
        /**
         * Encrypt and move buffer (or just move buffers if not using encryption) to the next out queue.
         */
        this.encryptOutgoing = async () => {
            if (this.encryptionKeys) {
                while (this.outgoingQueue.unencrypted.length > 0) {
                    const chunk = this.outgoingQueue.unencrypted.shift();
                    if (!chunk) {
                        continue;
                    }
                    // TODO: here we should use another thread to do the heavy work.
                    const [encrypted, nextNonce] = (0, Crypto_1.box)(chunk, this.encryptionKeys.outgoingNonce, this.encryptionKeys.outgoingKey);
                    this.encryptionKeys.outgoingNonce = nextNonce;
                    this.outgoingQueue.encrypted.push(encrypted);
                }
            }
            else {
                const buffers = this.outgoingQueue.unencrypted.slice();
                this.outgoingQueue.unencrypted.length = 0;
                this.outgoingQueue.encrypted.push(...buffers);
            }
        };
        this.dispatchOutgoing = () => {
            const buffers = this.outgoingQueue.encrypted.slice();
            this.outgoingQueue.encrypted.length = 0;
            for (let index = 0; index < buffers.length; index++) {
                this.socket.send(buffers[index]);
            }
        };
        /**
         * Check every pending message to see which have timeouted.
         *
         */
        this.checkTimeouts = () => {
            if (!this.isOpened || this.isClosed) {
                return;
            }
            const timeouted = this.getTimeoutedPendingMessages();
            for (let index = 0; index < timeouted.length; index++) {
                const sentMessage = timeouted[index];
                this.cancelPendingMessage(sentMessage.msgId);
            }
            for (let index = 0; index < timeouted.length; index++) {
                const sentMessage = timeouted[index];
                const timeoutEvent = {};
                this.emitEvent([sentMessage.eventEmitter], types_1.EventType.TIMEOUT, timeoutEvent);
                const anyEvent = {
                    type: types_1.EventType.TIMEOUT,
                    event: timeoutEvent
                };
                this.emitEvent([sentMessage.eventEmitter], types_1.EventType.ANY, anyEvent);
            }
            setTimeout(this.checkTimeouts, 500);
        };
        /**
         * This pauses all timeouts for a message until the next message arrives then timeouts are re-activated (if set initially ofc).
         * This could be useful when expecting a never ending stream of messages where chunks could be time apart.
         */
        this.clearTimeout = (msgId) => {
            const sentMessage = this.pendingReply[msgId.toString("hex")];
            if (sentMessage) {
                sentMessage.isCleared = true;
            }
        };
        this.socket = socket;
        this.pendingReply = {};
        this.isOpened = false;
        this.isClosed = false;
        this.dispatchLimit = -1;
        this.isBusyOut = 0;
        this.isBusyIn = 0;
        this.instanceId = Buffer.from(crypto_1.default.randomBytes(8)).toString("hex");
        this.incomingQueue = {
            encrypted: [],
            decrypted: [],
            messages: []
        };
        this.outgoingQueue = {
            unencrypted: [],
            encrypted: []
        };
        this.eventEmitter = new eventemitter3_1.default();
    }
    getInstanceId() {
        return this.instanceId;
    }
    /**
     * Pass in the params returned from a successful handshake.
     *
     * @param peerPublicKey our peer's long term public key, only stored for convenience, is not used in encryption.
     */
    async setEncrypted(outgoingKey, outgoingNonce, incomingKey, incomingNonce, peerPublicKey) {
        await (0, Crypto_1.init)(); // init sodium
        this.encryptionKeys = {
            outgoingKey,
            outgoingNonce,
            incomingKey,
            incomingNonce,
            peerPublicKey,
        };
    }
    getPeerPublicKey() {
        var _a;
        return ((_a = this.encryptionKeys) === null || _a === void 0 ? void 0 : _a.peerPublicKey) || undefined;
    }
    setUnencrypted() {
        this.encryptionKeys = undefined;
    }
    /**
     * Get the general event emitter object.
     * This is used to listen for incoming messages
     * and socket events such as close and error.
     */
    getEventEmitter() {
        return this.eventEmitter;
    }
    /**
     * Open this Messaging object for communication.
     * Don't open it until you have hooked the event emitter.
     */
    open() {
        if (this.isOpened || this.isClosed) {
            return;
        }
        this.isOpened = true;
        this.socket.onError(this.socketError);
        this.socket.onClose(this.socketClose);
        this.socket.onData(this.socketData);
        this.checkTimeouts();
    }
    isOpen() {
        return this.isOpened && !this.isClosed;
    }
    /**
     * Close this Messaging object and it's socket.
     *
     */
    close() {
        if (!this.isOpened) {
            return;
        }
        if (this.isClosed) {
            return;
        }
        this.socket.close();
    }
    cork() {
        this.dispatchLimit = 0;
    }
    uncork(limit) {
        this.dispatchLimit = limit !== null && limit !== void 0 ? limit : -1;
    }
    /**
     * Send message to remote.
     *
     * The returned EventEmitter can be hooked as eventEmitter.on("reply", fn) or
     *  const data: ReplyEvent = await once(eventEmitter, "reply");
     *  Other events are "close" (CloseEvent) and "any" which trigger both for "reply", "close" and "error" (ErrorEvent). There is also "timeout" (TimeoutEvent).
     *
     * A timeouted message is removed from memory and a TIMEOUT is emitted.
     *
     * @param target: Buffer | string either set as routing target as string, or as message ID in reply to (as buffer).
     *  The receiving Messaging instance will check if target matches a msg ID which is waiting for a reply and in such case the message till be emitted on that EventEmitter,
     *  or else it will pass it to the router to see if it matches some route.
     * @param data: Buffer of data to be sent. Note that data cannot exceed MESSAGE_MAX_BYTES (64 KiB).
     * @param timeout milliseconds to wait for the first reply (defaults to undefined)
     *     undefined means we are not expecting a reply
     *     0 or greater means that we are expecting a reply, 0 means wait forever
     * @param stream set to true if expecting multiple replies (defaults to false)
     *     This requires that timeout is set to 0 or greater
     * @param timeoutStream milliseconds to wait for secondary replies, 0 means forever (default).
     *     Only relevant if expecting multiple replies (stream = true).
     * @return SendReturn | undefined
     *     msgId is always set
     *     eventEmitter property is set if expecting reply
     */
    send(target, data, timeout = undefined, stream = false, timeoutStream = 0) {
        if (!this.isOpened) {
            return undefined;
        }
        if (this.isClosed) {
            return undefined;
        }
        if (typeof target === "string") {
            target = Buffer.from(target);
        }
        data = data !== null && data !== void 0 ? data : Buffer.alloc(0);
        if (data.length > types_1.MESSAGE_MAX_BYTES) {
            throw `Data chunk to send cannot exceed ${types_1.MESSAGE_MAX_BYTES} bytes. Trying to send ${data.length} bytes`;
        }
        if (target.length > 255) {
            throw "target length cannot exceed 255 bytes";
        }
        const msgId = this.generateMsgId();
        const expectingReply = typeof timeout === "number" ? (stream ? types_1.ExpectingReply.MULTIPLE : types_1.ExpectingReply.SINGLE) : types_1.ExpectingReply.NONE;
        const header = {
            version: 0,
            target,
            dataLength: data.length,
            msgId,
            config: expectingReply
        };
        const headerBuffer = this.encodeHeader(header);
        this.outgoingQueue.unencrypted.push(headerBuffer);
        this.outgoingQueue.unencrypted.push(data);
        this.isBusyOut++;
        setImmediate(this.processOutqueue);
        if (expectingReply === types_1.ExpectingReply.NONE) {
            return { msgId };
        }
        const eventEmitter = new eventemitter3_1.default();
        this.pendingReply[msgId.toString("hex")] = {
            timestamp: this.getNow(),
            msgId,
            timeout: Number(timeout),
            stream: Boolean(stream),
            eventEmitter,
            timeoutStream: timeoutStream,
            replyCounter: 0,
            isCleared: false,
        };
        return { eventEmitter, msgId };
    }
    getNow() {
        return Date.now();
    }
    generateMsgId() {
        const msgId = Buffer.from(crypto_1.default.randomBytes(4));
        return msgId;
    }
    encodeHeader(header) {
        if (header.target.length > 255) {
            throw "Target length cannot exceed 255 bytes.";
        }
        if (header.msgId.length !== 4) {
            throw "msgId length must be exactly 4 bytes long.";
        }
        const headerLength = 1 + 4 + 1 + 4 + 1 + header.target.length;
        const totalLength = headerLength + header.dataLength;
        const buffer = Buffer.alloc(headerLength);
        let pos = 0;
        buffer.writeUInt8(pos, header.version);
        pos++;
        buffer.writeUInt32LE(totalLength, pos);
        pos = pos + 4;
        buffer.writeUInt8(header.config, pos);
        pos++;
        header.msgId.copy(buffer, pos);
        pos = pos + header.msgId.length;
        buffer.writeUInt8(header.target.length, pos);
        pos++;
        header.target.copy(buffer, pos);
        return buffer;
    }
    decodeHeader(buffer) {
        let pos = 0;
        const version = buffer.readUInt8(pos);
        if (version !== 0) {
            throw "Unexpected version nr. Only supporting version 0.";
        }
        pos++;
        const totalLength = buffer.readUInt32LE(pos);
        if (totalLength !== buffer.length) {
            throw "Mismatch in expected length and provided buffer length.";
        }
        pos = pos + 4;
        const config = buffer.readUInt8(pos);
        pos++;
        const msgId = buffer.slice(pos, pos + 4);
        pos = pos + 4;
        const targetLength = buffer.readUInt8(pos);
        pos++;
        const target = buffer.slice(pos, pos + targetLength);
        pos = pos + targetLength;
        const data = buffer.slice(pos);
        const dataLength = data.length;
        const header = {
            version,
            target,
            msgId,
            config,
            dataLength
        };
        return [header, data];
    }
    /**
    * Extract length as single buffer and modify the buffers array in place.
    *
    */
    extractBuffer(buffers, length) {
        let count = 0;
        for (let index = 0; index < buffers.length; index++) {
            count = count + buffers[index].length;
        }
        if (count < length) {
            // Not enough data ready.
            return undefined;
        }
        let extracted = Buffer.alloc(0);
        while (extracted.length < length) {
            const bytesNeeded = length - extracted.length;
            const buffer = buffers[0];
            if (buffer.length <= bytesNeeded) {
                // Take the whole buffer and remove it from list
                buffers.shift();
                extracted = Buffer.concat([extracted, buffer]);
            }
            else {
                // Take part of the buffer and modify it in place
                extracted = Buffer.concat([extracted, buffer.slice(0, bytesNeeded)]);
                buffers[0] = buffer.slice(bytesNeeded);
            }
        }
        return extracted;
    }
    emitEvent(eventEmitters, eventType, arg) {
        for (let index = 0; index < eventEmitters.length; index++) {
            eventEmitters[index].emit(eventType, arg);
        }
    }
    getAllEventEmitters() {
        const eventEmitters = [];
        for (let msgId in this.pendingReply) {
            eventEmitters.push(this.pendingReply[msgId].eventEmitter);
        }
        eventEmitters.push(this.eventEmitter);
        return eventEmitters;
    }
    getTimeoutedPendingMessages() {
        const timeouted = [];
        const now = this.getNow();
        for (let msgId in this.pendingReply) {
            const sentMessage = this.pendingReply[msgId];
            if (sentMessage.isCleared) {
                continue;
            }
            if (sentMessage.replyCounter === 0) {
                if (sentMessage.timeout && now > sentMessage.timestamp + sentMessage.timeout) {
                    timeouted.push(sentMessage);
                }
            }
            else {
                if (sentMessage.timeoutStream && now > sentMessage.timestamp + sentMessage.timeoutStream) {
                    timeouted.push(sentMessage);
                }
            }
        }
        return timeouted;
    }
}
exports.Messaging = Messaging;
/**
* Mimicking the async/await once function from the nodejs events module.
* Because EventEmitter3 module doesn't seem to support the async/await promise feature of nodejs events once() function.
*/
function once(eventEmitter, eventName) {
    return new Promise((resolve, reject) => {
        try {
            eventEmitter.once(eventName, resolve);
        }
        catch (e) {
            reject(e);
        }
    });
}
exports.once = once;
