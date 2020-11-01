import * as net from 'net';
import * as Protocol from './protocol';

/**
 * Original implementation of SCTE 104 client
 */
export class ClientV1 {
    socket : net.Socket;
    private messageNumber = 300;
    private readBuffer : Buffer = Buffer.alloc(0);
    private desiredReadLength = 0;
    private readResponder : (data : Buffer) => void;

    /**
     * DPI PID index to include in SCTE-104 messages.
     */
    dpiPidIndex = 0;

    /**
     * AS (automation system) index we are acting as 
     */
    asIndex = 0;

    /**
     * Protocol version, must be 0x0 in existing spec,
     * so this generally should not be changed.
     */
    protocolVersion = 0;

    /**
     * SCTE-35 protocol version, used for SCTE-35 specific messages.
     * Must be 0x0 in existing spec, so this generally should not 
     * be changed.
     */
    scte35ProtocolVersion = 0;

    async connect(host : string, port = 5167) {
        this.messageNumber = Date.now() % 255;
        this.connected = new Promise((resolve, reject) => 
            (this.connectedResolver = resolve, this.connectedRejecter = reject)
        );

        this.socket = net.createConnection({ host, port });
        this.socket.addListener('connect', () => this.onConnect());
        this.socket.addListener('error', err => this.onError(err))
        this.socket.addListener('close', () => this.onClose())
        this.socket.addListener('data', data => this.onData(data));

        return await this.connected;
    }

    async disconnect() {
        return new Promise(resolve => this.socket.end(() => resolve()));
    }

    private connectedResolver : () => void;
    private connectedRejecter : (err? : Error) => void;
    private connected : Promise<void>;

    private async onError(err : Error) {
        if (this.connectedRejecter) {
            this.connectedRejecter(err);
            this.connectedRejecter = null;
            this.connectedResolver = null;
        }
    }

    private async onClose() {
        console.log(`Disconnected.`);
    }
    private async onConnect() {
        if (this.connectedResolver) {
            this.connectedResolver();
            this.connectedResolver = null;
            this.connectedRejecter = null;
        }
    }

    private fireEvent(name : string, event : any) {
        (this.mappedEvents.get(name) || []).forEach(x => x(event));
    }

    private mappedEvents = new Map<string, ((event) => void)[]>();

    addEventListener(event : string, handler : (event) => void) {
        this.mappedEvents.set(
            event, 
            (this.mappedEvents.get(event) || [])
                .concat([ handler ])
        );
    }

    removeEventListener(event : string, handler : (event) => void) {
        this.mappedEvents.set(
            event, 
            (this.mappedEvents.get(event) || [])
                .filter(x => x !== handler)
        );
    }

    private async onData(data : Buffer) {
        console.log(`Receiving data (${data.length})...`);
        this.readBuffer = Buffer.concat([this.readBuffer, data]);

        // Read responders are used to continue an incomplete message that is 
        // currently being read

        if (this.readResponder) {
            this.pumpReadResponder();
            return;
        }

        // This is a new Single Operation Message

        this.readBuffer = data;
        let message = await this.readSingleOperation();

        // Send it off to any listeners
        
        if (message.opID === Protocol.OP.GENERAL_RESPONSE) {
            console.log(`(INFO) General response received:`);
            console.dir(message);
        }

        console.log(`Received 0x${message.opID.toString(16)} [${Protocol.OP.name(message.opID) || 'unknown'}]`);
        console.log(`  Message number: ${message.message_number}`);
        console.log(`  Result:         0x${message.result} [${Protocol.RESULT.name(message.result)}]`);
        console.log(`  Result (Ext):   0x${message.result_extension.toString(16)}`);
        console.log(`  Data:           ${message.messageSize} bytes total, payload=${message.data.length} byte(s)`);
        console.dir(message);

        this.fireEvent('message', { message });
    }

