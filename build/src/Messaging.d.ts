/// <reference types="node" />
import { Client } from "pocket-sockets";
import EventEmitter from "eventemitter3";
import { SentMessage, Header, OutgoingQueue, IncomingQueue, EventType, SendReturn } from "./types";
export declare class Messaging {
    /**
     * Messages sent from here which are expecting replies.
     *
     */
    pendingReply: {
        [msgId: string]: SentMessage;
    };
    /**
     * Data read on socket and transformed to messages.
     */
    incomingQueue: IncomingQueue;
    /**
     * Messages transformed and sent.
     */
    outgoingQueue: OutgoingQueue;
    /**
     * The general event emitter for incoming messages and socket events.
     * Reply messages are not emitted using this object but are emitted on message specific event emitters.
     */
    eventEmitter: EventEmitter;
    /**
     * The given client socket to communicate with.
     */
    socket: Client;
    /**
     * Set to true if we have opened.
     */
    isOpened: boolean;
    /**
     * Set to true if we have closed.
     */
    isClosed: boolean;
    /**
     * Setting this activates encryption.
     */
    encryptionKeys?: {
        outgoingKey: Buffer;
        outgoingNonce: Buffer;
        incomingKey: Buffer;
        incomingNonce: Buffer;
        peerPublicKey: Buffer;
    };
    /**
     * How many messages we allow through.
     * 0 means cork it up
     * -1 means unlimited.
     */
    dispatchLimit: number;
    isBusyOut: number;
    isBusyIn: number;
    instanceId: string;
    constructor(socket: Client);
    getInstanceId(): string;
    /**
     * Pass in the params returned from a successful handshake.
     *
     * @param peerPublicKey our peer's long term public key, only stored for convenience, is not used in encryption.
     */
    setEncrypted(outgoingKey: Buffer, outgoingNonce: Buffer, incomingKey: Buffer, incomingNonce: Buffer, peerPublicKey: Buffer): Promise<void>;
    getPeerPublicKey(): Buffer | undefined;
    setUnencrypted(): void;
    /**
     * Remove a stored pending message so that it cannot receive any more replies.
     */
    cancelPendingMessage: (msgId: Buffer) => void;
    /**
     * Get the general event emitter object.
     * This is used to listen for incoming messages
     * and socket events such as close and error.
     */
    getEventEmitter(): EventEmitter;
    /**
     * Open this Messaging object for communication.
     * Don't open it until you have hooked the event emitter.
     */
    open(): void;
    isOpen(): boolean;
    /**
     * Close this Messaging object and it's socket.
     *
     */
    close(): void;
    cork(): void;
    uncork(limit?: number): void;
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
    send(target: Buffer | string, data?: Buffer, timeout?: number | undefined, stream?: boolean, timeoutStream?: number): SendReturn | undefined;
    protected getNow(): number;
    protected generateMsgId(): Buffer;
    protected encodeHeader(header: Header): Buffer;
    protected decodeHeader(buffer: Buffer): [Header, Buffer] | undefined;
    /**
    * Extract length as single buffer and modify the buffers array in place.
    *
    */
    protected extractBuffer(buffers: Buffer[], length: number): Buffer | undefined;
    protected emitEvent(eventEmitters: EventEmitter[], eventType: EventType, arg?: any): void;
    protected getAllEventEmitters(): EventEmitter[];
    /**
     * Notify all pending messages and the main emitter about the error.
     *
     */
    protected socketError: (error?: Buffer | undefined) => void;
    /**
     * Notify all pending messages about the close.
     */
    protected socketClose: (hadError: boolean) => void;
    /**
     * Buffer incoming raw data from the socket.
     * Ping decryptIncoming so it can have a go on the new data.
     */
    protected socketData: (data: Buffer) => void;
    protected processInqueue: () => Promise<void>;
    /**
     * Decrypt buffers in the inqueue and move them to the dispatch queue.
     */
    protected decryptIncoming: () => Promise<void>;
    /**
     * Assemble messages from decrypted data and put to next queue.
     *
     */
    protected assembleIncoming: () => boolean;
    /**
     * Dispatch messages on event emitters.
     *
     */
    protected dispatchIncoming: () => void;
    protected processOutqueue: () => Promise<void>;
    /**
     * Encrypt and move buffer (or just move buffers if not using encryption) to the next out queue.
     */
    protected encryptOutgoing: () => Promise<void>;
    protected dispatchOutgoing: () => void;
    /**
     * Check every pending message to see which have timeouted.
     *
     */
    protected checkTimeouts: () => void;
    protected getTimeoutedPendingMessages(): SentMessage[];
    /**
     * This pauses all timeouts for a message until the next message arrives then timeouts are re-activated (if set initially ofc).
     * This could be useful when expecting a never ending stream of messages where chunks could be time apart.
     */
    clearTimeout: (msgId: Buffer) => void;
}
/**
* Mimicking the async/await once function from the nodejs events module.
* Because EventEmitter3 module doesn't seem to support the async/await promise feature of nodejs events once() function.
*/
export declare function once(eventEmitter: EventEmitter, eventName: string | symbol): Promise<any>;
