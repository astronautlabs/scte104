import { BitstreamReader, BitstreamWriter } from '@astronautlabs/bitstream';
import * as net from 'net';
import { Observable, Subject } from 'rxjs';
import * as Protocol from './protocol';
import * as syntax from './syntax';
import { SingleOperationMessage } from './syntax';
import { filter, take } from 'rxjs/operators';

export class ClientV2 {
    socket : net.Socket;
    private messageNumber = 300;

    async connect(host : string, port = 5167) {
        this.messageNumber = Date.now() % 255;
        this.connected = new Promise((resolve, reject) => 
            (this.resolveConnect = resolve, this.rejectConnect = reject)
        );

        this.socket = net.createConnection({ host, port });
        this.reader = new BitstreamReader();
        this.writer = new BitstreamWriter(this.socket);

        this.socket.addListener('connect', () => this.resolveConnect());
        this.socket.addListener('error', err => this.rejectConnect(err));
        this.socket.addListener('data', data => this.reader.addBuffer(data));

        this.messageHandler();

        return await this.connected;
    }

    reader : BitstreamReader;
    writer : BitstreamWriter;

    private _messageReceived = new Subject<syntax.SingleOperationMessage>();
    private resolveConnect = () => {};
    private rejectConnect = (err? : Error) => {};
    private connected : Promise<void>;

    private async messageHandler() {
        while (this.socket.readable)
            this._messageReceived.next(await SingleOperationMessage.read(this.reader));
    }

    get messageReceived() : Observable<syntax.SingleOperationMessage> {
        return this._messageReceived;
    }

    async disconnect() {
        return new Promise(resolve => this.socket.end(() => resolve()));
    }

    sendMessage(message : syntax.Message) {
        message.write(this.writer);
    }

    async request(message : syntax.SingleOperationMessage | syntax.MultipleOperationMessage): Promise<SingleOperationMessage> {
        this.sendMessage(message.with({ messageNumber: this.messageNumber++ }));
        return await this.messageReceived
            .pipe(filter(x => x.messageNumber === message.messageNumber))
            .pipe(take(1))
            .toPromise()
        ;
    }

    async init() {
        this.sendMessage(new syntax.InitRequest());
        return <syntax.InitResponse> await this.messageReceived
            .pipe(filter(x => x.opID === Protocol.OP.INIT_RESPONSE))
            .pipe(take(1))
            .toPromise();
    }

    async alive() {
        let epoch = new Date('1980-01-06T00:00:00Z').getTime();
        let elapsed = Date.now() - epoch;
        let seconds = Math.floor(elapsed / 1000);
        let microseconds = (elapsed - seconds) * 1000;
        this.sendMessage(
            new syntax.AliveRequest().with({ 
                time: new syntax.Time().with({ 
                    seconds, microseconds 
                }) 
            })
        );

        return <syntax.AliveResponse> await this.messageReceived
            .pipe(filter(x => x.opID === Protocol.OP.ALIVE_RESPONSE))
            .pipe(take(1))
            .toPromise();
    }
}