    private pumpReadResponder() {
        if (this.readBuffer.length < this.desiredReadLength)
            return;
        
        let subBuffer = this.readBuffer.slice(0, this.desiredReadLength);
        this.readBuffer = this.readBuffer.slice(this.desiredReadLength);
        this.readResponder(subBuffer);
        this.readResponder = null;
    }

    /**
     * Takes a 13 byte buffer and decodes it into a SingleOperationMessageHeader
     * @param buffer 
     */
    private decodeSingleOperationHeader(buffer : Buffer): Protocol.SingleOperationMessageHeader {

        if (buffer.length < 13) {
            throw new Error(
                `Cannot decodeSingleOperationHeader(): ` 
                + `Buffer must be >=13 bytes, passed length=${buffer.length}`
            );
        }

        return {
            opID: buffer.readUInt16BE(0), 
            messageSize: buffer.readUInt16BE(2), 
            result: buffer.readUInt16BE(4), 
            result_extension: buffer.readUInt16BE(6),
            protocol_version: buffer.readUInt8(8), 
            AS_index: buffer.readUInt8(9), 
            message_number: buffer.readUInt8(10), 
            DPI_PID_index: buffer.readUInt16BE(11), 
        };
    }

    private sizeOfTimestamp(timestamp : Protocol.Timestamp) {
        if (timestamp.time_type === 0)
            return 0;
        else if (timestamp.time_type === 1)
            return 7;
        else if (timestamp.time_type === 2)
            return 5;
        else if (timestamp.time_type === 3)
            return 3;

        throw new Error(`Cannot determine size of timestamp with unspecified type ${timestamp.time_type}`);
    }

    async multipleOperations(message : Protocol.MultipleOperationMessageInit) {
        await new Promise(async (resolve, reject) => {
            let buf = Buffer.alloc(10);
            let timestamp = message.timestamp || Protocol.TIME_NONE;
            let timestampSize = this.sizeOfTimestamp(timestamp) ;
            let operationCount = Buffer.alloc(1);
            operationCount.writeInt8(message.operations.length);

            let operationPayload = Buffer.concat([ operationCount ].concat(message.operations.map(x => this.prepareOperation(x))));
            let messageSize = 11 + timestampSize + operationPayload.length;

            buf.writeUInt16BE(Protocol.MULTIPLE_OPERATION_INDICATOR, 0);
            buf.writeUInt16BE(messageSize, 2);

            // Session-specific

            let messageNumber = this.messageNumber++;

            buf.writeUInt8(this.protocolVersion, 4);
            buf.writeUInt8(this.asIndex, 5);
            buf.writeUInt8(messageNumber, 6);
            buf.writeUInt16BE(this.dpiPidIndex, 7);
            buf.writeUInt8(this.scte35ProtocolVersion, 9);
            
            let handler;
            handler = (ev) => {
                let message : Protocol.SingleOperationMessage = ev.message;
                
                console.log(`MOP handler received a response`);
                if (message.opID === Protocol.OP.INJECT_RESPONSE) {
                    console.log(`MOP #${messageNumber} is acknowledged`);
                    resolve();
                }
            };
            
            console.log(`Sending MOP #${messageNumber}...`);
            this.addEventListener('message', handler);

            // Write the header, timestamp, and individual operations
            await this.write(Buffer.concat([
                buf, 
                this.encodeTimestamp(timestamp),
                operationPayload
            ]));
        });

    }

