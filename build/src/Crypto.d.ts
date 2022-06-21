/// <reference types="node" />
export declare function init(): Promise<void>;
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
export declare function box(message: Buffer, nonce: Buffer, key: Buffer): [Buffer, Buffer];
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
export declare function unbox(ciphertext: Buffer, nonce: Buffer, key: Buffer): [Buffer, Buffer, number] | undefined;
export declare function randomBytes(count: number): Uint8Array;
declare type KeyPair = {
    publicKey: Buffer;
    secretKey: Buffer;
};
export declare function genKeyPair(): KeyPair;
export {};
