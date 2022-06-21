/**
 * A four way client-server handshake, as excellently described in https://ssbc.github.io/scuttlebutt-protocol-guide/,
 * with one added version byte and functionality to mitigate ddos attacks,
 * and added client/server data exchange for swapping application parameters.
 */
/// <reference types="node" />
import { Client } from "pocket-sockets";
import { HandshakeResult } from "./types";
/**
 * On successful handshake return a populated HandshakeResult object.
 * On unsuccessful throw exception.
 * @return Promise <HandshakeResult>
 * @throws
 */
export declare function HandshakeAsClient(client: Client, clientLongtermSk: Buffer, clientLongtermPk: Buffer, serverLongtermPk: Buffer, discriminator: Buffer, clientData?: Buffer, maxServerDataSize?: number): Promise<HandshakeResult>;
/**
 * On successful handshake return the client longterm public key the box keys and nonces and the arbitrary client 96 byte data buffer.
 * On successful handshake return a populated HandshakeResult object.
 * On failed handshake throw exception.
 * @param difficulty is the number of nibbles the client is required to calculate to mitigate ddos attacks. Difficulty 6 is a lot. 8 is max.
 * @return Promise<HandshakeResult>
 * @throws
 */
export declare function HandshakeAsServer(client: Client, serverLongtermSk: Buffer, serverLongtermPk: Buffer, discriminator: Buffer, allowedClientKey?: Function | Buffer[], serverData?: Buffer, difficulty?: number, maxClientDataSize?: number): Promise<HandshakeResult>;