    private prepareOperation(operation : Protocol.OperationMessage) {
        let data = operation.data;
        
        if (!data) {
            switch (operation.opID) {
                case Protocol.MOP.INJECT_SECTION: {
                    let message = <Protocol.InjectSection>operation;
                    let header = Buffer.alloc(4);
                    header.writeUInt16BE(message.SCTE35_command_contents.length, 0);
                    header.writeUInt8(message.SCTE35_protocol_version, 2);
                    header.writeUInt8(message.SCTE35_command_type, 3);

                    data = Buffer.concat([ header, message.SCTE35_command_contents ]);
                } break;
                case Protocol.MOP.SPLICE: {
                    let message = <Protocol.Splice>operation;
                    let header = Buffer.alloc(14);

                    header.writeUInt8(message.splice_insert_type, 0);
                    header.writeUInt32BE(message.splice_event_id, 1);
                    header.writeUInt16BE(message.unique_program_id, 5);
                    header.writeUInt16BE(message.pre_roll_time, 7);
                    header.writeUInt16BE(message.break_duration, 9);
                    header.writeUInt8(message.avail_num, 11);
                    header.writeUInt8(message.avails_expected, 12);
                    header.writeUInt8(message.auto_return_flag, 13);

                    data = header;
                } break;
                case Protocol.MOP.INSERT_DTMF_DESCRIPTOR: {
                    let message = <Protocol.InsertDTMFDescriptor>operation;
                    let header = Buffer.alloc(1);

                    header.writeUInt8(message.preroll, 0);

                    data = Buffer.concat([header, message.dtmf]);
                } break;
                case Protocol.MOP.INSERT_TIME_DESCRIPTOR: {
                    let message = <Protocol.InsertTimeDescriptor>operation;
                    let header = Buffer.alloc(12);

                    // 6-byte number, really?
                    let subbuf = Buffer.alloc(8);
                    subbuf.writeBigUInt64BE(BigInt(message.TAI_seconds));
                    subbuf.copy(header, 0, 2);

                    header.writeUInt32BE(message.TAI_ns, 6);
                    header.writeUInt16BE(message.UTC_offset, 10);

                    data = header;
                } break;
                case Protocol.MOP.INSERT_AVAIL_DESCRIPTOR: {
                    let message = <Protocol.InsertAvailDescriptor>operation;

                    data = Buffer.alloc(1 + 4 * message.provider_avail_id.length);
                    data.writeUInt8(message.provider_avail_id.length, 0);
                    for (let i = 0, max = message.provider_avail_id.length; i < max; ++i) {
                        data.writeUInt32BE(message.provider_avail_id[i], 1 + i * 4);
                    }
                } break;
                case Protocol.MOP.INSERT_SEGMENTATION_DESCRIPTOR: {
                    let message = <Protocol.InsertSegmentationDescriptor>operation;
                    data = Buffer.alloc(18 + message.segmentation_upid.length);

                    data.writeUInt32BE(message.segmentation_event_id, 0);
                    data.writeUInt8(message.segmentation_event_cancel_indicator, 4);
                    data.writeUInt16BE(message.duration, 5);
                    data.writeUInt8(message.segmentation_upid_type, 7);
                    data.writeUInt8(message.segmentation_upid.length, 8);
                    for (let i = 0, max = message.segmentation_upid.length; i < max; ++i) 
                        data.writeUInt8(message.segmentation_upid[i], 9 + i);
                    
                    let offset = 9 + message.segmentation_upid.length;
                    data.writeUInt8(message.segmentation_type_id, offset + 0);
                    data.writeUInt8(message.segment_num, offset + 1);
                    data.writeUInt8(message.segments_expected, offset + 2);
                    data.writeUInt8(message.duration_extension_frames, offset + 3);
                    data.writeUInt8(message.delivery_not_restricted_flag, offset + 4);
                    data.writeUInt8(message.web_delivery_allowed_flag, offset + 5);
                    data.writeUInt8(message.no_regional_blackout_flag, offset + 6);
                    data.writeUInt8(message.archive_allowed_flag, offset + 7);
                    data.writeUInt8(message.device_restrictions, offset + 8);
                } break;
                case Protocol.MOP.INSERT_DESCRIPTOR: {
                    let message = <Protocol.InsertDescriptor>operation;
                    let header = Buffer.alloc(1);
                    header.writeUInt8(message.descriptor_image.length);

                    data = Buffer.concat([ header, ...message.descriptor_image ]);
                } break;
                case Protocol.MOP.INSERT_TIER: {
                    let message = <Protocol.InsertTier>operation;

                    data = Buffer.alloc(2);
                    data.writeUInt16BE(message.tier, 0);
                } break;
                case Protocol.MOP.PROPRIETARY_COMMAND: {
                    let message = <Protocol.ProprietaryCommand>operation;

                    let header = Buffer.alloc(5);
                    header.writeUInt32BE(message.proprietary_id, 0);
                    header.writeUInt8(message.proprietary_command, 4);
                    
                    data = Buffer.concat([ header, message.proprietary_data ]);
                }
            }
        }

        let header = Buffer.alloc(4);
        header.writeUInt16BE(operation.opID, 0);
        header.writeUInt16BE(data.length, 2);

        return Buffer.concat([ header, data ]);
    }

