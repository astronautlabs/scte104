
import { htons, ntohs, htonl, ntohl } from 'network-byte-order';

import * as net from 'net';
import { 
    TIME_NONE, OP_MULTI_OPERATION, OP_INJECT_SECTION, OP_SPLICE, 
    OP_INSERT_DTMF_DESCRIPTOR, OP_INSERT_TIME_DESCRIPTOR, 
    OP_INSERT_AVAIL_DESCRIPTOR, OP_INSERT_SEGMENTATION_DESCRIPTOR, 
    OP_INSERT_DESCRIPTOR, OP_INSERT_TIER, OP_PROPRIETARY_COMMAND, 
    SINGLE_OPERATION_HEADER_SIZE, OP_INIT_REQUEST, OP_ALIVE_REQUEST,
    SingleOperationMessageHeader, SingleOperationMessage, 
    SingleOperationMessageHeaderInit, MultipleOperationMessageInit, 
    Timestamp, OperationMessage, InjectSection, Splice, InsertDTMFDescriptor, InsertTimeDescriptor, InsertAvailDescriptor, InsertSegmentationDescriptor, InsertDescriptor, InsertTier, ProprietaryCommand, TimestampType1, TimestampType2, TimestampType3
} from './protocol';

export class Client {
    socket : net.Socket;
    messageNumber = 0;
    readBuffer : Buffer;
    desiredReadLength = 0;
    readResponder : (data : Buffer) => void;

    dpiPidIndex = 0;
    asIndex = 0;
    protocolVersion = 0;
    scte35ProtocolVersion = 0;

    connect(host : string, port = 5167) {
        this.socket = net.createConnection({ host, port });        

        this.socket.addListener('connect', () => this.onConnect());
        this.socket.addListener('data', data => this.onData(data));
    }

    private async onConnect() {

    }

    private onData(data : Buffer) {
        this.readBuffer = Buffer.concat([this.readBuffer, data]);

        if (!this.readResponder) {
            throw new Error(`WARNING: Received unexpected content from remote end`);
        }

        if (this.readBuffer.length > this.desiredReadLength) {
            let subBuffer = this.readBuffer.slice(0, this.desiredReadLength);
            this.readBuffer = this.readBuffer.slice(this.desiredReadLength);
            this.readResponder(subBuffer);
            this.readResponder = null;
        }
    }

    /**
     * Takes a 13 byte buffer and decodes it into a SingleOperationMessageHeader
     * @param buffer 
     */
    private decodeSingleOperationHeader(buffer : Buffer): SingleOperationMessageHeader {
        return {
            AS_index: ntohs(buffer, 0), 
            DPI_PID_index: ntohs(buffer, 2), 
            messageSize: ntohs(buffer, 4), 
            message_number: ntohs(buffer, 6), 
            opID: buffer[8], 
            protocol_version: buffer[9], 
            result: buffer[10], 
            result_extension: ntohs(buffer, 11)
        };
    }

