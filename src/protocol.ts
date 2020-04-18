
export const SINGLE_OPERATION_HEADER_SIZE = 13;
export const OP_INIT_REQUEST = 0x0001;
export const OP_INIT_RESPONSE = 0x0002;
export const OP_ALIVE_REQUEST = 0x0003;
export const OP_ALIVE_RESPONSE = 0x0004;
export const OP_INJECT_SECTION = 0x0100;
export const OP_SPLICE = 0x0101;
export const OP_SPLICE_NULL = 0x0102;
export const OP_START_SCHEDULE_DOWNLOAD = 0x0103;
export const OP_TIME_SIGNAL_REQUEST = 0x0104;
export const OP_TRANSMIT_SCHEDULE = 0x0105;
export const OP_COMPONENT_MODE_DPI = 0x0106;
export const OP_ENCRYPTED_DPI = 0x0107;
export const OP_INSERT_DESCRIPTOR = 0x0108;
export const OP_INSERT_DTMF_DESCRIPTOR = 0x0109;
export const OP_INSERT_AVAIL_DESCRIPTOR = 0x010A;
export const OP_INSERT_SEGMENTATION_DESCRIPTOR = 0x010B;
export const OP_PROPRIETARY_COMMAND = 0x010C;
export const OP_SCHEDULE_COMPONENT_MODE = 0x010D;
export const OP_SCHEDULE_DEFINITION = 0x010E;
export const OP_INSERT_TIER = 0x010F;
export const OP_INSERT_TIME_DESCRIPTOR = 0x0110;
export const OP_DELETE_CONTROLWORD = 0x0300;
export const OP_UPDATE_CONTROLWORD = 0x0301;
export const OP_MULTI_OPERATION = 0xFFFF;

export const TIME_TYPE_NONE = 0;
export const TIME_TYPE_UTC = 1;
export const TIME_TYPE_SMPTE_VITC = 2;
export const TIME_TYPE_GPI = 3;

export const SPLICE_START_NORMAL = 1;
export const SPLICE_START_IMMEDIATE = 2;
export const SPLICE_END_NORMAL = 3;
export const SPLICE_END_IMMEDIATE = 4;
export const SPLICE_CANCEL = 5;

export const TIME_NONE = { time_type: <0>TIME_TYPE_NONE };

export interface SingleOperationMessageHeaderInit {
    opID : number;
    result : number;
    result_extension? : number;
    protocol_version : number;
    AS_index : number;
    message_number : number;
    DPI_PID_index : number;
}

export interface SingleOperationMessageHeader extends SingleOperationMessageHeaderInit {
    opID : number;
    messageSize : number;

    result : number;
    result_extension? : number;

    protocol_version : number;
    AS_index : number;
    message_number : number;
    DPI_PID_index : number;
}

export interface SingleOperationMessage extends SingleOperationMessageHeader {
    data : Buffer;
}

export interface Timestamp {
    time_type : 0 | 1 | 2 | 3;
}

export interface TimestampType1 extends Timestamp {
    time_type : 1;
    UTC_seconds : number;
    UTC_microseconds : number;
}

export interface TimestampType2 extends Timestamp {
    time_type : 2;
    hours : number;
    minutes : number;
    seconds : number;
    frames : number;
}

export interface TimestampType3 extends Timestamp {
    time_type : 3;
    GPI_number : number;
    GPI_edge : number;
}

export interface OperationMessage {
    opID : number;
    data? : Buffer;
}

export interface CustomOperationMessage extends OperationMessage {
    opID : number;
    data? : Buffer;
}

export interface InjectSection extends OperationMessage {
    opID : 0x0100;
    SCTE35_protocol_version : number; // 1 uimsbf
    SCTE35_command_type : number; // 1 uimsbf
    SCTE35_command_contents : Buffer;
}

export interface Splice extends OperationMessage {
    /**
     * Use SCTE104.OP_SPLICE (0x0101)
     */
    opID : 0x0101;

    /**
     * Use one of SCTE104.SPLICE_START_* or SCTE104.SPLICE_END_*
     * (1-byte unsigned integer, min=0, max=255)
     */
    splice_insert_type : number; // 1 uimsbf

    /**
     * Specify an ID for this splice event. Must be unique when 
     * the event is submitted, and remain unique until the event is 
     * processed according to the specified timestamp/GPI trigger.
     */
    splice_event_id : number; // 4 uimsbf

    /**
     * SHOULD be the unique identifier of the viewing event that this splice 
     * event is designated for.
     */
    unique_program_id : number; // 2 uimsbf

    /**
     * Specify the pre-roll time for this splice event in milliseconds.
     * SCTE 104 specifies that pre-roll time SHALL be no less 
     * than 4000 milliseconds in keeping with the advice from SCTE 67
     */
    pre_roll_time : number; // 2 uimsbf
    break_duration : number; // 2 uimsbf
    avail_num : number; // 1 uimsbf
    avails_expected : number; // 1 uimsbf
    auto_return_flag : number; // 1 uimsbf 
}

export interface InsertDescriptor extends OperationMessage {
    opID : 0x0108;
    descriptor_image : Buffer[];
}

export interface InsertDTMFDescriptor extends OperationMessage {
    opID : 0x0109;
    preroll : number;
    dtmf : Buffer;
}

export interface InsertSegmentationDescriptor extends OperationMessage {
    opID : 0x010B;
    segmentation_event_id : number; // 4 uimsbf
    segmentation_event_cancel_indicator : number; // 1 uimsbf
    duration : number; // 2 uimsbf
    segmentation_upid_type : number; // 1 uimsbf
    segmentation_upid : number[]; // varies uimsbf
    segmentation_type_id : number; // 1 uimsbf
    segment_num : number; // 1 uimsbf
    segments_expected : number; // 1 uimsbf
    duration_extension_frames : number; // 1 uimsbf
    delivery_not_restricted_flag : number; // 1 uimsbf
    web_delivery_allowed_flag : number; // 1 uimsbf
    no_regional_blackout_flag : number; // 1 uimsbf
    archive_allowed_flag : number; // 1 uimsbf
    device_restrictions : number; // 1 uimsbf  
}

export interface ProprietaryCommand extends OperationMessage {
    opID : 0x010C;
    proprietary_id : number;
    proprietary_command : number;
    proprietary_data : Buffer;
}

export interface InsertAvailDescriptor extends OperationMessage {
    opID : 0x010A;
    provider_avail_id : number[];
}

export interface InsertTier extends OperationMessage {
    opID : 0x010F;
    tier : number;
}

export interface InsertTimeDescriptor extends OperationMessage {
    opID : 0x0110;
    TAI_seconds : number; // 6 uimsbf
    TAI_ns : number; // 4 uimsbf
    UTC_offset : number; // 2 uimsbf
}

export interface MultipleOperationMessage {
    reserved : number;
    messageSize : number;

    protocol_version : number;
    AS_index : number;
    message_number : number;
    DPI_PID_index : number;

    SCTE35_protocol_version : number;
    timestamp : Timestamp;
    operations : OperationMessage[];
}

export interface MultipleOperationMessageInit {
    timestamp? : Timestamp;
    operations : OperationMessage[];
}
