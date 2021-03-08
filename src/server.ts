import * as Protocol from './protocol';
import * as net from 'net';
import * as syntax from './syntax';
import { BitstreamReader, BitstreamWriter } from '@astronautlabs/bitstream';
import { Observable, Subject } from 'rxjs';
import { MessageEvent } from './message-event';

export class Connection {
    constructor(
        readonly socket : net.Socket,
        readonly server : Server
    ) {
        this.server.connections.push(this);
        this.reader = new BitstreamReader();
        this.writer = new BitstreamWriter(socket);
        this.socket.on('data', data => this.reader.addBuffer(data));
        this.socket.on('close', () => this.server.connections = this.server.connections.filter(x => x !== this));
        this.handle();
    }

    private reader : BitstreamReader;
    private writer : BitstreamWriter;

    private _messageReceived = new Subject<syntax.Message>();
    get messageReceived() : Observable<syntax.Message> {
        return this._messageReceived;
    }

    async sendMessage(message : syntax.Message) {
        await message.write(this.writer);
    }

    private async handle() {
        while (true) {
            if (globalThis.BITSTREAM_TRACE === true)
                console.log(`SCTE-104: Waiting for message...`);
            this.onMessageReceived(await syntax.Message.read(this.reader));
        }
    }

    private onMessageReceived(message : syntax.Message) {
        if (globalThis.BITSTREAM_TRACE === true)
            console.log(`SCTE-104: Message received (${message.constructor.name})`);
        this._messageReceived.next(message);
        this.server.onMessageReceived({ connection: this, message });
    }
}

export class Server {
    constructor(readonly port = 5167) {
    }

    private _server : net.Server;
    private _messageReceived = new Subject<MessageEvent>();

    public connections : Connection[] = [];

    onMessageReceived(event : MessageEvent) {
        this._messageReceived.next(event);
    }

    get messageReceived() : Observable<MessageEvent> {
        return this._messageReceived;
    }

    async listen() {
        this._server = new net.Server(socket => new Connection(socket, this));
        this._server.listen(this.port);
    }

    close() {
        if (this._server) {
            this._server.close();
            this._server = null;
        }
    }
}