    private encodeTimestamp(timestamp : Protocol.Timestamp) {
        if (timestamp.time_type === 0) {
            let buffer = Buffer.alloc(1);
            buffer.writeUInt8(0);
            return buffer;
        } else if (timestamp.time_type === 1) {
            let buffer = Buffer.alloc(7);
            let type1 = <Protocol.TimestampType1>timestamp;

            buffer.writeUInt8(1, 0);
            buffer.writeUInt32BE(type1.UTC_seconds, 1);
            buffer.writeUInt32BE(type1.UTC_microseconds, 5);

            return buffer;

        } else if (timestamp.time_type === 2) {
            let buffer = Buffer.alloc(5);
            let type2 = <Protocol.TimestampType2>timestamp;

            buffer.writeUInt8(2,                0);
            buffer.writeUInt8(type2.hours,      1);
            buffer.writeUInt8(type2.minutes,    2);
            buffer.writeUInt8(type2.seconds,    3);
            buffer.writeUInt8(type2.frames,     4);

            return buffer;

        } else if (timestamp.time_type === 3) {
            let buffer = Buffer.alloc(3);
            let type3 = <Protocol.TimestampType3>timestamp;

            buffer.writeUInt8(3,                0);
            buffer.writeUInt8(type3.GPI_number, 1);
            buffer.writeUInt8(type3.GPI_edge,   2);

            return buffer;
        } else {
            throw new Error(`No defined time type with ID ${timestamp.time_type}`);
        }
    }

    private async readTimestamp(): Promise<Protocol.Timestamp> {
        let buf = await this.read(1);
        let time_type = buf[0];

        if (time_type === 1) {
            let moreBuf = await this.read(6);

            

            return <Protocol.TimestampType1>{
                time_type: 1,
                UTC_seconds: moreBuf.readUInt32BE(0),
                UTC_microseconds: moreBuf.readUInt32BE(4)
            };

        } else if (time_type === 2) {
            let moreBuf = await this.read(4);
            
            return <Protocol.TimestampType2>{
                time_type: 2,
                hours: moreBuf[0],
                minutes: moreBuf[1],
                seconds: moreBuf[2],
                frames: moreBuf[3],
            }

        } else if (time_type === 3) {
            let moreBuf = await this.read(2);
            
            return <Protocol.TimestampType3>{
                time_type: 3,
                GPI_edge: moreBuf[0],
                GPI_number: moreBuf[1]
            };
        }

    }

    private encodeSingleOperationHeader(header : Protocol.SingleOperationMessageHeaderInit, dataLength = 0): Buffer {
        let buffer = Buffer.alloc(Protocol.SINGLE_OPERATION_HEADER_SIZE);
        
        buffer.writeUInt16BE(header.opID, 0);
        buffer.writeUInt16BE(13 + dataLength, 2);
        buffer.writeUInt16BE(header.result, 4);
        buffer.writeUInt16BE(header.result_extension === undefined ? 0xFFFF : header.result_extension, 6);
        buffer.writeUInt8(header.protocol_version, 8);
        buffer.writeUInt8(header.AS_index, 9);
        buffer.writeUInt8(header.message_number, 10);
        buffer.writeUInt16BE(header.DPI_PID_index, 11);

        return buffer;
    }

