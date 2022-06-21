"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.genKeyPair = exports.randomBytes = exports.unbox = exports.box = exports.init = void 0;
const libsodium_wrappers_1 = __importDefault(require("libsodium-wrappers"));
async function init() {
    await libsodium_wrappers_1.default.ready;
}
exports.init = init;
function increaseNonce(nonceOriginal) {
    const nonce = Buffer.from(nonceOriginal);
    for (let index = nonce.length - 1; index >= 0; index--) {
        const value = nonce.readUInt8(index);
        if (value < 255) {
            nonce.writeUInt8(value + 1, index);
            break;
        }
        nonce.writeUInt8(0, index);
    }
    return nonce;
}
/**
 * Box a message and return it.
 * Will increase nonce two times and return the next nonce to be used.
 *
 * @param {Buffer} message The message to be encrypted (max length 65535 bytes)
 * @param {Buffer} nonce An unused nonce to use (24 bytes)
 * @param {Buffer} key The key to encrypt with (32 bytes)
 * @return [boxedMessage, nextNonce]
 * @throws
 */
function box(message, nonce, key) {
    if (message.length > 65535) {
        throw "Maximum message length is 65535 when boxing it";
    }
    const encryptedBody = libsodium_wrappers_1.default.crypto_secretbox_easy(message, nonce, key);
    const headerNonce = increaseNonce(nonce);
    const bodyAuthTag = Buffer.from(encryptedBody.slice(0, 16));
    const bodyLength = Buffer.alloc(2);
    bodyLength.writeUInt16BE(message.length, 0);
    const header = Buffer.concat([bodyLength, bodyAuthTag]); // 18 bytes
    const encryptedHeader = libsodium_wrappers_1.default.crypto_secretbox_easy(header, headerNonce, key); // 34 bytes
    const nextNonce = increaseNonce(headerNonce);
    const ciphertext = Buffer.concat([Buffer.from(encryptedHeader), Buffer.from(encryptedBody.slice(16))]);
    return [ciphertext, nextNonce];
}
exports.box = box;
/**
 * Will increase nonce two times and return the next nonce to be used.
 * Returns undefined if not enough data available.
 *
 * @param {Buffer} ciphertext The ciphertext to be decrypted
 * @param {Buffer} nonce The first nonce to decrypt with
 * @param {Buffer} key The key to decrypt with
 * @return [unboxedMessage: Buffer, nextNonce: Buffer, bytesConsumed: number] | undefined
 * @throws
 */
function unbox(ciphertext, nonce, key) {
    if (ciphertext.length < 34) {
        // Not enough data available.
        return undefined;
    }
    const encrypted_header = ciphertext.slice(0, 34);
    const headerNonce = increaseNonce(nonce);
    const headerArray = libsodium_wrappers_1.default.crypto_secretbox_open_easy(encrypted_header, headerNonce, key);
    if (!headerArray) {
        throw "Could not unbox header";
    }
    const header = Buffer.from(headerArray);
    const bodyLength = header.readUInt16BE(0);
    if (ciphertext.length < 34 + bodyLength) {
        // Not enough data available.
        return undefined;
    }
    const encryptedBody = ciphertext.slice(34, 34 + bodyLength);
    const body = libsodium_wrappers_1.default.crypto_secretbox_open_easy(Buffer.concat([header.slice(2), encryptedBody]), nonce, key);
    if (!body) {
        throw "Could not unbox body";
    }
    const nextNonce = increaseNonce(headerNonce);
    return [Buffer.from(body), nextNonce, 34 + bodyLength];
}
exports.unbox = unbox;
function randomBytes(count) {
    return libsodium_wrappers_1.default.randombytes_buf(count);
}
exports.randomBytes = randomBytes;
function genKeyPair() {
    const keyPair = libsodium_wrappers_1.default.crypto_sign_keypair();
    return {
        publicKey: Buffer.from(keyPair.publicKey),
        secretKey: Buffer.from(keyPair.privateKey)
    };
}
exports.genKeyPair = genKeyPair;