    private sizeOfTimestamp(timestamp : Timestamp) {
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

    async multipleOperations(message : MultipleOperationMessageInit) {
        let buf = new Buffer(10);
        let timestamp = message.timestamp || TIME_NONE;
        let timestampSize = this.sizeOfTimestamp(timestamp) ;
        let operationPayload = Buffer.concat(message.operations.map(x => this.prepareOperation(x)));
        let messageSize = 11 + timestampSize + operationPayload.length;

        buf.writeUInt16BE(OP_MULTI_OPERATION, 0);
        buf.writeUInt16BE(messageSize, 2);

        // Session-specific

        buf.writeUInt8(this.protocolVersion, 4);
        buf.writeUInt8(this.asIndex, 5);
        buf.writeUInt8(this.messageNumber++, 6);
        buf.writeUInt16BE(this.dpiPidIndex, 7);
        buf.writeUInt8(this.scte35ProtocolVersion, 9);

        // Write the header, timestamp, and individual operations
        await this.write(Buffer.concat([
            buf, 
            this.encodeTimestamp(timestamp),
            operationPayload
        ]));
    }

    private prepareOperation(operation : OperationMessage) {
        let header = new Buffer(2);
        header.writeUInt16BE(operation.opID, 0);
        header.writeUInt16BE(operation.data.length, 2);

        let data = operation.data;
        
        if (!data) {
            switch (operation.opID) {
                case OP_INJECT_SECTION: {
                    let message = <InjectSection>operation;
                    let header = new Buffer(4);
                    header.writeUInt16BE(message.SCTE35_command_contents.length, 0);
                    header.writeUInt8(message.SCTE35_protocol_version, 2);
                    header.writeUInt8(message.SCTE35_command_type, 3);

                    data = Buffer.concat([ header, message.SCTE35_command_contents ]);
                } break;
                case OP_SPLICE: {
                    let message = <Splice>operation;
                    let header = new Buffer(14);

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
                case OP_INSERT_DTMF_DESCRIPTOR: {
                    let message = <InsertDTMFDescriptor>operation;
                    let header = new Buffer(1);

                    header.writeUInt8(message.preroll, 0);

                    data = Buffer.concat([header, message.dtmf]);
                } break;
                case OP_INSERT_TIME_DESCRIPTOR: {
                    let message = <InsertTimeDescriptor>operation;
                    let header = new Buffer(12);

                    // 6-byte number, really?
                    let subbuf = new Buffer(8);
                    subbuf.writeBigUInt64BE(BigInt(message.TAI_seconds));
                    subbuf.copy(header, 0, 2);

                    header.writeUInt32BE(message.TAI_ns, 6);
                    header.writeUInt16BE(message.UTC_offset, 10);

                    data = header;
                } break;
                case OP_INSERT_AVAIL_DESCRIPTOR: {
                    let message = <InsertAvailDescriptor>operation;

                    data = new Buffer(1 + 4 * message.provider_avail_id.length);
                    data.writeUInt8(message.provider_avail_id.length, 0);
                    for (let i = 0, max = message.provider_avail_id.length; i < max; ++i) {
                        data.writeUInt32BE(message.provider_avail_id[i], 1 + i * 4);
                    }
                } break;
                case OP_INSERT_SEGMENTATION_DESCRIPTOR: {
                    let message = <InsertSegmentationDescriptor>operation;
                    data = new Buffer(18 + message.segmentation_upid.length);

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
                case OP_INSERT_DESCRIPTOR: {
                    let message = <InsertDescriptor>operation;
                    let header = new Buffer(1);
                    header.writeUInt8(message.descriptor_image.length);

                    data = Buffer.concat([ header, ...message.descriptor_image ]);
                } break;
                case OP_INSERT_TIER: {
                    let message = <InsertTier>operation;

                    data = new Buffer(2);
                    data.writeUInt16BE(message.tier, 0);
                } break;
                case OP_PROPRIETARY_COMMAND: {
                    let message = <ProprietaryCommand>operation;

                    let header = new Buffer(5);
                    header.writeUInt32BE(message.proprietary_id, 0);
                    header.writeUInt8(message.proprietary_command, 4);
                    
                    data = Buffer.concat([ header, message.proprietary_data ]);
                }
            }
        }

        return Buffer.concat([ header, data ]);
    }

    private encodeTimestamp(timestamp : Timestamp) {
        if (timestamp.time_type === 1) {
            let buffer = new Buffer(7);
            let type1 = <TimestampType1>timestamp;

            buffer[0] = 1;
            htonl(buffer, 1, type1.UTC_seconds);
            htonl(buffer, 5, type1.UTC_microseconds);
            return buffer;

        } else if (timestamp.time_type === 2) {
            let buffer = new Buffer(5);
            let type2 = <TimestampType2>timestamp;

            buffer[0] = 2;
            buffer[1] = type2.hours;
            buffer[2] = type2.minutes;
            buffer[3] = type2.seconds;
            buffer[4] = type2.frames;
            return buffer;

        } else if (timestamp.time_type === 3) {
            let buffer = new Buffer(3);
            let type3 = <TimestampType3>timestamp;

            buffer[0] = 3;
            buffer[1] = type3.GPI_number;
            buffer[2] = type3.GPI_edge;
            return buffer;
        } else {
            throw new Error(`No defined time type with ID ${timestamp.time_type}`);
        }
    }

    private async readTimestamp(): Promise<Timestamp> {
        let buf = await this.read(1);
        let time_type = buf[0];

        if (time_type === 1) {
            let moreBuf = await this.read(6);

            return <TimestampType1>{
                time_type: 1,
                UTC_seconds: ntohl(moreBuf, 0),
                UTC_microseconds: ntohl(moreBuf, 4)
            };

        } else if (time_type === 2) {
            let moreBuf = await this.read(4);
            
            return <TimestampType2>{
                time_type: 2,
                hours: moreBuf[0],
                minutes: moreBuf[1],
                seconds: moreBuf[2],
                frames: moreBuf[3],
            }

        } else if (time_type === 3) {
            let moreBuf = await this.read(2);
            
            return <TimestampType3>{
                time_type: 3,
                GPI_edge: moreBuf[0],
                GPI_number: moreBuf[1]
            };
        }

    }

    private encodeSingleOperationHeader(header : SingleOperationMessageHeaderInit, dataLength = 0): Buffer {
        let buffer = new Buffer(SINGLE_OPERATION_HEADER_SIZE);
        
        htons(buffer, 0, header.opID);

        // 8.2.2.1. Semantics of fields in single_operation_message() 
        // messageSize – The size of the entire single_operation_message() structure in bytes. 
        // COMMENT: Our message size is 13
        htons(buffer, 2, 13 + dataLength);

        // 8.2.2.1. Semantics of fields in single_operation_message() 
        // The results to the requested message. See Section 14 (Result Codes) for details on the result
        // codes. For message Usage types (as shown in the Usage column of Table 8-3) other than Basic Response
        // messages, this shall be set to 0xFFFF. 
        // COMMENT: Since this is a "basic request" (and thus not "basic response") we use 0xFFFF
        htons(buffer, 4, header.result);

        // ...
        // result_extension – This shall be set to 0xFFFF unless used to send additional result information in a
        // response message. 
        htons(buffer, 6, header.result_extension === undefined ? 0xFFFF : header.result_extension);

        // 8.2.2. Single operation message, "protocol_version"
        // An 8-bit unsigned integer field whose function is to allow, in the future, this
        // message type to carry parameters that may be structured differently than those defined in the current
        // protocol. It shall be zero (0x00). Non-zero values of protocol_version may be used by a future version
        // of this standard to indicate structurally different messages

        buffer.set(new Uint8Array([ header.protocol_version ]), 8); // protocol_version

        // 8.2.1.1. AS_index 
        // The number ranges from 0 to 255 and shall be zero if this index is not required.
        buffer.set(new Uint8Array([ header.AS_index ]), 9); // AS_index

        // 8.2.3.3. Semantics of fields in multiple_operation_message() 
        // message_number – An integer value that is used to identify an individual message. The
        // message_number variable must be unique for the life of a message. When multiple copies of the same
        // message are sent, they can be identified because they have the same message_number.
        buffer.set(new Uint8Array([ header.message_number ]), 10);

        // 8.2.1.2. DPI_PID_index 
        // DPI_PID_index specifies the index to the DPI PID which will carry the resulting splice_info_sections.
        // The number ranges from 0 to 65535. DPI_PID_index shall be zero if not required by the system
        // architecture. 
        // COMMENT: I think we send zero for DPI_PID_index, though TYT has unique_program_id of 22211

        htons(buffer, 11, 0);

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

        let promiseResolve : (buffer : Buffer) => void, promiseReject : (err) => void;
        let promise = new Promise<Buffer>((resolve, reject) => (promiseResolve = resolve, promiseReject = reject));
        this.readResponder = promiseResolve;
        return promise;
    }

    private async readSingleOperation(): Promise<SingleOperationMessage> {
        let headerBuf = await this.read(SINGLE_OPERATION_HEADER_SIZE);
        let responseHeader = this.decodeSingleOperationHeader(headerBuf);
        let payloadSize = responseHeader.messageSize - SINGLE_OPERATION_HEADER_SIZE;
        let payload = await this.read(payloadSize);

        return Object.assign(responseHeader, { data: payload });
    }

    async init() {
        await this.writeSingleOperation({
            opID: OP_INIT_REQUEST,
            result: 0xFFFF,
            AS_index: this.asIndex,
            DPI_PID_index: this.dpiPidIndex,
            message_number: this.messageNumber++,
            protocol_version: 0
        });

        let response = this.readSingleOperation();
        // TODO: check response.result
    }

    private async writeSingleOperation(header : SingleOperationMessageHeaderInit, data? : Buffer) {
        await this.write(this.encodeSingleOperationHeader(header, data ? data.length : 0));
        if (data)
            await this.write(data);
    }

    async alive() {
        let epoch = new Date('1980-01-06T00:00:00Z').getTime();
        let elapsed = Date.now() - epoch;

        let seconds = Math.floor(elapsed / 1000);
        let microseconds = (elapsed - seconds) * 1000;

        await this.writeSingleOperation({
            opID: OP_ALIVE_REQUEST,
            AS_index: this.asIndex,
            DPI_PID_index: this.dpiPidIndex,
            message_number: this.messageNumber++,
            protocol_version: 0,
            result: 0xFFFF
        }, this.encodeTime(seconds, microseconds));

        let response = await this.readSingleOperation();
        // we dont care about the response
    }

    private encodeTime(seconds : number, microseconds : number): Buffer {
        let buf = new Buffer(8);
        htonl(buf, 0, seconds);
        htonl(buf, 4, microseconds);
        return buf;
    }
}