    private write(buffer : Buffer) {
        return new Promise((resolve, reject) => {
            this.socket.write(buffer, err => {
                if (err)
                    reject(err);
                else
                    resolve();
            });
        });
    }

    private read(length : number): Promise<Buffer> {
        if (this.readResponder)
            throw new Error(`ERROR: Pending read already in progress!`);

        //console.log(`Awaiting ${length} bytes...`);
        let promiseResolve : (buffer : Buffer) => void, promiseReject : (err) => void;
        let promise = new Promise<Buffer>((resolve, reject) => (promiseResolve = resolve, promiseReject = reject));
        this.readResponder = promiseResolve;
        this.desiredReadLength = length;
        this.pumpReadResponder();

        return promise;
    }

    private async readSingleOperation(): Promise<Protocol.SingleOperationMessage> {
        //console.log(`Reading single operation header...`);
        let headerBuf = await this.read(Protocol.SINGLE_OPERATION_HEADER_SIZE);
        let responseHeader = this.decodeSingleOperationHeader(headerBuf);
        let payloadSize = responseHeader.messageSize - Protocol.SINGLE_OPERATION_HEADER_SIZE;
        
        
        //console.log(`Reading single operation payload of ${payloadSize} bytes for opID=0x${responseHeader.opID.toString(16)}...`);
        let payload = await this.read(payloadSize);

        //console.log(`single operation: success`);
        return Object.assign(responseHeader, { data: payload });
    }

    async init() {
        await new Promise(async (resolve, reject) => {
            let handler : (ev) => void;

            handler = (ev) => {
                let message : Protocol.SingleOperationMessage = ev.message;

                if (message.opID === Protocol.OP.INIT_RESPONSE) {
                    // console.log(`Init response():`);
                    // console.dir(message);
                    resolve();

                    this.removeEventListener('message', handler);
                }
            }

            this.addEventListener('message', handler);
    
            await this.writeSingleOperation({
                opID: Protocol.OP.INIT_REQUEST,
                result: 0xFFFF,
                AS_index: this.asIndex,
                DPI_PID_index: this.dpiPidIndex,
                message_number: this.messageNumber++,
                protocol_version: 0
            });
        });
    }

    private async writeSingleOperation(header : Protocol.SingleOperationMessageHeaderInit, data? : Buffer) {
        await this.write(this.encodeSingleOperationHeader(header, data ? data.length : 0));
        if (data)
            await this.write(data);
    }

    async alive() {
        await new Promise(async (resolve, reject) => {
            let epoch = new Date('1980-01-06T00:00:00Z').getTime();
            let elapsed = Date.now() - epoch;

            let seconds = Math.floor(elapsed / 1000);
            let microseconds = (elapsed - seconds) * 1000;
            let handler;

            handler = ev => {
                let message : Protocol.SingleOperationMessage = ev.message;
                if (message.opID === Protocol.OP.ALIVE_RESPONSE) {
                    this.removeEventListener('message', handler);
                    resolve();
                }
            };

            this.addEventListener('message', handler);

            await this.writeSingleOperation({
                opID: Protocol.OP.ALIVE_REQUEST,
                AS_index: this.asIndex,
                DPI_PID_index: this.dpiPidIndex,
                message_number: this.messageNumber++,
                protocol_version: 0,
                result: 0xFFFF
            }, this.encodeTime(seconds, microseconds));
        });
    }

    private encodeTime(seconds : number, microseconds : number): Buffer {
        let buf = Buffer.alloc(8);
        buf.writeUInt32BE(seconds, 0);
        buf.writeUInt32BE(microseconds, 4);
        return buf;
    }
}